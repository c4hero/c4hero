import type { Node, ReactFlowInstance } from '@xyflow/react'
import type { Workspace } from '@/types/model'
import type { ActiveCamera } from '@/lib/activeCamera'
import { getActiveView } from '@/store/workspace-selectors'
import { useWorkspaceStore } from '@/store/workspace'
import { getCanvasFitInsets, fitNodesToViewport } from '@/lib/fitViewport'
import { translateSubtree, type MapLayout } from './layout'
import { stepCamera, stepGlide, stepReveal, revealFor, zoomAt, TUNING, type Camera, type Point } from './motion'

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
  private focusTarget?: string
  private focusAncestors = new Set<string>()
  private disposed = false
  private pinching = false
  private focusFrame = 0
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
    this.layoutState = layout
    for (const id of this.reveal.keys()) if (!layout.byId.has(id)) this.reveal.delete(id)
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
    cancelAnimationFrame(this.focusFrame)
    clearTimeout(this.zoomHintTimer); this.zooming = false; this.refreshZoomHint()
    this.focusTarget = undefined; this.focusAncestors.clear()
    this.pinching = false
    this.target = null; this.anchor = undefined; this.gliding = false
    this.velocity = { x: 0, y: 0 }; this.previousMove = undefined
  }
  private wheel = (event: WheelEvent) => {
    if ((event.target as HTMLElement).closest('input, textarea, select, [data-canvas-chrome]')) return
    event.preventDefault(); event.stopPropagation()
    this.gliding = false
    const rect = this.host.getBoundingClientRect(), current = this.rf.getViewport()
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1)
    const zoom = zoomAt(this.target ?? current, Math.exp(-Math.max(-400, Math.min(400, delta)) * (event.ctrlKey ? .008 : .002)), screen).zoom
    this.anchor = { screen, world: { x: (screen.x - current.x) / current.zoom, y: (screen.y - current.y) / current.zoom } }
    this.target = { x: screen.x - this.anchor.world.x * zoom, y: screen.y - this.anchor.world.y * zoom, zoom }
    this.input()
  }
  onMove(event: MouseEvent | TouchEvent | null, viewport?: Camera) {
    this.observeZoom(viewport?.zoom)
    if (!event) return // Programmatic animation frames aren't a new gesture.
    if ('touches' in event && event.touches.length > 1) this.pinching = true
    const camera = this.rf.getViewport(), time = performance.now()
    if (this.previousMove) {
      const dt = Math.max(1, time - this.previousMove.time)
      this.velocity = { x: (camera.x - this.previousMove.camera.x) / dt, y: (camera.y - this.previousMove.camera.y) / dt }
    }
    this.previousMove = { camera, time }
    this.target = null; this.input()
  }
  onMoveEnd(event: MouseEvent | TouchEvent | null) {
    if (!event) return
    const recent = this.previousMove && performance.now() - this.previousMove.time < 100
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
    this.observeZoom(camera.zoom)
    const rect = this.host.getBoundingClientRect(), insets = getCanvasFitInsets(rect)
    const state = useWorkspaceStore.getState(), locked = state.selectedElementIds.length > 0 && !this.focusTarget
    let changed = false
    for (const node of this.layoutState.nodes) {
      if (!node.children.length) continue
      const raw = this.focusAncestors.has(node.id) ? 1 : revealFor(node, camera.zoom, rect.width - insets.left - insets.right, rect.height - insets.top - insets.bottom)
      const previous = this.reveal.get(node.id) ?? 0
      const next = stepReveal(previous, raw, now - this.lastInput >= TUNING.idleMs || !!this.focusTarget, dt, this.media.matches, locked)
      if (previous !== next) { this.reveal.set(node.id, next); changed = true }
    }
    if (changed) this.changed()
    if (moving || changed) this.frame = requestAnimationFrame(this.tick)
    else if (this.focusTarget) {
      const id = this.focusTarget; this.focusTarget = undefined; this.focusAncestors.clear()
      state.selectElements([id])
    }
  }
  getViewport() { return this.rf.getViewport() }
  getZoom() { return this.rf.getZoom() }
  getNodes(): Node[] { return this.rf.getNodes().filter(n => n.data.element && !n.hidden && Number(n.style?.opacity ?? 1) > .5) }
  flowToScreenPosition(point: Point) { return this.rf.flowToScreenPosition(point) }
  zoomBy(factor: number) {
    const r = this.host.getBoundingClientRect(), current = this.rf.getViewport(), screen = { x: r.width / 2, y: r.height / 2 }
    this.interrupt()
    this.anchor = { screen, world: { x: (screen.x - current.x) / current.zoom, y: (screen.y - current.y) / current.zoom } }
    this.target = zoomAt(current, factor, screen); this.input()
  }
  pan(dx: number, dy: number) {
    this.interrupt()
    const c = this.rf.getViewport(); this.target = { ...c, x: c.x + dx, y: c.y + dy }; this.input()
  }
  fit() {
    this.interrupt()
    const ids = new Set(this.layoutState.roots.map(n => n.id))
    fitNodesToViewport(this.rf, this.rf.getNodes().filter(n => ids.has(n.id)), { duration: this.media.matches ? 0 : 300 })
  }
  focus(id: string) {
    const node = this.layoutState.byId.get(id)
    if (!node) return
    useWorkspaceStore.getState().selectElements([id])
    this.interrupt(); this.focusTarget = id; this.focusAncestors.clear()
    for (let p = node.parent; p; p = p.parent) this.focusAncestors.add(p.id)
    // Let selection mount the inspector before measuring the available canvas.
    this.focusFrame = requestAnimationFrame(() => {
    const rect = this.host.getBoundingClientRect(), insets = getCanvasFitInsets(rect)
    const width = rect.width - insets.left - insets.right, height = rect.height - insets.top - insets.bottom
    const zoom = Math.min(10000, Math.min(width * .7 / node.width, height * .7 / node.height))
    this.target = { x: insets.left + width / 2 - (node.x + node.width / 2) * zoom, y: insets.top + height / 2 - (node.y + node.height / 2) * zoom, zoom }
    this.input()
    })
  }
  escape() { useWorkspaceStore.getState().clearSelection(); this.input() }
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
      const ws = state.workspace!, view = [...ws.views.systemLandscapeViews, ...ws.views.systemContextViews, ...ws.views.containerViews, ...ws.views.componentViews].find(v => v.key === state.activeViewKey)
      state.updateExploreLayout({ ...view?.exploreLayout, elements: { ...view?.exploreLayout?.elements, ...this.layout().elements } })
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
    this.disposed = true; cancelAnimationFrame(this.frame); cancelAnimationFrame(this.focusFrame); clearTimeout(this.timer)
    this.unsubscribe()
    this.host.removeEventListener('wheel', this.wheel, true)
    this.host.removeEventListener('pointerdown', this.interrupt, true)
    this.media.removeEventListener('change', this.interrupt)
    delete (this.host as HTMLElement & { __semantic?: SemanticCamera }).__semantic
  }
}
