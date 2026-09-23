import type { Box, MapNode } from './layout'
export const TUNING = { system: [255, 350], container: [280, 380], occupancy: [.385, .55], cameraMs: 110, revealMs: 85, idleMs: 240 } as const
export interface Camera { x: number; y: number; zoom: number }
export interface Point { x: number; y: number }
/** Integrate exponential drag in screen pixels, independent of frame rate. */
export function stepGlide(velocity: Point, dt: number, reduced = false) {
  if (reduced) return { delta: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, moving: false }
  const decay = Math.exp(-Math.max(0, dt) / 230)
  const travel = 230 * (1 - decay)
  const next = { x: velocity.x * decay, y: velocity.y * decay }
  return { delta: { x: velocity.x * travel, y: velocity.y * travel }, velocity: next, moving: Math.hypot(next.x, next.y) > .015 }
}
export const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v))
function smooth(a: number, b: number, v: number) { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
export function revealFor(n: MapNode, zoom: number, width: number, height: number) {
  if (!n.children.length) return 0
  const [start, end] = n.element.type === 'softwareSystem' ? TUNING.system : TUNING.container
  return Math.max(smooth(start, end, n.width * zoom), smooth(...TUNING.occupancy, Math.max(n.width * zoom / Math.max(1, width), n.height * zoom / Math.max(1, height))))
}
export function stepReveal(current: number, raw: number, complete: boolean, dt: number, reduced = false, locked = false) {
  if (locked) return current
  const target = complete ? Number(raw >= .5) : raw
  const value = reduced ? target : current + (target - current) * (1 - Math.exp(-dt / TUNING.revealMs))
  return Math.abs(value - target) < .001 ? target : value
}
export function stepCamera(current: Camera, target: Camera, dt: number, reduced = false, anchor?: { world: Point; screen: Point }): Camera {
  const t = reduced ? 1 : 1 - Math.exp(-dt / TUNING.cameraMs)
  const zoom = Math.exp(Math.log(current.zoom) + Math.log(target.zoom / current.zoom) * t)
  const value = { x: current.x + (target.x - current.x) * t, y: current.y + (target.y - current.y) * t, zoom }
  if (anchor) { value.x = anchor.screen.x - anchor.world.x * zoom; value.y = anchor.screen.y - anchor.world.y * zoom }
  return Math.abs(Math.log(target.zoom / zoom)) < .0001 && Math.hypot(value.x - target.x, value.y - target.y) < .05 ? { ...target } : value
}
export function zoomAt(camera: Camera, factor: number, point: Point): Camera {
  const zoom = clamp(camera.zoom * factor, .003, 10000)
  return { x: point.x - (point.x - camera.x) * zoom / camera.zoom, y: point.y - (point.y - camera.y) * zoom / camera.zoom, zoom }
}
export function projected(n: MapNode, reveal: Map<string, number>): Box {
  const chain: MapNode[] = []
  for (let p: MapNode | undefined = n; p; p = p.parent) chain.unshift(p)
  const result = { x: 0, y: 0, width: 0, height: 0 }; let remaining = 1
  chain.forEach((p, i) => {
    const open = i === chain.length - 1 ? 0 : reveal.get(p.id) ?? 0
    const weight = remaining * (1 - open)
    result.x += p.x * weight; result.y += p.y * weight; result.width += p.width * weight; result.height += p.height * weight
    remaining *= open
  })
  return result
}
export function visibility(n: MapNode, reveal: Map<string, number>) {
  let alpha = 1
  for (let p = n.parent; p; p = p.parent) alpha *= reveal.get(p.id) ?? 0
  return alpha
}
export function screenBox(box: Box, camera: Camera): Box {
  return { x: box.x * camera.zoom + camera.x, y: box.y * camera.zoom + camera.y, width: box.width * camera.zoom, height: box.height * camera.zoom }
}
export function borderPoint(box: Box, toward: Point): Point {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  const dx = toward.x - cx, dy = toward.y - cy
  const t = 1 / Math.max(Math.abs(dx) / (box.width / 2), Math.abs(dy) / (box.height / 2), .00001)
  return { x: cx + dx * t, y: cy + dy * t }
}
