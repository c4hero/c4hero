import { useSettingsStore } from '@/store/settings'
import { useWorkspaceStore } from '@/store/workspace'
import type { Node } from '@xyflow/react'
import { isLightCanvasTheme, THEMES, THEME_CANVAS_BACKGROUNDS, THEME_EDGE_COLORS, THEME_SELECTION_COLORS } from '@/lib/themes'
import { buildDiagramStyleIndex, getElementStyle } from '@/lib/elementStyles'
import type { Workspace } from '@/types/model'
import { getCanvasFitInsets } from '@/lib/fitViewport'
import { isHighlighted, highlightActive, type HighlightFilters } from '@/lib/highlight'
import { buildLayout, geometryKey, connectionsFor, translateSubtree, contains, type MapNode, type Box } from './layout'
import { drawMap, groupBoxes, type Portal, type Palette, type RenderState } from './renderer'
import { loadExploreCamera, saveExploreCamera } from './persistence'
import { zoomAt, stepCamera, stepReveal, stepGlide, revealFor, visibility, screenBox, TUNING, type Camera, type Point } from './motion'
import type { ActiveCamera } from '@/lib/activeCamera'
import { mapSVG } from './svg'

interface Callbacks { select(id: string | null, additive?: boolean): void; portal(portal: Portal | null, pinned: boolean): void; zoom(zoom: number): void; clearFilters(): void }
const emptyFilters: HighlightFilters = { tags: [], statuses: [], techs: [], teams: [] }
export class ExploreController implements ActiveCamera {
  readonly initialLayoutMs: number
  readonly frameWork: number[] = []
  readonly state: RenderState
  private key: string
  private target: Camera
  private frame = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private lastTime = 0
  private lastInput = -Infinity
  private pointers = new Map<number, Point>()
  private gestureStart: Point | null = null
  private moved = false
  private velocity: Point = { x: 0, y: 0 }
  private panTime = 0
  private gliding = false
  private spaceHeld = false
  private drag: { start: Point; nodes: { node: MapNode; x: number; y: number }[] } | null = null
  private connecting: { source: MapNode; point: Point; relationshipId?: string; reverse?: boolean } | null = null
  private groupPressed: string | null = null
  private selectionBox: { start: Point; end: Point } | null = null
  private minimap: HTMLCanvasElement | null = null
  private minimapTimer: ReturnType<typeof setTimeout> | undefined
  private width = 1
  private height = 1
  private observer: ResizeObserver
  private media = matchMedia('(prefers-reduced-motion: reduce)')
  private themeObserver: MutationObserver
  private unsubscribeTheme: () => void
  private workspace: Workspace
  private portals: Portal[] = []
  private hoveredPortal: string | null = null
  private pinned = new Set<string>()
  private focusTarget: string | null = null
  private focusAncestors = new Set<string>()
  private anchor?: { screen: Point; world: Point }
  private palette: Palette
  private disposed = false
  private filters = emptyFilters
  private ctx: CanvasRenderingContext2D
  private canvas: HTMLCanvasElement
  private identity: string
  private callbacks: Callbacks
  constructor(canvas: HTMLCanvasElement, workspace: Workspace, identity: string, callbacks: Callbacks) {
    this.workspace = workspace
    this.canvas = canvas; this.identity = identity; this.callbacks = callbacks
    if (import.meta.env.DEV) Object.assign(canvas, { __explore: this })
    this.ctx = canvas.getContext('2d')!
    const layoutStart = performance.now()
    const layout = buildLayout(workspace)
    this.initialLayoutMs = performance.now() - layoutStart
    this.key = geometryKey(workspace)
    this.target = loadExploreCamera(identity) ?? { x: 0, y: 0, zoom: 1 }
    this.state = { layout, ...connectionsFor(layout, workspace.model.relationships), camera: { ...this.target }, reveal: new Map(), selected: new Set(), hovered: null, portalAmounts: new Map(), matches: new Set(), filtering: false, styles: new Map() }
    this.state.groups = workspace.model.groups
    this.state.relationshipStyles = workspace.views.configuration.styles.relationships
    this.refreshStyles()
    this.palette = this.readPalette()
    this.unsubscribeTheme = useSettingsStore.subscribe((s, previous) => { if (s.colorTheme !== previous.colorTheme) { this.refreshStyles(); this.palette = this.readPalette() } this.wake() })
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(canvas)
    this.themeObserver = new MutationObserver(() => { this.palette = this.readPalette(); this.wake() })
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    canvas.addEventListener('wheel', this.wheel, { passive: false })
    canvas.addEventListener('pointerdown', this.down)
    canvas.addEventListener('pointermove', this.move)
    canvas.addEventListener('pointerup', this.up)
    canvas.addEventListener('pointercancel', this.cancel)
    canvas.addEventListener('lostpointercapture', this.cancel)
    canvas.addEventListener('pointerleave', this.leave)
    canvas.addEventListener('dblclick', this.doubleClick)
    window.addEventListener('keydown', this.keyDown)
    window.addEventListener('keyup', this.keyUp)
    window.addEventListener('blur', this.blur)
    this.media.addEventListener('change', this.motionChange)
    this.resize()
    if (!loadExploreCamera(identity)) { this.fit(); this.state.camera = { ...this.target } }
    this.wake()
  }
  private refreshStyles() {
    const index = buildDiagramStyleIndex(this.workspace, THEMES[useSettingsStore.getState().colorTheme])
    this.state.styles = new Map(this.state.layout.nodes.map(n => [n.id, getElementStyle(n.element, index)]))
  }
  private readPalette(): Palette {
    const style = getComputedStyle(this.canvas)
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
    const theme = useSettingsStore.getState().colorTheme
    return { grid: isLightCanvasTheme(theme) ? 'rgba(0,0,0,.32)' : '#3a5274', edge: THEME_EDGE_COLORS[theme] ?? read('--color-edge', '#64748b'), background: THEME_CANVAS_BACKGROUNDS[theme] ?? read('--color-bg-primary', '#101820'), surface: read('--color-surface-1', '#18242e'), text: read('--color-text-primary', '#e3ecf4'), muted: read('--color-text-muted', '#91a6ba'), accent: THEME_SELECTION_COLORS[theme], border: read('--color-border', '#3a4b59') }
  }
  update(workspace: Workspace, selected: string[], filters: HighlightFilters) {
    const layoutEdit = workspace.exploreLayout !== this.workspace.exploreLayout
    this.workspace = workspace
    this.state.groups = workspace.model.groups
    this.state.relationshipStyles = workspace.views.configuration.styles.relationships
    this.state.selectedGroup = useWorkspaceStore.getState().selectedGroupId
    this.state.selectedRelationship = useWorkspaceStore.getState().selectedRelationshipId
    const key = geometryKey(workspace)
    if (key !== this.key) {
      const oldFocus = this.state.layout.byId.get(selected[0])
      this.state.layout = buildLayout(workspace); this.key = key
      const newFocus = this.state.layout.byId.get(selected[0])
      if (oldFocus && newFocus && !layoutEdit) {
        const dx = (oldFocus.x - newFocus.x) * this.state.camera.zoom, dy = (oldFocus.y - newFocus.y) * this.state.camera.zoom
        this.state.camera.x += dx; this.state.camera.y += dy; this.target.x += dx; this.target.y += dy
      }
      for (const id of this.state.reveal.keys()) if (!this.state.layout.byId.has(id)) this.state.reveal.delete(id)
    } else {
      const elements = [...workspace.model.people, ...workspace.model.softwareSystems.flatMap(s => [s, ...s.containers.flatMap(c => [c, ...c.components])])]
      for (const element of elements) { const node = this.state.layout.byId.get(element.id); if (node) node.element = element }
    }
    this.refreshStyles()
    Object.assign(this.state, connectionsFor(this.state.layout, workspace.model.relationships))
    const validPortals = new Set(this.state.bundles.flatMap(b => [b.key + ':' + b.from.id, b.key + ':' + b.to.id]))
    for (const key of this.pinned) if (!validPortals.has(key)) this.pinned.delete(key)
    if (this.hoveredPortal && !validPortals.has(this.hoveredPortal)) { this.hoveredPortal = null; this.callbacks.portal(null, false) }
    if (this.focusTarget && !this.state.layout.byId.has(this.focusTarget)) { this.focusTarget = null; this.focusAncestors.clear() }
    if (this.state.selected.size && !selected.length && !this.focusTarget) this.lastInput = -Infinity
    this.state.selected = new Set(selected.filter(id => this.state.layout.byId.has(id)))
    if (selected.length !== this.state.selected.size) this.callbacks.select(null)
    const activePortal = this.hoveredPortal ?? [...this.pinned][0]
    if (activePortal) {
      const bundle = this.state.bundles.find(b => activePortal === b.key + ':' + b.from.id || activePortal === b.key + ':' + b.to.id)
      if (bundle) this.callbacks.portal({ key: activePortal, bundle, node: activePortal === bundle.key + ':' + bundle.from.id ? bundle.from : bundle.to, point: { x: 0, y: 0 } }, this.pinned.has(activePortal))
      else this.callbacks.portal(null, false)
    } else this.callbacks.portal(null, false)
    this.filters = filters; this.state.filtering = highlightActive(filters)
    this.state.matches.clear()
    for (const n of this.state.layout.nodes) if (isHighlighted(n.element, filters)) {
      for (let p: MapNode | undefined = n; p; p = p.parent) this.state.matches.add(p.id)
    }
    this.wake()
  }
  private resize() {
    const rect = this.canvas.getBoundingClientRect(); this.width = rect.width; this.height = rect.height
    const dpr = Math.min(devicePixelRatio || 1, 2)
    this.canvas.width = Math.max(1, Math.round(this.width * dpr)); this.canvas.height = Math.max(1, Math.round(this.height * dpr))
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.wake()
  }
  private input() {
    this.gliding = false
    this.focusTarget = null; this.focusAncestors.clear(); this.lastInput = performance.now()
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.wake(), TUNING.idleMs + 1)
    this.wake()
  }
  private wake = () => { if (!this.frame && !this.disposed) { this.lastTime = performance.now(); this.frame = requestAnimationFrame(this.tick) } }
  private tick = (now: number) => {
    this.frame = 0
    const frameStart = performance.now()
    const dt = Math.min(64, Math.max(1, now - this.lastTime)); this.lastTime = now
    if (this.gliding) {
      const glide = stepGlide(this.velocity, dt, this.media.matches)
      this.velocity = glide.velocity
      this.state.camera = { ...this.state.camera, x: this.state.camera.x + glide.delta.x, y: this.state.camera.y + glide.delta.y }
      this.target = { ...this.state.camera }
      this.gliding = glide.moving
      // Detail completion waits until the glide has ended, without moving the camera.
      this.lastInput = now
      if (!this.gliding) {
        clearTimeout(this.timer)
        this.timer = setTimeout(() => this.wake(), TUNING.idleMs + 1)
      }
    }
    const previous = this.state.camera
    this.state.camera = stepCamera(previous, this.target, dt, this.media.matches, this.anchor)
    let moving = this.gliding || this.state.camera.x !== this.target.x || this.state.camera.y !== this.target.y || this.state.camera.zoom !== this.target.zoom
    const insets = getCanvasFitInsets(this.canvas.getBoundingClientRect())
    const complete = !this.pointers.size && now - this.lastInput >= TUNING.idleMs
    const locked = (this.state.selected.size > 0 || !!this.drag || !!this.connecting) && !this.focusTarget
    for (const n of this.state.layout.nodes) {
      if (!n.children.length) continue
      const raw = this.focusAncestors.has(n.id) ? 1 : revealFor(n, this.state.camera.zoom, this.width - insets.left - insets.right, this.height - insets.top - insets.bottom)
      const old = this.state.reveal.get(n.id) ?? 0
      const next = stepReveal(old, raw, complete || !!this.focusTarget, dt, this.media.matches, locked)
      this.state.reveal.set(n.id, next); if (next !== old) moving = true
    }
    for (const p of this.state.bundles.flatMap(b => [b.key + ':' + b.from.id, b.key + ':' + b.to.id])) {
      const old = this.state.portalAmounts.get(p) ?? 0
      const value = stepReveal(old, this.hoveredPortal === p || this.pinned.has(p) ? 1 : 0, true, dt, this.media.matches)
      this.state.portalAmounts.set(p, value); if (old !== value) moving = true
    }
    this.portals = drawMap(this.ctx, this.width, this.height, this.state, this.palette)
    this.drawEditing()
    this.drawMinimap()
    if (import.meta.env.DEV) { this.frameWork.push(performance.now() - frameStart); if (this.frameWork.length > 10000) this.frameWork.shift() }
    if (!moving) {
      this.anchor = undefined
      if (this.focusTarget) { const id = this.focusTarget; this.focusTarget = null; this.focusAncestors.clear(); this.callbacks.select(id) }
      saveExploreCamera(this.identity, this.state.camera)
      this.callbacks.zoom(this.state.camera.zoom)
      this.canvas.dataset.camera = JSON.stringify(this.state.camera)
      this.canvas.dataset.reveal = JSON.stringify(Object.fromEntries(this.state.reveal))
    } else this.frame = requestAnimationFrame(this.tick)
  }
  private point(e: { clientX: number; clientY: number }): Point { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  private wheel = (e: WheelEvent) => {
    e.preventDefault(); this.input()
    const screen = this.point(e), current = this.state.camera
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1)
    // Accumulate only scale; always derive the anchor from the displayed camera.
    const zoom = zoomAt(this.target, Math.exp(-Math.max(-400, Math.min(400, delta)) * (e.ctrlKey ? .008 : .002)), screen).zoom
    this.anchor = { screen, world: { x: (screen.x - current.x) / current.zoom, y: (screen.y - current.y) / current.zoom } }
    this.target = { x: screen.x - this.anchor.world.x * zoom, y: screen.y - this.anchor.world.y * zoom, zoom }
  }
  private down = (e: PointerEvent) => {
    if (e.button !== 0) return
    this.canvas.focus({ preventScroll: true }); this.canvas.setPointerCapture(e.pointerId)
    this.pointers.set(e.pointerId, this.point(e)); this.gestureStart = this.point(e); this.moved = this.pointers.size > 1
    this.velocity = { x: 0, y: 0 }; this.panTime = e.timeStamp
    this.target = { ...this.state.camera }; this.anchor = undefined; this.input()
    if (this.pointers.size > 1) { this.cancelDrag(); this.connecting = null; this.selectionBox = null; return }
    const point = this.point(e), node = this.hitNode(point)
    const group = groupBoxes(this.state).find(b => point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + 22)
    this.groupPressed = group ? group.group.id : null
    const reconnect = this.state.edgeHits?.find(h => h.relationship.id === this.state.selectedRelationship && (Math.hypot(h.start.x - point.x, h.start.y - point.y) < 8 || Math.hypot(h.end.x - point.x, h.end.y - point.y) < 8))
    if (reconnect && !this.spaceHeld) {
      const reverse = Math.hypot(reconnect.start.x - point.x, reconnect.start.y - point.y) < 8
      const source = this.state.layout.byId.get(reverse ? reconnect.relationship.destinationId : reconnect.relationship.sourceId)
      if (source) { this.connecting = { source, point, relationshipId: reconnect.relationship.id, reverse }; return }
    }
    const portal = this.portals.some(p => Math.hypot(p.point.x - point.x, p.point.y - point.y) < 13)
    const handle = !this.spaceHeld && this.hitHandle(point)
    if (handle) { this.connecting = { source: handle, point }; return }
    if (this.spaceHeld || portal) return
    if ((node || group) && !e.shiftKey && !useWorkspaceStore.getState().multiSelectMode) {
      const candidates = group ? this.state.layout.nodes.filter(n => group.group.elementIds.includes(n.id)) : this.state.selected.has(node!.id) ? this.state.layout.nodes.filter(n => this.state.selected.has(n.id)) : [node!]
      this.drag = { start: point, nodes: candidates.filter(n => !this.isLocked(n) && !candidates.some(p => p !== n && contains(p, n))).map(node => ({ node, x: node.x, y: node.y })) }
    } else if (!node && (e.shiftKey || useWorkspaceStore.getState().multiSelectMode)) this.selectionBox = { start: point, end: point }
  }
  private move = (e: PointerEvent) => {
    const p = this.point(e), old = this.pointers.get(e.pointerId)
    if (!old) {
      const portal = this.portals.find(portal => Math.hypot(portal.point.x - p.x, portal.point.y - p.y) < 13)
      const next = portal?.key ?? null
      if (next !== this.hoveredPortal) { this.hoveredPortal = next; this.callbacks.portal(portal ?? this.portals.find(p => this.pinned.has(p.key)) ?? null, !!portal && this.pinned.has(portal.key)); this.wake() }
      const node = this.hitNode(p)?.id ?? null
      if (node !== this.state.hovered) { this.state.hovered = node; this.wake() }
      this.canvas.style.cursor = this.hitHandle(p) ? 'crosshair' : portal || node ? 'pointer' : 'grab'; return
    }
    if (this.pointers.size === 1 && (this.drag || this.connecting || this.selectionBox)) {
      if (this.gestureStart && Math.hypot(p.x - this.gestureStart.x, p.y - this.gestureStart.y) > 4) this.moved = true
      if (this.connecting) this.connecting.point = p
      if (this.selectionBox) this.selectionBox.end = p
      if (this.drag && this.moved) {
        for (const entry of this.drag.nodes) {
          const target = this.constrain(entry.node, entry.x + (p.x - this.drag.start.x) / this.state.camera.zoom, entry.y + (p.y - this.drag.start.y) / this.state.camera.zoom)
          translateSubtree(entry.node, target.x - entry.node.x, target.y - entry.node.y)
        }
      }
      this.pointers.set(e.pointerId, p); this.input(); return
    }
    const others = [...this.pointers.entries()].filter(([id]) => id !== e.pointerId)
    if (others.length) {
      this.velocity = { x: 0, y: 0 }
      const other = others[0][1], before = { x: (old.x + other.x) / 2, y: (old.y + other.y) / 2 }, after = { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 }
      this.target = zoomAt(this.state.camera, Math.hypot(p.x - other.x, p.y - other.y) / Math.max(1, Math.hypot(old.x - other.x, old.y - other.y)), before)
      this.target.x += after.x - before.x; this.target.y += after.y - before.y; this.moved = true
    } else {
      const dt = Math.max(8, e.timeStamp - this.panTime)
      this.velocity = { x: (p.x - old.x) / dt, y: (p.y - old.y) / dt }
      this.target = { ...this.state.camera, x: this.state.camera.x + p.x - old.x, y: this.state.camera.y + p.y - old.y }
    }
    this.panTime = e.timeStamp
    if (this.gestureStart && Math.hypot(p.x - this.gestureStart.x, p.y - this.gestureStart.y) > 4) this.moved = true
    this.state.camera = { ...this.target }; this.pointers.set(e.pointerId, p); this.input()
  }
  private up = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return
    const p = this.point(e)
    this.pointers.delete(e.pointerId)
    const editing = !!(this.drag || this.connecting || this.selectionBox)
    if (this.connecting) {
      const target = this.hitNode(p)
      if (target && target !== this.connecting.source) {
        const { source, relationshipId, reverse } = this.connecting
        if (relationshipId) useWorkspaceStore.getState().reconnectRelationship(relationshipId, reverse ? target.id : source.id, reverse ? source.id : target.id)
        else useWorkspaceStore.getState().addRelationship(source.id, target.id)
      }
    } else if (this.selectionBox && this.moved) {
      const { start, end } = this.selectionBox
      const ids = this.state.layout.nodes.filter(n => {
        const b = screenBox(n, this.state.camera)
        return visibility(n, this.state.reveal) > .5 && b.x >= Math.min(start.x, end.x) && b.y >= Math.min(start.y, end.y) && b.x + b.width <= Math.max(start.x, end.x) && b.y + b.height <= Math.max(start.y, end.y)
      }).map(n => n.id)
      useWorkspaceStore.getState().selectElements(ids)
    } else if (this.drag && this.moved) {
      this.moveNodes(this.drag.nodes.map(({ node }) => ({ id: node.id, x: node.x, y: node.y })))
    } else if (!this.moved) {
      const portal = this.portals.find(portal => Math.hypot(portal.point.x - p.x, portal.point.y - p.y) < 13)
      const node = this.hitNode(p)
      const edge = !node && this.hitEdge(p)
      if (this.groupPressed) useWorkspaceStore.getState().selectGroup(this.groupPressed)
      else if (portal) this.togglePortal(portal.key)
      else if (edge) useWorkspaceStore.getState().selectRelationship(edge.relationship.id)
      else this.callbacks.select(node?.id ?? null, e.shiftKey || useWorkspaceStore.getState().multiSelectMode)
    }
    this.drag = null; this.connecting = null; this.selectionBox = null
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId)
    this.input()
    this.gliding = !editing && !this.pointers.size && this.moved && !this.media.matches && e.timeStamp - this.panTime < 80 && Math.hypot(this.velocity.x, this.velocity.y) > .03
  }
  private cancel = (e: PointerEvent) => { if (this.pointers.delete(e.pointerId)) { this.cancelDrag(); this.connecting = null; this.selectionBox = null; this.moved = true; this.input() } }
  private keyDown = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target as HTMLElement).closest('input, textarea, button, select, [role=button], [contenteditable=true]')) { this.spaceHeld = true; e.preventDefault() } }
  private keyUp = (e: KeyboardEvent) => { if (e.code === 'Space') this.spaceHeld = false }
  private blur = () => { this.spaceHeld = false; this.cancelDrag(); this.connecting = null; this.selectionBox = null; this.pointers.clear(); this.gliding = false; this.wake() }
  private cancelDrag() { for (const e of this.drag?.nodes ?? []) translateSubtree(e.node, e.x - e.node.x, e.y - e.node.y); this.drag = null }
  private isLocked(n: MapNode) { return this.workspace.exploreLayout?.locked || this.workspace.exploreLayout?.elements?.[n.id]?.locked }
  private constrain(n: MapNode, x: number, y: number) {
    if (useSettingsStore.getState().snapToGrid) { const grid = 32 * n.scale; x = Math.round(x / grid) * grid; y = Math.round(y / grid) * grid }
    if (n.parent) {
      const p = n.parent, pad = 4 * p.scale, header = 40 * p.scale
      x = Math.max(p.x + pad, Math.min(p.x + p.width - n.width - pad, x))
      y = Math.max(p.y + header, Math.min(p.y + p.height - n.height - pad, y))
    }
    return { x, y }
  }
  private handles(n: MapNode) {
    const b = screenBox(n, this.state.camera)
    return [{ x: b.x + b.width / 2, y: b.y }, { x: b.x + b.width, y: b.y + b.height / 2 }, { x: b.x + b.width / 2, y: b.y + b.height }, { x: b.x, y: b.y + b.height / 2 }]
  }
  private hitHandle(point: Point) {
    return this.state.layout.nodes.find(n => (this.state.selected.has(n.id) || n.id === this.state.hovered) && visibility(n, this.state.reveal) > .5 && this.handles(n).some(p => Math.hypot(p.x - point.x, p.y - point.y) < 8))
  }
  private hitEdge(point: Point) {
    this.ctx.save(); this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.lineWidth = 14
    const edge = this.state.edgeHits?.find(h => this.ctx.isPointInStroke(h.path, point.x, point.y))
    this.ctx.restore(); return edge
  }
  private drawEditing() {
    const ctx = this.ctx
    ctx.save(); ctx.strokeStyle = this.palette.accent; ctx.fillStyle = this.palette.accent; ctx.lineWidth = 1.5
    for (const edge of this.state.edgeHits ?? []) if (edge.relationship.id === this.state.selectedRelationship) {
      for (const p of [edge.start, edge.end]) { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill() }
    }
    for (const n of this.state.layout.nodes) if ((this.state.selected.has(n.id) || n.id === this.state.hovered) && visibility(n, this.state.reveal) > .5) {
      for (const p of this.handles(n)) { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill() }
    }
    if (this.connecting) { const from = screenBox(this.connecting.source, this.state.camera); ctx.beginPath(); ctx.moveTo(from.x + from.width / 2, from.y + from.height / 2); ctx.lineTo(this.connecting.point.x, this.connecting.point.y); ctx.stroke() }
    if (this.selectionBox) { const { start, end } = this.selectionBox; ctx.globalAlpha = .15; ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y); ctx.globalAlpha = 1; ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y) }
    ctx.restore()
  }
  attachMinimap(canvas: HTMLCanvasElement) {
    this.minimap = canvas
    canvas.addEventListener('pointerdown', this.minimapMove)
    canvas.addEventListener('pointermove', this.minimapMove)
    canvas.addEventListener('wheel', this.wheel, { passive: false })
    this.wake()
  }
  private minimapMove = (e: PointerEvent) => {
    if (e.type === 'pointermove' && !(e.buttons & 1)) return
    const rect = this.minimap!.getBoundingClientRect(), b = this.state.layout.bounds
    const scale = Math.min(180 / b.width, 120 / b.height)
    const x = b.x + (e.clientX - rect.left - 10) / scale, y = b.y + (e.clientY - rect.top - 10) / scale
    this.input(); this.anchor = undefined
    this.target = { ...this.state.camera, x: this.width / 2 - x * this.state.camera.zoom, y: this.height / 2 - y * this.state.camera.zoom }
  }
  private drawMinimap() {
    if (!this.minimap) return
    const mode = useSettingsStore.getState().minimapMode
    const visible = mode === 'always' || (mode === 'auto' && performance.now() - this.lastInput < 1500)
    this.minimap.style.display = visible ? 'block' : 'none'
    if (!visible) return
    clearTimeout(this.minimapTimer)
    if (mode === 'auto') this.minimapTimer = setTimeout(() => this.wake(), 1501)
    const ctx = this.minimap.getContext('2d')!, b = this.state.layout.bounds, scale = Math.min(180 / b.width, 120 / b.height)
    ctx.fillStyle = this.palette.background; ctx.fillRect(0, 0, 200, 140)
    ctx.fillStyle = this.palette.muted
    for (const n of this.state.layout.roots) ctx.fillRect(10 + (n.x - b.x) * scale, 10 + (n.y - b.y) * scale, n.width * scale, n.height * scale)
    ctx.strokeStyle = this.palette.accent; ctx.lineWidth = 1
    const c = this.state.camera
    ctx.strokeRect(10 + (-c.x / c.zoom - b.x) * scale, 10 + (-c.y / c.zoom - b.y) * scale, this.width / c.zoom * scale, this.height / c.zoom * scale)
  }
  getNodes(): Node[] { return this.state.layout.nodes.filter(n => visibility(n, this.state.reveal) > .5).map(n => ({ id: n.id, position: { x: n.x, y: n.y }, measured: { width: n.width, height: n.height }, data: { element: n.element } })) }
  getZoom() { return this.state.camera.zoom }
  flowToScreenPosition(p: Point) { const r = this.canvas.getBoundingClientRect(); return { x: r.left + p.x * this.state.camera.zoom + this.state.camera.x, y: r.top + p.y * this.state.camera.zoom + this.state.camera.y } }
  layout(): NonNullable<Workspace['exploreLayout']> {
    return { ...this.workspace.exploreLayout, elements: { ...this.workspace.exploreLayout?.elements, ...Object.fromEntries(this.state.layout.nodes.map(n => [n.id, { ...this.workspace.exploreLayout?.elements?.[n.id], pinned: true, x: (n.x - (n.parent?.x ?? 0)) / n.scale, y: (n.y - (n.parent?.y ?? 0)) / n.scale }])) } }
  }
  moveNodes(positions: { id: string; x: number; y: number }[]) {
    if (!positions.some(p => { const n = this.state.layout.byId.get(p.id); return n && !this.isLocked(n) })) return
    const moving = new Set(positions.map(p => p.id))
    for (const p of positions) {
      const n = this.state.layout.byId.get(p.id)
      if (!n || this.isLocked(n)) continue
      let ancestor = n.parent, nested = false
      while (ancestor) { if (moving.has(ancestor.id)) nested = true; ancestor = ancestor.parent }
      if (nested) continue
      const target = this.constrain(n, p.x, p.y)
      translateSubtree(n, target.x - n.x, target.y - n.y)
    }
    useWorkspaceStore.getState().updateExploreLayout(this.layout())
    this.wake()
  }
  private renderExport(theme: 'dark' | 'light' | 'current') {
    const canvas = document.createElement('canvas'); canvas.width = this.width * 2; canvas.height = this.height * 2
    const ctx = canvas.getContext('2d')!; ctx.scale(2, 2)
    const palette = theme === 'current' ? this.palette : { ...this.palette, background: theme === 'light' ? '#f8fafc' : '#0a0f14', text: theme === 'light' ? '#0f172a' : '#e3ecf4', muted: theme === 'light' ? '#475569' : '#91a6ba', edge: theme === 'light' ? '#475569' : '#64748b' }
    const state = { ...this.state, selected: new Set<string>(), hovered: null, selectedRelationship: null, selectedGroup: null }
    drawMap(ctx, this.width, this.height, state, palette)
    return { canvas, state, palette }
  }
  exportImage(theme: 'dark' | 'light' | 'current') { return this.renderExport(theme).canvas }
  exportSVG(theme: 'dark' | 'light' | 'current') { const { state, palette } = this.renderExport(theme); return mapSVG(state, palette, this.width, this.height) }
  private leave = () => { if (!this.pointers.size) { this.hoveredPortal = null; this.state.hovered = null; this.callbacks.portal(this.portals.find(p => this.pinned.has(p.key)) ?? null, this.pinned.size > 0); this.wake() } }
  private doubleClick = (e: MouseEvent) => { const n = this.hitNode(this.point(e)); if (n) this.focus(n.id) }
  private motionChange = () => this.wake()
  private hitNode(point: Point) {
    return [...this.state.layout.nodes].reverse().find(n => { const b = screenBox(n, this.state.camera); return visibility(n, this.state.reveal) > .5 && point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height })
  }
  zoomBy(factor: number) { this.input(); this.anchor = undefined; this.target = zoomAt(this.state.camera, factor, { x: this.width / 2, y: this.height / 2 }); this.anchor = { screen: { x: this.width / 2, y: this.height / 2 }, world: { x: (this.width / 2 - this.state.camera.x) / this.state.camera.zoom, y: (this.height / 2 - this.state.camera.y) / this.state.camera.zoom } } }
  pan(dx: number, dy: number) { this.input(); this.anchor = undefined; this.target = { ...this.state.camera, x: this.state.camera.x + dx, y: this.state.camera.y + dy } }
  private fitBox(box: Box, max = 2) {
    const insets = getCanvasFitInsets(this.canvas.getBoundingClientRect())
    // Focus selects its destination when the flight completes. Reserve the
    // inspector before it mounts so that completion cannot cover the children.
    // Presentation hides the workspace chrome and inspector, retaining the full width.
    const workspaceChrome = document.querySelector<HTMLElement>('[data-canvas-chrome="top-pill"]')
    const pendingInspector = this.focusTarget && workspaceChrome?.getClientRects().length
      ? Math.min(360, this.width - 28) + 28 : 0
    const left = Math.max(insets.left, 30), right = Math.max(insets.right, pendingInspector, 30), top = Math.max(insets.top, 105), bottom = Math.max(insets.bottom, 65)
    const width = Math.max(100, this.width - left - right), height = Math.max(100, this.height - top - bottom)
    const zoom = Math.max(.003, Math.min(max, width * .9 / box.width, height * .9 / box.height))
    this.anchor = undefined; this.target = { x: left + width / 2 - (box.x + box.width / 2) * zoom, y: top + height / 2 - (box.y + box.height / 2) * zoom, zoom }
  }
  fit() { this.input(); this.fitBox(this.state.layout.bounds) }
  focus(id: string) {
    const node = this.state.layout.byId.get(id); if (!node) return
    this.input()
    if (highlightActive(this.filters) && !isHighlighted(node.element, this.filters)) this.callbacks.clearFilters()
    this.focusTarget = id; this.focusAncestors.clear()
    for (let n: MapNode | undefined = node.parent; n; n = n.parent) this.focusAncestors.add(n.id)
    if (node.children.length) this.focusAncestors.add(node.id)
    this.fitBox(node, 10000); this.wake()
  }
  togglePortal(key: string) {
    if (this.pinned.has(key)) this.pinned.delete(key); else this.pinned.add(key)
    this.callbacks.portal(this.portals.find(p => p.key === key) ?? null, this.pinned.has(key)); this.wake()
  }
  escape() { this.cancelDrag(); this.connecting = null; this.selectionBox = null; this.pointers.clear(); this.gliding = false; this.pinned.clear(); this.hoveredPortal = null; this.callbacks.portal(null, false); this.callbacks.select(null); this.wake() }
  dispose() {
    clearTimeout(this.minimapTimer)
    this.minimap?.removeEventListener('pointerdown', this.minimapMove); this.minimap?.removeEventListener('pointermove', this.minimapMove); this.minimap?.removeEventListener('wheel', this.wheel)
    window.removeEventListener('keydown', this.keyDown); window.removeEventListener('keyup', this.keyUp); window.removeEventListener('blur', this.blur)
    this.disposed = true; cancelAnimationFrame(this.frame); clearTimeout(this.timer)
    this.observer.disconnect(); this.themeObserver.disconnect(); this.unsubscribeTheme(); this.media.removeEventListener('change', this.motionChange)
    this.canvas.removeEventListener('wheel', this.wheel); this.canvas.removeEventListener('pointerdown', this.down); this.canvas.removeEventListener('pointermove', this.move)
    this.canvas.removeEventListener('pointerup', this.up); this.canvas.removeEventListener('pointercancel', this.cancel); this.canvas.removeEventListener('lostpointercapture', this.cancel)
    this.canvas.removeEventListener('pointerleave', this.leave); this.canvas.removeEventListener('dblclick', this.doubleClick)
    for (const id of this.pointers.keys()) if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id)
    saveExploreCamera(this.identity, this.state.camera)
  }
}
