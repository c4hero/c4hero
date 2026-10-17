import type { Node, ReactFlowInstance } from '@xyflow/react'
import type { Workspace } from '@/types/model'
import type { ActiveCamera } from '@/lib/activeCamera'
import { getActiveView } from '@/store/workspace-selectors'
import { useWorkspaceStore } from '@/store/workspace'
import { getCanvasFitInsets, fitViewportFor } from '@/lib/fitViewport'
import { translateSubtree, type Box, type MapLayout, type MapNode } from './layout'
import { clamp, easeInOut, flightPath, frameBox, stepCamera, stepGlide, stepReveal, revealFor, zoomAt, zoomBounds, TUNING, type Camera, type Point, type ZoomBounds } from './motion'

/** A timed camera move along the zoom-and-pan path. The destination is
 * re-measured every frame, so late card measurements or the inspector opening
 * bend the path smoothly instead of restarting it. */
interface Flight { from: Camera; start: number; duration: number; destination: () => Camera; select?: string; done?: boolean }

/** The free canvas inside the host, in host coordinates. */
function freeArea(host: HTMLElement): Box {
  const rect = host.getBoundingClientRect(), insets = getCanvasFitInsets(rect)
  return { x: insets.left, y: insets.top, width: Math.max(1, rect.width - insets.left - insets.right), height: Math.max(1, rect.height - insets.top - insets.bottom) }
}

function fitCamera(host: HTMLElement, layout: MapLayout): Camera {
  const roots = layout.roots.length ? layout.roots : layout.nodes
  const x = Math.min(...roots.map(n => n.x)), y = Math.min(...roots.map(n => n.y))
  const width = Math.max(1, Math.max(...roots.map(n => n.x + n.width)) - x), height = Math.max(1, Math.max(...roots.map(n => n.y + n.height)) - y)
  return fitViewportFor({ centerX: x + width / 2, centerY: y + height / 2, width, height }, host.getBoundingClientRect())
}

/** How far the camera may zoom for this layout in this host. */
export function cameraBounds(host: HTMLElement, layout: MapLayout): ZoomBounds {
  return zoomBounds(layout.nodes, fitCamera(host, layout).zoom)
}

function depth(node: MapNode) {
  let result = 0
  for (let p = node.parent; p; p = p.parent) result++
  return result
}

/** Motion and reveal state only. React Flow owns all rendering and editing. */
export class SemanticCamera implements ActiveCamera {
  reveal = new Map<string, number>()
  layoutState: MapLayout
  private frame = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private previousTime = 0
  private lastInput = -Infinity
  private zoomHintTimer: ReturnType<typeof setTimeout> | undefined
  private zooming = false
  private observedZoom: number
  private target: Camera | null = null
  private anchor?: { world: Point; screen: Point }
  private velocity: Point = { x: 0, y: 0 }
  private gliding = false
  private previousMove?: { camera: Camera; time: number }
  private flight?: Flight
  private focusedId?: string
  /** Cards about to open. Their contents mount and measure invisibly ahead of
   * the crossfade, so it never waits on a burst of new cards. */
  near = new Set<string>()
  private disposed = false
  private pinching = false
  private unsubscribe: () => void
  private media = matchMedia('(prefers-reduced-motion: reduce)')
  private host: HTMLElement
  private rf: ReactFlowInstance
  private changed: () => void
  constructor(host: HTMLElement, rf: ReactFlowInstance, layout: MapLayout, changed: () => void) {
    this.host = host; this.rf = rf; this.changed = changed
    this.layoutState = layout
    this.observedZoom = rf.getZoom()
    this.unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
      if (this.focusedId && !state.selectedElementIds.includes(this.focusedId)) this.interrupt()
      this.refreshZoomHint()
      if (previous.selectedElementIds.length && !state.selectedElementIds.length) this.input()
    })
    host.addEventListener('wheel', this.wheel, { passive: false, capture: true })
    host.addEventListener('pointerdown', this.interrupt, { capture: true })
    this.media.addEventListener('change', this.interrupt)
    if (import.meta.env.DEV) Object.assign(host, { __semantic: this })
    // Reveal from the existing viewport on activation, without moving the camera
    // or requiring a new gesture. The idle rule matches a settled zoom gesture.
    this.wake()
  }
  update(layout: MapLayout) {
    const previous = this.focusedId ? this.layoutState.byId.get(this.focusedId) : undefined
    const next = this.focusedId ? layout.byId.get(this.focusedId) : undefined
    this.layoutState = layout
    // Revealing descendants measures their native cards and can refit the
    // nested graph after focus settled. Keep the requested card in frame; a
    // flight still under way already follows the new geometry.
    if (!this.flight && previous && next && (['x', 'y', 'width', 'height'] as const).some(key => Math.abs(previous[key] - next[key]) > .000001)) this.frameNode(next, true)
    for (const id of this.reveal.keys()) if (!layout.byId.has(id)) this.reveal.delete(id)
    for (const id of this.near) if (!layout.byId.has(id)) this.near.delete(id)
    // Native fitting and intrinsic card measurements can finish after mount.
    this.wake()
  }
  private refreshZoomHint = () => {
    const state = useWorkspaceStore.getState()
    const show = this.zooming && !state.selectedElementIds.length && !state.selectedRelationshipId && !state.selectedGroupId
    if (show) this.host.dataset.zoomActive = 'true'
    else delete this.host.dataset.zoomActive
  }
  private observeZoom(zoom = this.rf.getZoom()) {
    if (Math.abs(zoom - this.observedZoom) < .000001) return
    this.observedZoom = zoom
    this.zooming = true
    this.refreshZoomHint()
    clearTimeout(this.zoomHintTimer)
    this.zoomHintTimer = setTimeout(() => {
      this.zooming = false
      this.refreshZoomHint()
    }, TUNING.idleMs)
  }
  private wake = () => {
    if (this.disposed || this.frame) return
    this.previousTime = performance.now()
    this.frame = requestAnimationFrame(this.tick)
  }
  private input() {
    this.lastInput = performance.now()
    clearTimeout(this.timer)
    this.timer = setTimeout(this.wake, TUNING.idleMs + 1)
    this.wake()
  }
  interrupt = () => {
    clearTimeout(this.zoomHintTimer); this.zooming = false; this.refreshZoomHint()
    this.focusedId = undefined
    this.flight = undefined
    this.pinching = false
    this.target = null; this.anchor = undefined; this.gliding = false
    this.velocity = { x: 0, y: 0 }; this.previousMove = undefined
  }
  private wheel = (event: WheelEvent) => {
    if ((event.target as HTMLElement).closest('input, textarea, select, [data-canvas-chrome]')) return
    event.preventDefault(); event.stopPropagation()
    this.focusedId = undefined
    this.flight = undefined
    this.gliding = false
    const rect = this.host.getBoundingClientRect(), current = this.rf.getViewport()
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1)
    const zoom = zoomAt(this.target ?? current, Math.exp(-Math.max(-400, Math.min(400, delta)) * (event.ctrlKey ? .008 : .002)), screen, this.bounds()).zoom
    this.anchor = { screen, world: { x: (screen.x - current.x) / current.zoom, y: (screen.y - current.y) / current.zoom } }
    this.target = { x: screen.x - this.anchor.world.x * zoom, y: screen.y - this.anchor.world.y * zoom, zoom }
    this.input()
  }
  onMove(event: MouseEvent | TouchEvent | null, viewport?: Camera) {
    this.observeZoom(viewport?.zoom)
    if (!event) return // Programmatic animation frames aren't a new gesture.
    this.focusedId = undefined
    if ('touches' in event && event.touches.length > 1) this.pinching = true
    const camera = viewport ?? this.rf.getViewport(), time = event.timeStamp
    if (this.previousMove) {
      const dt = Math.max(1, time - this.previousMove.time)
      this.velocity = { x: (camera.x - this.previousMove.camera.x) / dt, y: (camera.y - this.previousMove.camera.y) / dt }
    }
    this.previousMove = { camera, time }
    this.target = null; this.input()
  }
  onMoveEnd(event: MouseEvent | TouchEvent | null) {
    if (!event) return
    // React Flow defers its end callback. Judge the gesture at release, not
    // after rendering or another busy task delayed that callback.
    const recent = this.previousMove && event.timeStamp - this.previousMove.time < 100
    this.gliding = !!recent && !this.pinching && !this.media.matches && Math.hypot(this.velocity.x, this.velocity.y) > .015
    this.input()
  }
  private tick = (now: number) => {
    this.frame = 0
    if (this.disposed) return
    const dt = Math.min(64, Math.max(1, now - this.previousTime)); this.previousTime = now
    let camera = this.rf.getViewport(), moving = false
    if (this.gliding) {
      const glide = stepGlide(this.velocity, dt, this.media.matches)
      this.velocity = glide.velocity; this.gliding = glide.moving
      camera = { ...camera, x: camera.x + glide.delta.x, y: camera.y + glide.delta.y }
      void this.rf.setViewport(camera)
      moving = this.gliding; this.lastInput = now
      if (!moving) this.timer = setTimeout(this.wake, TUNING.idleMs + 1)
    }
    if (this.target) {
      camera = stepCamera(camera, this.target, dt, this.media.matches, this.anchor)
      void this.rf.setViewport(camera)
      moving ||= Math.abs(camera.zoom - this.target.zoom) > .00001 || Math.hypot(camera.x - this.target.x, camera.y - this.target.y) > .01
      if (!moving) { this.target = null; this.anchor = undefined }
    }
    const flight = this.flight
    if (flight) {
      const destination = flight.destination()
      if (!flight.done) {
        const rect = this.host.getBoundingClientRect(), progress = this.media.matches ? 1 : clamp((now - flight.start) / flight.duration, 0, 1)
        camera = flightPath(flight.from, destination, { x: rect.width / 2, y: rect.height / 2 }, Math.max(1, rect.width)).at(easeInOut(progress))
        flight.done = progress >= 1
        void this.rf.setViewport(camera)
        moving = true
      } else if (Math.abs(Math.log(destination.zoom / camera.zoom)) > .0001 || Math.hypot(destination.x - camera.x, destination.y - camera.y) > .05) {
        // Chrome that opens with the selection, such as the inspector, can
        // still shrink the free canvas after arrival. Ease into the new frame.
        const before = camera
        void this.rf.setViewport(stepCamera(camera, destination, dt, this.media.matches))
        // Stop if the viewport refuses to move, such as at a zoom limit.
        camera = this.rf.getViewport()
        moving = camera.zoom !== before.zoom || camera.x !== before.x || camera.y !== before.y
      }
    }
    this.observeZoom(camera.zoom)
    const area = freeArea(this.host)
    const state = useWorkspaceStore.getState(), locked = state.selectedElementIds.length > 0 && !flight
    let changed = false
    for (const node of this.layoutState.nodes) {
      if (!node.children.length) continue
      // A focus flight opens each level as the camera reaches it, so the
      // dive reads as one continuous motion rather than a jump cut.
      const raw = revealFor(node, camera.zoom, area.width, area.height)
      const previous = this.reveal.get(node.id) ?? 0
      const next = stepReveal(previous, raw, now - this.lastInput >= TUNING.idleMs || !!flight, dt, this.media.matches, locked)
      if (previous !== next) { this.reveal.set(node.id, next); changed = true }
      const near = next > 0 || revealFor(node, camera.zoom * TUNING.premount, area.width, area.height) > 0
      if (near !== this.near.has(node.id)) { if (near) this.near.add(node.id); else this.near.delete(node.id); changed = true }
    }
    if (changed) this.changed()
    if (moving || changed) this.frame = requestAnimationFrame(this.tick)
    else if (flight) {
      this.flight = undefined
      if (flight.select && !state.selectedElementIds.includes(flight.select)) state.selectElements([flight.select])
    }
  }
  getViewport() { return this.rf.getViewport() }
  getZoom() { return this.rf.getZoom() }
  getNodes(): Node[] { return this.rf.getNodes().filter(n => n.data.element && !n.hidden && Number(n.style?.opacity ?? 1) > .5) }
  flowToScreenPosition(point: Point) { return this.rf.flowToScreenPosition(point) }
  /** Zoom limits for this layout, never excluding where the camera already is. */
  bounds(): ZoomBounds {
    const limits = cameraBounds(this.host, this.layoutState), zoom = this.rf.getZoom()
    return { min: Math.min(limits.min, zoom), max: Math.max(limits.max, zoom) }
  }
  zoomBy(factor: number) {
    const r = this.host.getBoundingClientRect(), current = this.rf.getViewport(), screen = { x: r.width / 2, y: r.height / 2 }
    this.interrupt()
    this.anchor = { screen, world: { x: (screen.x - current.x) / current.zoom, y: (screen.y - current.y) / current.zoom } }
    this.target = zoomAt(current, factor, screen, this.bounds()); this.input()
  }
  pan(dx: number, dy: number) {
    this.interrupt()
    const c = this.rf.getViewport(); this.target = { ...c, x: c.x + dx, y: c.y + dy }; this.input()
  }
  fit() {
    this.interrupt()
    this.fly(() => fitCamera(this.host, this.layoutState))
  }
  /** Select a card and fly to it, opening every card around it on the way. */
  focus(id: string) {
    const node = this.layoutState.byId.get(id)
    if (!node) return
    useWorkspaceStore.getState().selectElements([id])
    this.frameNode(node, true)
  }
  /** Clear the selection first; with nothing selected, step out one level. */
  escape() {
    const state = useWorkspaceStore.getState()
    if (state.selectedElementIds.length || state.selectedRelationshipId || state.selectedGroupId) { state.clearSelection(); this.input(); return }
    // Zoomed in past the open card around the view: back out to all of it.
    // Already framing it: go up to the card that contains it, then the map.
    const level = this.currentLevel()
    if (level && this.rf.getZoom() > frameBox(level, freeArea(this.host)).zoom * 1.15) this.frameNode(level, false)
    else if (level?.parent) this.frameNode(level.parent, false)
    else this.fit()
  }
  /** The innermost open card under the centre of the free canvas. */
  private currentLevel() {
    const area = freeArea(this.host), camera = this.rf.getViewport()
    const x = (area.x + area.width / 2 - camera.x) / camera.zoom, y = (area.y + area.height / 2 - camera.y) / camera.zoom
    let level: MapNode | undefined
    for (const n of this.layoutState.nodes) {
      if (!n.children.length || (this.reveal.get(n.id) ?? 0) < .5) continue
      if (x < n.x || x > n.x + n.width || y < n.y || y > n.y + n.height) continue
      if (!level || depth(n) > depth(level)) level = n
    }
    return level
  }
  private frameNode(node: MapNode, select: boolean) {
    const id = node.id
    this.interrupt()
    if (select) this.focusedId = id
    const fallback = this.rf.getViewport()
    this.fly(() => {
      const n = this.layoutState.byId.get(id)
      return n ? frameBox(n, freeArea(this.host)) : fallback
    }, select ? id : undefined)
  }
  private fly(destination: () => Camera, select?: string) {
    const from = this.rf.getViewport(), rect = this.host.getBoundingClientRect()
    const duration = flightPath(from, destination(), { x: rect.width / 2, y: rect.height / 2 }, Math.max(1, rect.width)).duration
    this.flight = { from, start: performance.now(), duration, destination, select }
    this.input()
  }
  layout(): NonNullable<Workspace['exploreLayout']> {
    const s = useWorkspaceStore.getState()
    const existing = s.workspace && s.activeViewKey ? getActiveView(s.workspace, s.activeViewKey)?.exploreLayout : undefined
    return { ...existing, positionSpace: 'parent-body', elements: { ...existing?.elements, ...Object.fromEntries(this.layoutState.nodes.filter(n => n.parent).map(n => {
      const p = n.parent!, padding = 14 * p.scale, header = (p.headerHeight ?? 48) * p.scale
      return [n.id, { ...existing?.elements?.[n.id], pinned: true,
        x: (n.x - p.x - padding) / Math.max(.001, p.width - 2 * padding - n.width),
        y: (n.y - p.y - header) / Math.max(.001, p.height - header - padding - n.height),
      }]
    })) } }
  }
  moveNodes(positions: { id: string; x: number; y: number }[]) {
    const state = useWorkspaceStore.getState()
    const roots = positions.filter(p => !this.layoutState.byId.get(p.id)?.parent)
    if (roots.length) state.updateNodePositions(roots)
    let nested = false
    for (const p of positions) {
      const node = this.layoutState.byId.get(p.id)
      if (!node?.parent || this.isLocked(p.id)) continue
      this.drag(p.id, p); nested = true
    }
    if (nested) {
      state.updateExploreLayout(this.layout())
      this.changed()
    }
  }
  drag(id: string, position: Point) {
    const n = this.layoutState.byId.get(id)
    if (!n?.parent || this.isLocked(id)) return
    const p = n.parent, padding = 14 * p.scale
    const x = Math.max(p.x + padding, Math.min(position.x, p.x + p.width - padding - n.width))
    const y = Math.max(p.y + (p.headerHeight ?? 48) * p.scale, Math.min(position.y, p.y + p.height - padding - n.height))
    translateSubtree(n, x - n.x, y - n.y); this.changed()
  }
  private isLocked(id: string) {
    const s = useWorkspaceStore.getState()
    const v = s.workspace && s.activeViewKey ? getActiveView(s.workspace, s.activeViewKey) : undefined
    return !!(v?.locked || v?.exploreLayout?.locked || v?.exploreLayout?.elements?.[id]?.locked)
  }
  dispose() {
    clearTimeout(this.zoomHintTimer); delete this.host.dataset.zoomActive
    this.disposed = true; cancelAnimationFrame(this.frame); this.flight = undefined; clearTimeout(this.timer)
    this.unsubscribe()
    this.host.removeEventListener('wheel', this.wheel, true)
    this.host.removeEventListener('pointerdown', this.interrupt, true)
    this.media.removeEventListener('change', this.interrupt)
    delete (this.host as HTMLElement & { __semantic?: SemanticCamera }).__semantic
  }
}
