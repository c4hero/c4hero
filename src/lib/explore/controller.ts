import { useSettingsStore } from '@/store/settings'
import { isLightCanvasTheme, THEMES, THEME_CANVAS_BACKGROUNDS, THEME_EDGE_COLORS, THEME_SELECTION_COLORS } from '@/lib/themes'
import { buildDiagramStyleIndex, getElementStyle } from '@/lib/elementStyles'
import type { Workspace } from '@/types/model'
import { getCanvasFitInsets } from '@/lib/fitViewport'
import { isHighlighted, highlightActive, type HighlightFilters } from '@/lib/highlight'
import { buildLayout, geometryKey, connectionsFor, type MapNode, type Box } from './layout'
import { drawMap, type Portal, type Palette, type RenderState } from './renderer'
import { loadExploreCamera, saveExploreCamera } from './persistence'
import { zoomAt, stepCamera, stepReveal, revealFor, visibility, screenBox, TUNING, type Camera, type Point } from './motion'
import type { ActiveCamera } from '@/lib/activeCamera'

interface Callbacks { select(id: string | null): void; portal(portal: Portal | null, pinned: boolean): void; zoom(zoom: number): void; clearFilters(): void }
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
    this.refreshStyles()
    this.palette = this.readPalette()
    this.unsubscribeTheme = useSettingsStore.subscribe((s, previous) => { if (s.colorTheme !== previous.colorTheme) { this.refreshStyles(); this.palette = this.readPalette(); this.wake() } })
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
    this.workspace = workspace
    const key = geometryKey(workspace)
    if (key !== this.key) {
      const oldFocus = this.state.layout.byId.get(selected[0])
      this.state.layout = buildLayout(workspace); this.key = key
      const newFocus = this.state.layout.byId.get(selected[0])
      if (oldFocus && newFocus) {
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
    const previous = this.state.camera
    this.state.camera = stepCamera(previous, this.target, dt, this.media.matches, this.anchor)
    let moving = this.state.camera.x !== this.target.x || this.state.camera.y !== this.target.y || this.state.camera.zoom !== this.target.zoom
    const insets = getCanvasFitInsets(this.canvas.getBoundingClientRect())
    const complete = !this.pointers.size && now - this.lastInput >= TUNING.idleMs
    const locked = this.state.selected.size > 0 && !this.focusTarget
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
    this.target = { ...this.state.camera }; this.anchor = undefined; this.input()
  }
  private move = (e: PointerEvent) => {
    const p = this.point(e), old = this.pointers.get(e.pointerId)
    if (!old) {
      const portal = this.portals.find(portal => Math.hypot(portal.point.x - p.x, portal.point.y - p.y) < 13)
      const next = portal?.key ?? null
      if (next !== this.hoveredPortal) { this.hoveredPortal = next; this.callbacks.portal(portal ?? this.portals.find(p => this.pinned.has(p.key)) ?? null, !!portal && this.pinned.has(portal.key)); this.wake() }
      const node = this.hitNode(p)?.id ?? null
      if (node !== this.state.hovered) { this.state.hovered = node; this.wake() }
      this.canvas.style.cursor = portal || node ? 'pointer' : 'grab'; return
    }
    const others = [...this.pointers.entries()].filter(([id]) => id !== e.pointerId)
    if (others.length) {
      const other = others[0][1], before = { x: (old.x + other.x) / 2, y: (old.y + other.y) / 2 }, after = { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 }
      this.target = zoomAt(this.state.camera, Math.hypot(p.x - other.x, p.y - other.y) / Math.max(1, Math.hypot(old.x - other.x, old.y - other.y)), before)
      this.target.x += after.x - before.x; this.target.y += after.y - before.y; this.moved = true
    } else { this.target = { ...this.state.camera, x: this.state.camera.x + p.x - old.x, y: this.state.camera.y + p.y - old.y } }
    if (this.gestureStart && Math.hypot(p.x - this.gestureStart.x, p.y - this.gestureStart.y) > 4) this.moved = true
    this.state.camera = { ...this.target }; this.pointers.set(e.pointerId, p); this.input()
  }
  private up = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return
    const p = this.point(e)
    this.pointers.delete(e.pointerId)
    if (!this.moved) {
      const portal = this.portals.find(portal => Math.hypot(portal.point.x - p.x, portal.point.y - p.y) < 13)
      if (portal) this.togglePortal(portal.key)
      else this.callbacks.select(this.hitNode(p)?.id ?? null)
    }
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId)
    this.input()
  }
  private cancel = (e: PointerEvent) => { if (this.pointers.delete(e.pointerId)) { this.moved = true; this.input() } }
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
    const left = Math.max(insets.left, 30), right = Math.max(insets.right, 30), top = Math.max(insets.top, 105), bottom = Math.max(insets.bottom, 65)
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
  escape() { this.pinned.clear(); this.hoveredPortal = null; this.callbacks.portal(null, false); this.callbacks.select(null); this.wake() }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); clearTimeout(this.timer)
    this.observer.disconnect(); this.themeObserver.disconnect(); this.unsubscribeTheme(); this.media.removeEventListener('change', this.motionChange)
    this.canvas.removeEventListener('wheel', this.wheel); this.canvas.removeEventListener('pointerdown', this.down); this.canvas.removeEventListener('pointermove', this.move)
    this.canvas.removeEventListener('pointerup', this.up); this.canvas.removeEventListener('pointercancel', this.cancel); this.canvas.removeEventListener('lostpointercapture', this.cancel)
    this.canvas.removeEventListener('pointerleave', this.leave); this.canvas.removeEventListener('dblclick', this.doubleClick)
    for (const id of this.pointers.keys()) if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id)
    saveExploreCamera(this.identity, this.state.camera)
  }
}
