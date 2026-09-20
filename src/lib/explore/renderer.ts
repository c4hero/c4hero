import type { ElementStyle } from '@/types/model'
import { contains, type Box, type MapLayout, type MapNode, type Bundle, type Connection } from './layout'
import { borderPoint, projected, screenBox, visibility, type Camera, type Point } from './motion'
export interface Portal { key: string; bundle: Bundle; node: MapNode; point: Point }
export interface RenderState {
  styles: Map<string, ElementStyle | undefined>; layout: MapLayout; connections: Connection[]; bundles: Bundle[]; camera: Camera; reveal: Map<string, number>
  selected: Set<string>; hovered: string | null; portalAmounts: Map<string, number>; matches: Set<string>; filtering: boolean
}
export interface Palette { grid: string; edge: string; background: string; surface: string; text: string; muted: string; accent: string; border: string }
const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
const widths = new Map<string, number>()
const iconPaths = new Map<string, Path2D>()
function textWidth(ctx: CanvasRenderingContext2D, text: string) {
  const key = ctx.font + ':' + text
  if (!widths.has(key)) { if (widths.size > 10000) widths.clear(); widths.set(key, ctx.measureText(text).width) }
  return widths.get(key)!
}
export function drawMap(ctx: CanvasRenderingContext2D, width: number, height: number, s: RenderState, colors: Palette): Portal[] {
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = colors.background; ctx.fillRect(0, 0, width, height)
  // Match Diagram's world-anchored 32px dot grid without excessive work at overview zoom.
  const grid = 32 * s.camera.zoom
  if (grid >= 8) {
    ctx.fillStyle = colors.grid; ctx.beginPath()
    for (let x = ((s.camera.x % grid) + grid) % grid; x < width; x += grid)
      for (let y = ((s.camera.y % grid) + grid) % grid; y < height; y += grid) {
        ctx.moveTo(x + .75 * s.camera.zoom, y); ctx.arc(x, y, .75 * s.camera.zoom, 0, Math.PI * 2)
      }
    ctx.fill()
  }
  const boxes = new Map(s.layout.nodes.map(n => [n.id, screenBox(n, s.camera)]))
  const visible = s.layout.nodes.filter(n => { const b = boxes.get(n.id)!; return visibility(n, s.reveal) > .002 && b.x + b.width > 0 && b.y + b.height > 0 && b.x < width && b.y < height })
  const portals: Portal[] = []
  function edge(a: Box, b: Box, from: MapNode, to: MapNode, external: boolean, async: boolean, alpha: number, self = false) {
    if (alpha < .002) return
    if (!self && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.width - b.width) < .01) return
    const start = borderPoint(a, center(b)), end = borderPoint(b, center(a))
    // Offset directed trunks so opposing directions remain separately hit-testable.
    if (external) { const angle = Math.atan2(end.y - start.y, end.x - start.x); const dx = -Math.sin(angle) * 5, dy = Math.cos(angle) * 5; start.x += dx; end.x += dx; start.y += dy; end.y += dy }
    // Entirely off-screen routes cannot contribute pixels or underpasses.
    if (!self && (Math.max(start.x, end.x) < -12 || Math.min(start.x, end.x) > width + 12 || Math.max(start.y, end.y) < -12 || Math.min(start.y, end.y) > height + 12)) return { start, end }
    const horizontal = Math.abs(end.x - start.x) > Math.abs(end.y - start.y)
    const sign = horizontal ? Math.sign(end.x - start.x) : Math.sign(end.y - start.y)
    const angle = horizontal ? (sign >= 0 ? 0 : Math.PI) : (sign >= 0 ? Math.PI / 2 : -Math.PI / 2), arrow = 5
    const bend = Math.max(25, (horizontal ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y)) * .45)
    const shaftCut = arrow * 1.3 * Math.cos(.48)
    const path = new Path2D()
    if (self) { start.x = a.x + a.width; start.y = a.y + a.height * .65; end.x = start.x; end.y = a.y + a.height * .3; path.moveTo(start.x, start.y); path.bezierCurveTo(start.x + 35, start.y + 20, end.x + 35, end.y - 20, end.x + shaftCut, end.y) }
    else { path.moveTo(start.x, start.y); path.bezierCurveTo(start.x + (horizontal ? sign * bend : 0), start.y + (horizontal ? 0 : sign * bend), end.x - (horizontal ? sign * bend : 0), end.y - (horizontal ? 0 : sign * bend), end.x - Math.cos(angle) * shaftCut, end.y - Math.sin(angle) * shaftCut) }
    const paint = (opacity: number) => {
      ctx.globalAlpha = opacity; ctx.strokeStyle = colors.edge; ctx.fillStyle = ctx.strokeStyle
      ctx.lineWidth = external ? 1.25 : 1.5; ctx.setLineDash(async ? [5, 4] : []); ctx.stroke(path); ctx.setLineDash([])
      ctx.beginPath(); ctx.moveTo(end.x, end.y)
      const direction = self ? Math.PI : angle
      ctx.lineTo(end.x - Math.cos(direction - .48) * arrow * 1.3, end.y - Math.sin(direction - .48) * arrow * 1.3)
      ctx.lineTo(end.x - Math.cos(direction + .48) * arrow * 1.3, end.y - Math.sin(direction + .48) * arrow * 1.3); ctx.closePath(); ctx.fill()
    }
    paint(alpha * .07)
    // Remove unrelated surfaces from the full-strength pass; the faint pass
    // underneath remains visible and connected endpoint surfaces never mask it.
    const clip = new Path2D(); clip.rect(-100, -100, width + 200, height + 200)
    const blockers = visible.filter(n => !contains(n, from) && !contains(n, to))
    const blockedIds = new Set(blockers.map(n => n.id))
    for (const n of blockers) {
      let ancestor = n.parent, nested = false
      while (ancestor) { if (blockedIds.has(ancestor.id)) { nested = true; break } ancestor = ancestor.parent }
      if (!nested) { const box = boxes.get(n.id)!; clip.rect(box.x, box.y, box.width, box.height) }
    }
    ctx.save(); ctx.clip(clip, 'evenodd'); paint(alpha); ctx.restore(); ctx.globalAlpha = 1
    return { start, end }
  }
  // Surfaces precede edges, but underpass clipping keeps quiet bundles behind
  // unrelated nodes while retaining readable routes to their own endpoints.
  for (const n of visible) {
    const b = boxes.get(n.id)!, alpha = visibility(n, s.reveal)
    ctx.globalAlpha = alpha * (s.filtering && !s.matches.has(n.id) ? .22 : 1)
    const style = s.styles.get(n.id), scale = Math.min(2, s.camera.zoom * n.scale)
    ctx.globalAlpha *= (style?.opacity ?? 100) / 100
    ctx.fillStyle = style?.background ?? colors.surface
    ctx.strokeStyle = s.selected.has(n.id) || s.hovered === n.id ? colors.accent : style?.stroke ?? colors.border
    ctx.lineWidth = (s.selected.has(n.id) ? 2.5 : style?.strokeWidth ?? 2) * scale
    const external = 'location' in n.element && n.element.location === 'External'
    ctx.setLineDash(external || style?.border?.toLowerCase() === 'dashed' ? [6 * scale, 4 * scale] : style?.border?.toLowerCase() === 'dotted' ? [2 * scale, 3 * scale] : [])
    ctx.shadowColor = s.selected.has(n.id) ? colors.accent : 'rgba(0,0,0,.2)'; ctx.shadowBlur = (s.selected.has(n.id) ? 10 : 8) * scale; ctx.shadowOffsetY = 2 * scale
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.width, b.height, (n.element.type === 'person' || style?.shape === 'Person' ? Math.min(b.width, b.height) / 2 : 12 * scale)); ctx.fill()
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.stroke(); ctx.setLineDash([])
  }
  ctx.globalAlpha = 1
  const relevant = (n: MapNode) => [...s.selected].some(id => { const selected = s.layout.byId.get(id); return selected && contains(selected, n) })
  for (const bundle of s.bundles) {
    const points = edge(boxes.get(bundle.from.id)!, boxes.get(bundle.to.id)!, bundle.from, bundle.to, true,
      bundle.connections[0].relationship.interactionStyle === 'Asynchronous', .5)
    if (!points) continue
    const label = bundle.connections.length === 1 ? bundle.connections[0].relationship.description : `${bundle.connections.length} relationships`
    if (label && s.camera.zoom >= .25) {
      const x = (points.start.x + points.end.x) / 2, y = (points.start.y + points.end.y) / 2
      ctx.font = `${10 * Math.min(1, s.camera.zoom)}px Inter, system-ui, sans-serif`
      const w = Math.min(180, textWidth(ctx, label))
      ctx.fillStyle = colors.background; ctx.fillRect(x - w / 2 - 4, y - 9, w + 8, 14)
      ctx.fillStyle = colors.muted; ctx.fillText(label, x - w / 2, y + 1, 180)
    }
    for (const [node, point] of [[bundle.from, points.start], [bundle.to, points.end]] as const) {
      const key = bundle.key + ':' + node.id
      portals.push({ key, bundle, node, point })
      const preview = s.portalAmounts.get(key) ?? 0
      for (const c of bundle.connections) {
        const internal = node === bundle.from ? c.from : c.to
        const amount = Math.max(preview, relevant(internal) ? 1 : 0) * visibility(internal, s.reveal)
        if (amount < .002 || internal === node) continue
        const b = screenBox(projected(internal, s.reveal), s.camera)
        const dot = { x: point.x - .1, y: point.y - .1, width: .2, height: .2 }
        if (node === bundle.from) edge(b, dot, c.from, c.to, true, c.relationship.interactionStyle === 'Asynchronous', amount * .7)
        else edge(dot, b, c.from, c.to, true, c.relationship.interactionStyle === 'Asynchronous', amount * .7)
      }
    }
  }
  for (const c of s.connections) {
    if (c.external) continue
    const alpha = Math.max(visibility(c.from, s.reveal), visibility(c.to, s.reveal))
    edge(screenBox(projected(c.from, s.reveal), s.camera), screenBox(projected(c.to, s.reveal), s.camera), c.from, c.to, false,
      c.relationship.interactionStyle === 'Asynchronous', alpha * .7, c.from === c.to && visibility(c.from, s.reveal) > .9)
  }
  for (const n of visible) {
    const original = boxes.get(n.id)!, system = n.element.type === 'softwareSystem'
    const amount = n.children.length ? (s.reveal.get(n.id) ?? 0) : 0
    const reserved = 40 * n.scale * s.camera.zoom
    const labelHeight = original.height * (1 - amount) + reserved * amount
    const b = { ...original, y: original.y + Math.max(0, (labelHeight - 64) / 2) * (1 - amount) }
    // Header geometry stays fixed throughout reveal; labels cannot overlap
    // children that are fading in at their persistent world positions.
    const header = labelHeight
    const style = s.styles.get(n.id)
    const scale = Math.min(2, s.camera.zoom * n.scale, header / 56)
    const pad = 14 * scale, available = Math.max(0, b.width - pad * 2)
    const type = system ? 'SOFTWARE SYSTEM' : n.element.type.toUpperCase()
    let size = (style?.fontSize ?? 14) * scale
    ctx.font = `600 ${size}px Inter, system-ui, sans-serif`
    size *= Math.min(1, Math.max(0, available - 24 * scale) / Math.max(1, textWidth(ctx, n.element.name)))
    ctx.globalAlpha = visibility(n, s.reveal) * (s.filtering && !s.matches.has(n.id) ? .3 : 1) * (style?.opacity ?? 100) / 100
    ctx.fillStyle = style?.color ?? colors.text; ctx.font = `600 ${size}px Inter, system-ui, sans-serif`
    ctx.save(); ctx.translate(b.x + pad, b.y + 16 * scale); ctx.scale(16 * scale / 24, 16 * scale / 24)
    ctx.strokeStyle = style?.color ?? colors.text; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    const icon = style?.shape === 'Cylinder' || n.element.tags.includes('Database') ? 'database' : n.element.type
    const path = icon === 'person' ? 'M20 21v-2a7 7 0 0 0-14 0v2 M12 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8'
      : icon === 'softwareSystem' ? 'M21 12a9 9 0 1 0-18 0a9 9 0 1 0 18 0 M3 12h18 M12 3a18 18 0 0 1 0 18a18 18 0 0 1 0-18'
      : icon === 'database' ? 'M20 6c0 4-16 4-16 0s16-4 16 0v12c0 4-16 4-16 0V6 M4 12c0 4 16 4 16 0'
      : icon === 'component' ? 'M8 3h8v5h5v8h-5v5H8v-5H3V8h5Z'
      : 'M12 3 3 8v9l9 5 9-5V8Z M3 8l9 5 9-5 M12 13v9'
    if (!iconPaths.has(icon)) iconPaths.set(icon, new Path2D(path))
    ctx.stroke(iconPaths.get(icon)!); ctx.restore()
    ctx.fillText(n.element.name, b.x + pad + 24 * scale, b.y + 16 * scale + size)
    const chipY = b.y + 36 * scale, chipHeight = 16 * scale
    ctx.font = `800 ${8 * scale}px Inter, system-ui, sans-serif`
    const chipWidth = Math.min(available, textWidth(ctx, type) + 10 * scale)
    ctx.save(); ctx.globalAlpha *= .15; ctx.fillStyle = style?.stroke ?? colors.border
    ctx.beginPath(); ctx.roundRect(b.x + pad, chipY, chipWidth, chipHeight, 3 * scale); ctx.fill(); ctx.restore()
    ctx.fillStyle = style?.color ?? colors.text; ctx.fillText(type, b.x + pad + 5 * scale, chipY + 11 * scale, available - 10 * scale)
    if (amount < .05 && b.height >= 100 * scale && n.element.description) {
      ctx.font = `${12 * scale}px Inter, system-ui, sans-serif`
      const words = n.element.description.split(/\s+/); let line = '', y = b.y + 69 * scale
      const limit = b.y + header - 28 * scale
      for (const word of words) {
        if (textWidth(ctx, line + word) > available && line) { if (y > limit) break; ctx.fillText(line, b.x + pad, y, available); y += 16.8 * scale; line = '' }
        line += word + ' '
      }
      if (y <= limit) ctx.fillText(line, b.x + pad, y, available)
    }
    if (amount < .05 && b.height >= 100 * scale && 'technology' in n.element && n.element.technology) {
      ctx.font = `500 ${10 * scale}px Inter, system-ui, sans-serif`
      ctx.fillText(n.element.technology, b.x + pad, b.y + b.height - 12 * scale, available)
    }
  }
  ctx.globalAlpha = 1
  for (const p of portals) {
    ctx.beginPath(); ctx.arc(p.point.x, p.point.y, 3.5, 0, Math.PI * 2); ctx.fillStyle = colors.surface; ctx.fill(); ctx.strokeStyle = colors.muted; ctx.lineWidth = 1.5; ctx.stroke()
  }
  return portals
}
