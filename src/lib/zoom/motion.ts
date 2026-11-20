import type { Box, MapNode } from './layout'
export const TUNING = { system: [340, 420], container: [365, 450], occupancy: [.51, .65], cameraMs: 110, revealMs: 85, idleMs: 240, premount: 1.6 } as const
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
export function smooth(a: number, b: number, v: number) { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
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
export function zoomAt(camera: Camera, factor: number, point: Point, bounds: ZoomBounds = { min: .003, max: 10000 }): Camera {
  const zoom = clamp(camera.zoom * factor, bounds.min, bounds.max)
  return { x: point.x - (point.x - camera.x) * zoom / camera.zoom, y: point.y - (point.y - camera.y) * zoom / camera.zoom, zoom }
}

export interface ZoomBounds { min: number; max: number }
/** Keep the overview at least a readable fraction of the fitted size, and stop
 * once the smallest card is a few times its native size. Beyond either end the
 * canvas is empty. */
export function zoomBounds(nodes: MapNode[], fitZoom: number): ZoomBounds {
  const smallest = Math.min(1, ...nodes.map(n => n.scale))
  const min = Math.min(.5, fitZoom * .4)
  return { min, max: Math.max(min * 2, 4 / smallest) }
}

/** The camera that centers a card in the free canvas. Expandable cards fill most
 * of it so their contents read; leaves stay near native size beside neighbours. */
export function frameBox(n: MapNode, area: Box): Camera {
  const fill = n.children.length ? .7 : .45
  let zoom = Math.min(area.width * fill / n.width, area.height * fill / n.height)
  if (!n.children.length) zoom = Math.min(zoom, 1.6 / n.scale)
  return { x: area.x + area.width / 2 - (n.x + n.width / 2) * zoom, y: area.y + area.height / 2 - (n.y + n.height / 2) * zoom, zoom }
}

const RHO = Math.SQRT2
/** Van Wijk and Nuij's optimal zoom-and-pan path. The world point at the screen
 * point `at` travels toward its target, zooming out to keep both ends in view
 * when they are far apart. Interpolating x, y and zoom independently instead
 * swings the camera far past its target on deep zooms. */
export function flightPath(from: Camera, to: Camera, at: Point, size: number) {
  const ux0 = (at.x - from.x) / from.zoom, uy0 = (at.y - from.y) / from.zoom, w0 = size / from.zoom
  const ux1 = (at.x - to.x) / to.zoom, uy1 = (at.y - to.y) / to.zoom, w1 = size / to.zoom
  const dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy
  let S: number, sample: (t: number) => [number, number, number]
  if (d2 < 1e-12 * w0 * w0) {
    S = Math.log(w1 / w0) / RHO
    sample = t => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(RHO * t * S)]
  } else {
    const d1 = Math.sqrt(d2)
    const b0 = (w1 * w1 - w0 * w0 + RHO ** 4 * d2) / (2 * w0 * RHO ** 2 * d1)
    const b1 = (w1 * w1 - w0 * w0 - RHO ** 4 * d2) / (2 * w1 * RHO ** 2 * d1)
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1)
    S = (r1 - r0) / RHO
    sample = t => {
      const s = t * S, u = w0 / (RHO ** 2 * d1) * (Math.cosh(r0) * Math.tanh(RHO * s + r0) - Math.sinh(r0))
      return [ux0 + u * dx, uy0 + u * dy, w0 * Math.cosh(r0) / Math.cosh(RHO * s + r0)]
    }
  }
  return {
    /** Long hops take longer, but never so long that the camera feels sluggish. */
    duration: clamp(260 + Math.abs(S) * 210, 320, 950),
    at(t: number): Camera {
      if (t >= 1) return { ...to }
      const [ux, uy, w] = sample(t), zoom = size / w
      return { x: at.x - ux * zoom, y: at.y - uy * zoom, zoom }
    },
  }
}
export const easeInOut = (t: number) => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2

/** Fade the parent's own text out before its contents fade in, so the two never
 * overlap as a muddy double exposure. */
export const summaryOpacity = (reveal: number) => 1 - smooth(0, .45, reveal)
export const detailOpacity = (alpha: number) => smooth(.3, 1, alpha)
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
