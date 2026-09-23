import type { ElementStyle, Group, Relationship, RelationshipStyle } from '@/types/model'
import { contains, type Box, type MapLayout, type MapNode, type Bundle, type Connection } from './layout'
import { borderPoint, projected, screenBox, visibility, type Camera, type Point } from './motion'
import { descriptionLayout, textInset } from './text'
import { overlaps, edgeLabelBox, edgeLabelOpacity } from './edgeLabels'
export interface Portal { key: string; bundle: Bundle; node: MapNode; point: Point }
export interface RenderState {
  edgeLabels?: Box[]
  edgeLabelAnchors?: Point[]
  textLayouts?: Map<string, { scale: number; descriptionScale: number; lines: string[] }>
  expandableFrames?: Box[]
  drawnEdges?: { d: string; color: string; width: number; dashed: boolean; alpha: number }[]
  groups?: Group[]; selectedGroup?: string | null; selectedRelationship?: string | null; relationshipStyles?: RelationshipStyle[]
  edgeHits?: { path: Path2D; relationship: Relationship; start: Point; end: Point }[]
  styles: Map<string, ElementStyle | undefined>; layout: MapLayout; connections: Connection[]; bundles: Bundle[]; camera: Camera; reveal: Map<string, number>
  selected: Set<string>; hovered: string | null; portalAmounts: Map<string, number>; matches: Set<string>; filtering: boolean
}
export interface Palette { grid: string; edge: string; background: string; surface: string; text: string; muted: string; accent: string; border: string }
const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
const widths = new Map<string, number>()
const iconPaths = new Map<string, Path2D>()
export function groupBoxes(s: RenderState) {
  return (s.groups ?? []).flatMap(group => {
    const nodes = group.elementIds.map(id => s.layout.byId.get(id)).filter((n): n is MapNode => !!n && visibility(n, s.reveal) > .5)
    if (nodes.length < 2) return []
    const boxes = nodes.map(n => screenBox(n, s.camera)), scale = Math.min(1, s.camera.zoom * Math.min(...nodes.map(n => n.scale)))
    const x = Math.min(...boxes.map(b => b.x)) - 24 * scale, y = Math.min(...boxes.map(b => b.y)) - 40 * scale
    return [{ group, x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x + 24 * scale, height: Math.max(...boxes.map(b => b.y + b.height)) - y + 24 * scale, scale }]
  })
}
const relationshipStyle = (s: RenderState, r?: Relationship) => (s.relationshipStyles ?? []).filter(style => style.tag === 'Relationship' || r?.tags.includes(style.tag)).reduce((acc, style) => ({ ...acc, ...style }), {} as Partial<RelationshipStyle>)
function textWidth(ctx: CanvasRenderingContext2D, text: string) {
  const key = ctx.font + ':' + text
  if (!widths.has(key)) { if (widths.size > 10000) widths.clear(); widths.set(key, ctx.measureText(text).width) }
  return widths.get(key)!
}
export function drawMap(ctx: CanvasRenderingContext2D, width: number, height: number, s: RenderState, colors: Palette): Portal[] {
  s.edgeHits = []
  s.edgeLabels = []
  s.edgeLabelAnchors = []
  s.textLayouts = new Map()
  s.expandableFrames = []
  s.drawnEdges = []
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
  function label(text: string, anchor: Point, start: Point, end: Point, from: MapNode, to: MapNode, alpha: number) {
    const scale = Math.min(2, s.camera.zoom * Math.min(from.scale, to.scale))
    const size = 11 * scale, opacity = alpha * edgeLabelOpacity(size)
    if (opacity <= .01) return
    ctx.font = `${size}px Inter, system-ui, sans-serif`
    const maxWidth = Math.min(180 * scale, Math.hypot(end.x - start.x, end.y - start.y) - 12 * scale)
    if (maxWidth < 24 * scale) return
    let caption = text
    if (textWidth(ctx, caption) > maxWidth) {
      while (caption && textWidth(ctx, caption + '…') > maxWidth) caption = caption.slice(0, -1)
      caption += '…'
    }
    const w = textWidth(ctx, caption), pad = 4 * scale
    const box = edgeLabelBox(anchor, w, size, scale)
    // A containing boundary is the backdrop, not an obstacle. Endpoints and
    // other visible nodes must remain clear, as must already-placed captions.
    if (visible.some(n => {
      if ((n !== from && contains(n, from)) || (n !== to && contains(n, to))) return false
      return overlaps(box, boxes.get(n.id)!)
    }) || s.edgeLabels!.some(other => overlaps(box, other))) return
    s.edgeLabels!.push(box)
    s.edgeLabelAnchors!.push(anchor)
    ctx.save(); ctx.globalAlpha = opacity
    ctx.fillStyle = colors.background; ctx.fillRect(box.x, box.y, box.width, box.height)
    ctx.fillStyle = colors.muted; ctx.fillText(caption, box.x + pad, box.y + size)
    ctx.restore()
  }
  function edge(a: Box, b: Box, from: MapNode, to: MapNode, external: boolean, async: boolean, alpha: number, self = false, relationship?: Relationship) {
    if (alpha < .002) return
    if (!self && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.width - b.width) < .01) return
    const start = borderPoint(a, center(b)), end = borderPoint(b, center(a))
    // Offset directed trunks so opposing directions remain separately hit-testable.
    if (external) { const angle = Math.atan2(end.y - start.y, end.x - start.x); const dx = -Math.sin(angle) * 5, dy = Math.cos(angle) * 5; start.x += dx; end.x += dx; start.y += dy; end.y += dy }
    // Entirely off-screen routes cannot contribute pixels or underpasses.
    if (!self && (Math.max(start.x, end.x) < -12 || Math.min(start.x, end.x) > width + 12 || Math.max(start.y, end.y) < -12 || Math.min(start.y, end.y) > height + 12)) return { start, end, labelPoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } }
    const horizontal = Math.abs(end.x - start.x) > Math.abs(end.y - start.y)
    const sign = horizontal ? Math.sign(end.x - start.x) : Math.sign(end.y - start.y)
    const angle = relationship?.lineStyle === 'Straight' ? Math.atan2(end.y - start.y, end.x - start.x) : horizontal ? (sign >= 0 ? 0 : Math.PI) : (sign >= 0 ? Math.PI / 2 : -Math.PI / 2), arrow = 5
    const bend = Math.max(25, (horizontal ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y)) * .45)
    const shaftCut = arrow * 1.3 * Math.cos(.48)
    const style = relationshipStyle(s, relationship)
    let d: string, labelPoint: Point
    if (self) {
      start.x = a.x + a.width; start.y = a.y + a.height * .65; end.x = start.x; end.y = a.y + a.height * .3
      const p1 = { x: start.x + 35, y: start.y + 20 }, p2 = { x: end.x + 35, y: end.y - 20 }, p3 = { x: end.x + shaftCut, y: end.y }
      d = `M${start.x} ${start.y} C${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`
      labelPoint = { x: (start.x + 3 * p1.x + 3 * p2.x + p3.x) / 8, y: (start.y + 3 * p1.y + 3 * p2.y + p3.y) / 8 }
    } else if (relationship?.lineStyle === 'Straight') {
      d = `M${start.x} ${start.y} L${end.x} ${end.y}`; labelPoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    } else if (relationship?.lineStyle === 'Orthogonal') {
      const middle = horizontal ? (start.x + end.x) / 2 : (start.y + end.y) / 2
      d = horizontal ? `M${start.x} ${start.y} H${middle} V${end.y} H${end.x}` : `M${start.x} ${start.y} V${middle} H${end.x} V${end.y}`
      labelPoint = horizontal ? { x: (start.x + middle) / 2, y: start.y } : { x: start.x, y: (start.y + middle) / 2 }
    } else {
      const p1 = { x: start.x + (horizontal ? sign * bend : 0), y: start.y + (horizontal ? 0 : sign * bend) }
      const p2 = { x: end.x - (horizontal ? sign * bend : 0), y: end.y - (horizontal ? 0 : sign * bend) }
      const p3 = { x: end.x - Math.cos(angle) * shaftCut, y: end.y - Math.sin(angle) * shaftCut }
      d = `M${start.x} ${start.y} C${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`
      labelPoint = { x: (start.x + 3 * p1.x + 3 * p2.x + p3.x) / 8, y: (start.y + 3 * p1.y + 3 * p2.y + p3.y) / 8 }
    }
    const path = new Path2D(d)
    s.drawnEdges!.push({ d, color: style.color ?? colors.edge, width: style.thickness ?? (external ? 1.25 : 1.5), dashed: async || !!style.dashed, alpha })
    const paint = (opacity: number) => {
      ctx.globalAlpha = opacity; ctx.strokeStyle = relationship?.id === s.selectedRelationship ? colors.accent : style.color ?? colors.edge; ctx.fillStyle = ctx.strokeStyle
      ctx.lineWidth = relationship?.id === s.selectedRelationship ? 2.5 : style.thickness ?? (external ? 1.25 : 1.5); ctx.setLineDash(async || style.dashed ? [5, 4] : []); ctx.stroke(path); ctx.setLineDash([])
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
    if (relationship) s.edgeHits!.push({ path, relationship, start, end })
    if (!external && relationship?.description && alpha > .3) {
      label(relationship.description, labelPoint, start, end, from, to, alpha)
    }
    return { start, end, labelPoint }
  }
  for (const b of groupBoxes(s)) {
    ctx.strokeStyle = s.selectedGroup === b.group.id ? colors.accent : colors.border
    ctx.lineWidth = 1; ctx.setLineDash([6, 4]); ctx.strokeRect(b.x, b.y, b.width, b.height); ctx.setLineDash([])
    ctx.fillStyle = colors.muted; ctx.font = `${Math.max(9, 12 * b.scale)}px Inter, system-ui, sans-serif`; ctx.fillText(b.group.name, b.x + 8, b.y + 16)
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
    if (n.children.length) {
      const amount = s.reveal.get(n.id) ?? 0
      const inset = Math.min(8 * scale, b.width * .08, b.height * .08)
      const frame = { x: b.x + inset, y: b.y + inset, width: b.width - inset * 2, height: b.height - inset * 2 }
      s.expandableFrames.push(frame)
      ctx.save()
      ctx.globalAlpha *= .52 * (1 - amount)
      ctx.strokeStyle = style?.color ?? colors.text
      ctx.lineWidth = Math.max(.75, scale)
      ctx.beginPath(); ctx.roundRect(frame.x, frame.y, frame.width, frame.height, Math.max(3, 7 * scale)); ctx.stroke()
      ctx.restore()
    }
  }
  ctx.globalAlpha = 1
  const relevant = (n: MapNode) => [...s.selected].some(id => { const selected = s.layout.byId.get(id); return selected && contains(selected, n) })
  for (const bundle of s.bundles) {
    const points = edge(boxes.get(bundle.from.id)!, boxes.get(bundle.to.id)!, bundle.from, bundle.to, true,
      bundle.connections[0].relationship.interactionStyle === 'Asynchronous', .5, false, bundle.connections.length === 1 ? bundle.connections[0].relationship : undefined)
    if (!points) continue
    const caption = bundle.connections.length === 1 ? bundle.connections[0].relationship.description : `${bundle.connections.length} relationships`
    if (caption) label(caption, points.labelPoint, points.start, points.end, bundle.from, bundle.to, .8)
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
        if (node === bundle.from) edge(b, dot, c.from, c.to, true, c.relationship.interactionStyle === 'Asynchronous', amount * .7, false, c.relationship)
        else edge(dot, b, c.from, c.to, true, c.relationship.interactionStyle === 'Asynchronous', amount * .7, false, c.relationship)
      }
    }
  }
  for (const c of s.connections) {
    if (c.external) continue
    const alpha = Math.max(visibility(c.from, s.reveal), visibility(c.to, s.reveal))
    edge(screenBox(projected(c.from, s.reveal), s.camera), screenBox(projected(c.to, s.reveal), s.camera), c.from, c.to, false,
      c.relationship.interactionStyle === 'Asynchronous', alpha * .7, c.from === c.to && visibility(c.from, s.reveal) > .9, c.relationship)
  }
  for (const n of visible) {
    const original = boxes.get(n.id)!, system = n.element.type === 'softwareSystem'
    const amount = n.children.length ? (s.reveal.get(n.id) ?? 0) : 0
    const reserved = 40 * n.scale * s.camera.zoom
    const labelHeight = original.height * (1 - amount) + reserved * amount
    const b = original
    // Header geometry stays fixed throughout reveal; labels cannot overlap
    // children that are fading in at their persistent world positions.
    const header = labelHeight
    const style = s.styles.get(n.id)
    ctx.font = '12px Inter, system-ui, sans-serif'
    const description = descriptionLayout(n.element.description ?? '', n.width / n.scale, n.height / n.scale, n.element.type === 'person', value => textWidth(ctx, value))
    const descriptionScale = s.camera.zoom * n.scale * description.scale
    const scale = Math.min(n.children.length ? 2 : Infinity, descriptionScale, header / 56)
    const pad = textInset(n.element.type === 'person', b.height, scale), available = Math.max(0, b.width - pad * 2)
    const descriptionLines = description.lines
    s.textLayouts.set(n.id, { scale, descriptionScale, lines: descriptionLines })
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
    ctx.save()
    // Fade metadata continuously as the title moves into its boundary header.
    ctx.globalAlpha *= 1 - amount
    if (amount < 1 && n.element.description) {
      ctx.font = `${12 * descriptionScale}px Inter, system-ui, sans-serif`
      const inset = textInset(n.element.type === 'person', b.height, descriptionScale)
      for (let i = 0; i < descriptionLines.length; i++) {
        const y = b.y + (69 + i * 16.8) * descriptionScale
        const fade = Math.max(0, Math.min(1, (b.y + header - 12 * descriptionScale - y) / (16 * descriptionScale)))
        ctx.save(); ctx.globalAlpha *= fade
        ctx.fillText(descriptionLines[i], b.x + inset, y); ctx.restore()
      }
    }
    if (amount < 1 && !n.children.length && b.height >= 100 * scale && 'technology' in n.element && n.element.technology) {
      ctx.font = `500 ${10 * scale}px Inter, system-ui, sans-serif`
      ctx.fillText(n.element.technology, b.x + pad, b.y + b.height - 12 * scale, available)
    }
    ctx.restore()
  }
  ctx.globalAlpha = 1
  for (const p of portals) {
    ctx.beginPath(); ctx.arc(p.point.x, p.point.y, 3.5, 0, Math.PI * 2); ctx.fillStyle = colors.surface; ctx.fill(); ctx.strokeStyle = colors.muted; ctx.lineWidth = 1.5; ctx.stroke()
  }
  return portals
}
