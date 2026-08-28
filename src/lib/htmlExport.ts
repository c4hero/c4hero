import type { Node, Edge } from '@xyflow/react'
import type {
  ElementStyle,
  ModelElement,
  Relationship,
  View,
  Workspace,
} from '@/types/model'
import { applyAutoLayout, type LayoutBoundaryCluster } from '@/lib/canvasLayout'
import { THEMES } from '@/lib/themes'
import { normalizeSafeExternalUrl } from '@/lib/safeUrl'

/**
 * Export a workspace as one self-contained `.html` file.
 *
 * The result is a read-only viewer: every view of the workspace, laid out and
 * rendered to inline SVG at export time, plus a small script for panning,
 * zooming, view switching, drill-through, search and element details. There is
 * no editor, no assistant, and — by construction — no network. Everything the
 * page needs is in the file, and its own `Content-Security-Policy` meta tag
 * forbids loading anything from anywhere else, so it renders identically on a
 * laptop with the wifi off, in a wiki, or from a build artifact five years from
 * now.
 *
 * Deterministic: the same workspace produces byte-identical output (no
 * timestamps, no ids from a counter), so exports diff cleanly in review.
 *
 * Only the four view types the canvas draws are exported — system landscape,
 * system context, container and component. Dynamic and deployment views are
 * carried by the model but not yet rendered anywhere, so they are skipped
 * rather than shown as blank pages.
 */

// ─── Geometry constants ──────────────────────────────────────────────

const NODE_W = 220
const NODE_PAD = 14
const TYPE_H = 13
const NAME_LH = 18
const META_LH = 14
const DESC_LH = 15
const MIN_NODE_H = 92

/** Rough monospace-free width estimates: enough to wrap text sensibly without
 *  a DOM to measure in. Overshooting a little is safer than clipping. */
const NAME_CHARS = 24
const DESC_CHARS = 31
const TECH_CHARS = 30
const NAME_MAX_LINES = 3
const DESC_MAX_LINES = 3

const BOUNDARY_PAD = 30
const BOUNDARY_PAD_TOP = 54
const GROUP_PAD = 22
const GROUP_PAD_TOP = 46
const CANVAS_PAD = 48
/** Floor for the viewBox. The SVG scales to fit its container, which would
 *  blow a two-node view up to fill a 4K display; padding the viewBox out to a
 *  screen-ish size instead keeps small diagrams at a sane reading size. */
const MIN_STAGE_W = 1100
const MIN_STAGE_H = 680

/** Display label per element type. These double as Structurizr's implicit type
 *  tags (`Person`, `Software System`, ...), which is what the style cascade
 *  keys on. */
const TYPE_LABEL: Record<ModelElement['type'], string> = {
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
}

// ─── Public API ──────────────────────────────────────────────────────

export interface HtmlExportOptions {
  /** Base element styles — pass the active canvas theme so the export looks
   *  like what the user is looking at. Defaults to the Structurizr palette. */
  themeStyles?: ElementStyle[]
  /** Diagram surface color. Defaults to the dark canvas. */
  background?: string
  /** Page heading. Defaults to the workspace name. */
  title?: string
  /** Credited in the footer, e.g. `c4hero 0.3.0`. */
  generator?: string
}

interface RenderNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  typeLabel: string
  nameLines: string[]
  technology?: string
  descLines: string[]
  background: string
  color: string
  stroke: string
  strokeWidth: number
  /** View key to open when this node is drilled into. */
  drillTo?: string
}

interface RenderEdge {
  x1: number
  y1: number
  x2: number
  y2: number
  label?: string
  dashed: boolean
  color?: string
}

interface RenderRect {
  x: number
  y: number
  w: number
  h: number
  label: string
  sublabel?: string
  kind: 'boundary' | 'group'
}

interface RenderView {
  key: string
  title: string
  type: View['type']
  description?: string
  width: number
  height: number
  nodes: RenderNode[]
  edges: RenderEdge[]
  rects: RenderRect[]
}

/** Element detail shown in the viewer's side panel, keyed by element id. */
interface ViewerElement {
  name: string
  type: string
  technology?: string
  description?: string
  tags?: string[]
  owner?: string
  status?: string
  url?: string
  drillTo?: string
}

export function exportWorkspaceAsHtml(workspace: Workspace, options: HtmlExportOptions = {}): string {
  const themeStyles = options.themeStyles ?? THEMES.structurizr
  const background = options.background ?? '#0a0f14'
  const title = options.title ?? workspace.name ?? 'Architecture'
  const drillTargets = buildDrillTargets(workspace)

  const views = exportableViews(workspace).map((view) =>
    layoutView(workspace, view, themeStyles, drillTargets),
  )

  const data = {
    title,
    views: views.map((view) => ({ key: view.key, title: view.title, type: view.type, description: view.description })),
    elements: buildElementDetails(workspace, drillTargets),
  }

  return renderDocument({ title, background, views, data, generator: options.generator })
}

/** Suggested filename for a workspace export. */
export function htmlExportFilename(workspace: Workspace): string {
  return `${workspace.name?.trim() || 'workspace'}.html`
}

// ─── View selection & drill targets ──────────────────────────────────

function exportableViews(workspace: Workspace): View[] {
  return [
    ...workspace.views.systemLandscapeViews,
    ...workspace.views.systemContextViews,
    ...workspace.views.containerViews,
    ...workspace.views.componentViews,
  ]
}

/** element id -> the view key that drilling into it should open. Mirrors the
 *  canvas: a system opens its container view (or its context view), a container
 *  opens its component view. */
function buildDrillTargets(workspace: Workspace): Map<string, string> {
  const targets = new Map<string, string>()
  for (const view of workspace.views.systemContextViews) {
    if (view.softwareSystemId) targets.set(view.softwareSystemId, view.key)
  }
  for (const view of workspace.views.containerViews) {
    if (view.softwareSystemId) targets.set(view.softwareSystemId, view.key)
  }
  for (const view of workspace.views.componentViews) {
    if (view.containerId) targets.set(view.containerId, view.key)
  }
  return targets
}

function indexElements(workspace: Workspace): Map<string, ModelElement> {
  const index = new Map<string, ModelElement>()
  for (const person of workspace.model.people) index.set(person.id, person)
  for (const system of workspace.model.softwareSystems) {
    index.set(system.id, system)
    for (const container of system.containers) {
      index.set(container.id, container)
      for (const component of container.components) index.set(component.id, component)
    }
  }
  return index
}

function buildElementDetails(
  workspace: Workspace,
  drillTargets: Map<string, string>,
): Record<string, ViewerElement> {
  const details: Record<string, ViewerElement> = {}
  for (const [id, element] of indexElements(workspace)) {
    const technology = 'technology' in element ? element.technology : undefined
    details[id] = {
      name: element.name,
      type: TYPE_LABEL[element.type],
      ...(technology ? { technology } : {}),
      ...(element.description ? { description: element.description } : {}),
      ...(element.tags.length > 0 ? { tags: element.tags } : {}),
      ...(element.owner ? { owner: element.owner } : {}),
      ...(element.status ? { status: element.status } : {}),
      ...(safeUrl(element.url) ? { url: safeUrl(element.url)! } : {}),
      ...(drillTargets.has(id) ? { drillTo: drillTargets.get(id) } : {}),
    }
  }
  return details
}

function safeUrl(raw: string | undefined): string | null {
  return raw ? normalizeSafeExternalUrl(raw) : null
}

// ─── Styling ─────────────────────────────────────────────────────────

/** Structurizr's style cascade (Element -> type tag -> custom tags in order),
 *  resolved against a flat tag index. The canvas does the same thing for DOM
 *  nodes in `canvasBuilders`; this is the SVG-side equivalent, kept here so the
 *  exporter stays a leaf module with no dependency on the canvas layer. */
function resolveStyle(element: ModelElement, index: Map<string, ElementStyle>): ElementStyle {
  const typeTag = TYPE_LABEL[element.type]
  let resolved: ElementStyle = { tag: typeTag }
  const base = index.get('Element')
  if (base) resolved = { ...resolved, ...base }
  const typeStyle = index.get(typeTag)
  if (typeStyle) resolved = { ...resolved, ...typeStyle }
  for (const tag of element.tags) {
    if (tag === 'Element' || tag === typeTag) continue
    const tagStyle = index.get(tag)
    if (tagStyle) resolved = { ...resolved, ...tagStyle }
  }
  return resolved
}

function buildStyleIndex(styles: ElementStyle[]): Map<string, ElementStyle> {
  const index = new Map<string, ElementStyle>()
  for (const style of styles) index.set(style.tag, { ...index.get(style.tag), ...style })
  return index
}

// ─── Text ────────────────────────────────────────────────────────────

/** Greedy word wrap with a hard break for words longer than the line, and an
 *  ellipsis when the text runs past `maxLines`. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  const lines: string[] = []
  let current = ''

  for (const word of normalized.split(' ')) {
    let pending = word
    while (pending.length > maxChars) {
      if (current) { lines.push(current); current = '' }
      lines.push(pending.slice(0, maxChars))
      pending = pending.slice(maxChars)
      if (lines.length >= maxLines) return ellipsize(lines, maxLines)
    }
    const candidate = current ? `${current} ${pending}` : pending
    if (candidate.length <= maxChars) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = pending
    if (lines.length >= maxLines) return ellipsize([...lines, current], maxLines)
  }
  if (current) lines.push(current)
  return lines.length > maxLines ? ellipsize(lines, maxLines) : lines
}

function ellipsize(lines: string[], maxLines: number): string[] {
  const kept = lines.slice(0, maxLines)
  const last = kept[maxLines - 1]
  kept[maxLines - 1] = `${last.replace(/[\s.]+$/, '').slice(0, Math.max(1, last.length - 1))}...`
  return kept
}

function truncate(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars - 3)}...`
}

// ─── Layout ──────────────────────────────────────────────────────────

interface NodeShape {
  nameLines: string[]
  descLines: string[]
  technology?: string
  height: number
}

function shapeOf(element: ModelElement): NodeShape {
  const nameLines = wrapText(element.name, NAME_CHARS, NAME_MAX_LINES)
  const descLines = element.description ? wrapText(element.description, DESC_CHARS, DESC_MAX_LINES) : []
  const rawTech = 'technology' in element ? element.technology : undefined
  const technology = rawTech?.trim() ? truncate(rawTech, TECH_CHARS) : undefined

  let height = NODE_PAD + TYPE_H + 6 + nameLines.length * NAME_LH + NODE_PAD
  if (technology) height += META_LH
  if (descLines.length > 0) height += 6 + descLines.length * DESC_LH
  return { nameLines, descLines, technology, height: Math.max(MIN_NODE_H, height) }
}

/** The boundaries the canvas would draw for this view: one per parent whose
 *  children appear on it. */
function boundariesFor(
  workspace: Workspace,
  view: View,
  present: Set<string>,
): Array<{ id: string; name: string; typeLabel: string; elementIds: string[] }> {
  const boundaries: Array<{ id: string; name: string; typeLabel: string; elementIds: string[] }> = []
  if (view.type === 'container') {
    for (const system of workspace.model.softwareSystems) {
      const elementIds = system.containers.map((c) => c.id).filter((id) => present.has(id))
      if (elementIds.length > 0) {
        boundaries.push({ id: system.id, name: system.name, typeLabel: 'Software System', elementIds })
      }
    }
  } else if (view.type === 'component') {
    for (const system of workspace.model.softwareSystems) {
      for (const container of system.containers) {
        const elementIds = container.components.map((c) => c.id).filter((id) => present.has(id))
        if (elementIds.length > 0) {
          boundaries.push({ id: container.id, name: container.name, typeLabel: 'Container', elementIds })
        }
      }
    }
  }
  return boundaries
}

function bboxOf(rects: Array<{ x: number; y: number; w: number; h: number }>) {
  return {
    minX: Math.min(...rects.map((r) => r.x)),
    minY: Math.min(...rects.map((r) => r.y)),
    maxX: Math.max(...rects.map((r) => r.x + r.w)),
    maxY: Math.max(...rects.map((r) => r.y + r.h)),
  }
}

/** Where the centre-to-centre line between two boxes crosses the source box's
 *  border — so arrows touch the edge of a node instead of vanishing under it. */
function borderPoint(
  from: { x: number; y: number; w: number; h: number },
  to: { x: number; y: number; w: number; h: number },
): { x: number; y: number } {
  const cx = from.x + from.w / 2
  const cy = from.y + from.h / 2
  const dx = (to.x + to.w / 2) - cx
  const dy = (to.y + to.h / 2) - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const halfW = from.w / 2
  const halfH = from.h / 2
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : halfW / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : halfH / Math.abs(dy),
  )
  return { x: cx + dx * scale, y: cy + dy * scale }
}

function layoutView(
  workspace: Workspace,
  view: View,
  themeStyles: ElementStyle[],
  drillTargets: Map<string, string>,
): RenderView {
  const elementIndex = indexElements(workspace)
  const styleIndex = buildStyleIndex([...themeStyles, ...workspace.views.configuration.styles.elements])

  const members = view.elements
    .map((viewElement) => ({ viewElement, element: elementIndex.get(viewElement.id) }))
    .filter((entry): entry is { viewElement: View['elements'][number]; element: ModelElement } => !!entry.element)

  const shapes = new Map(members.map(({ element }) => [element.id, shapeOf(element)]))
  const present = new Set(members.map(({ element }) => element.id))

  // Reuse the canvas layout engine: nodes with saved positions stay put, the
  // rest get a dagre placement, boundaries and groups cluster their members.
  const layoutNodes: Node[] = members.map(({ viewElement, element }) => ({
    id: element.id,
    position: { x: viewElement.x ?? 0, y: viewElement.y ?? 0 },
    measured: { width: NODE_W, height: shapes.get(element.id)!.height },
    data: {},
  }))

  const relationships = new Map(workspace.model.relationships.map((rel) => [rel.id, rel]))
  const viewRelationships: Relationship[] = []
  for (const viewRel of view.relationships) {
    const rel = relationships.get(viewRel.id)
    if (!rel) continue
    if (!present.has(rel.sourceId) || !present.has(rel.destinationId)) continue
    viewRelationships.push(rel)
  }
  const layoutEdges: Edge[] = viewRelationships.map((rel) => ({
    id: rel.id, source: rel.sourceId, target: rel.destinationId,
  }))

  const boundaries = boundariesFor(workspace, view, present)
  const clusters: LayoutBoundaryCluster[] = boundaries.map((b) => ({ id: b.id, elementIds: b.elementIds }))
  const focalId = view.type === 'container' ? view.softwareSystemId : view.type === 'component' ? view.containerId : undefined
  const focalIds = new Set(boundaries.find((b) => b.id === focalId)?.elementIds ?? [])

  const positioned = applyAutoLayout(
    layoutNodes,
    layoutEdges,
    view,
    workspace.model.groups,
    view.autoLayout?.direction ?? 'TB',
    focalIds,
    clusters,
  )

  const boxes = new Map(
    positioned.map((node) => [
      node.id,
      { x: node.position.x, y: node.position.y, w: NODE_W, h: shapes.get(node.id)!.height },
    ]),
  )

  // Overlay rectangles, computed from the final member positions.
  const rects: RenderRect[] = []
  for (const boundary of boundaries) {
    const memberBoxes = boundary.elementIds.map((id) => boxes.get(id)).filter((box) => box !== undefined)
    if (memberBoxes.length === 0) continue
    const box = bboxOf(memberBoxes)
    rects.push({
      kind: 'boundary',
      x: box.minX - BOUNDARY_PAD,
      y: box.minY - BOUNDARY_PAD_TOP,
      w: (box.maxX - box.minX) + BOUNDARY_PAD * 2,
      h: (box.maxY - box.minY) + BOUNDARY_PAD_TOP + BOUNDARY_PAD,
      label: boundary.name,
      sublabel: boundary.typeLabel,
    })
  }
  for (const group of workspace.model.groups) {
    const memberBoxes = group.elementIds.map((id) => boxes.get(id)).filter((box) => box !== undefined)
    if (memberBoxes.length < 2) continue
    const box = bboxOf(memberBoxes)
    rects.push({
      kind: 'group',
      x: box.minX - GROUP_PAD,
      y: box.minY - GROUP_PAD_TOP,
      w: (box.maxX - box.minX) + GROUP_PAD * 2,
      h: (box.maxY - box.minY) + GROUP_PAD_TOP + GROUP_PAD,
      label: group.name,
    })
  }

  // Normalize so the diagram starts at the origin with a margin, keeping the
  // viewBox tight regardless of where the saved coordinates happened to live.
  const all = [...boxes.values(), ...rects]
  const bounds = all.length > 0 ? bboxOf(all) : { minX: 0, minY: 0, maxX: 400, maxY: 200 }
  const contentW = (bounds.maxX - bounds.minX) + CANVAS_PAD * 2
  const contentH = (bounds.maxY - bounds.minY) + CANVAS_PAD * 2
  const stageW = Math.max(contentW, MIN_STAGE_W)
  const stageH = Math.max(contentH, MIN_STAGE_H)
  // Any slack from the minimum stage size goes evenly on both sides, so a
  // small diagram sits centred rather than pinned to the top-left.
  const offsetX = CANVAS_PAD + (stageW - contentW) / 2 - bounds.minX
  const offsetY = CANVAS_PAD + (stageH - contentH) / 2 - bounds.minY

  const relationshipStyles = workspace.views.configuration.styles.relationships
  const edges: RenderEdge[] = []
  for (const rel of viewRelationships) {
    const from = boxes.get(rel.sourceId)
    const to = boxes.get(rel.destinationId)
    if (!from || !to) continue
    const shifted = (box: typeof from) => ({ ...box, x: box.x + offsetX, y: box.y + offsetY })
    const source = shifted(from)
    const target = shifted(to)
    const start = borderPoint(source, target)
    const end = borderPoint(target, source)
    const style = relationshipStyles.filter((s) => rel.tags.includes(s.tag)).at(-1)
    const label = [rel.description?.trim(), rel.technology?.trim() ? `[${rel.technology.trim()}]` : '']
      .filter(Boolean)
      .join(' ')
    edges.push({
      x1: round(start.x), y1: round(start.y), x2: round(end.x), y2: round(end.y),
      label: label ? truncate(label, 44) : undefined,
      dashed: style?.dashed === true || rel.interactionStyle === 'Asynchronous',
      color: style?.color,
    })
  }

  const nodes: RenderNode[] = members.map(({ element }) => {
    const box = boxes.get(element.id)!
    const shape = shapes.get(element.id)!
    const style = resolveStyle(element, styleIndex)
    return {
      id: element.id,
      x: round(box.x + offsetX),
      y: round(box.y + offsetY),
      w: box.w,
      h: box.h,
      typeLabel: TYPE_LABEL[element.type],
      nameLines: shape.nameLines,
      technology: shape.technology,
      descLines: shape.descLines,
      background: style.background ?? '#1f2937',
      color: style.color ?? '#e5e7eb',
      stroke: style.stroke ?? style.color ?? '#64748b',
      // Coerced rather than trusted: unlike the colors, this lands in an SVG
      // attribute as a bare number, and a workspace can reach us from
      // localStorage or an imported JSON that never went through the DSL
      // parser's numeric guard.
      strokeWidth: finiteOr(style.strokeWidth, 1.5),
      drillTo: drillTargets.get(element.id) === view.key ? undefined : drillTargets.get(element.id),
    }
  })

  for (const rect of rects) {
    rect.x = round(rect.x + offsetX)
    rect.y = round(rect.y + offsetY)
    rect.w = round(rect.w)
    rect.h = round(rect.h)
  }

  return {
    key: view.key,
    title: view.title?.trim() || view.key,
    type: view.type,
    description: view.description?.trim() || undefined,
    width: round(stageW),
    height: round(stageH),
    nodes,
    edges,
    rects,
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function finiteOr(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

// ─── Serialization ───────────────────────────────────────────────────

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** JSON safe to sit inside a `<script>` element: the only sequence that can end
 *  the element early is `</`, and escaping `<` removes it. */
function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function renderNode(node: RenderNode): string {
  const lines: string[] = []
  let cursor = node.y + NODE_PAD + TYPE_H
  lines.push(
    `<text class="n-type" x="${node.x + NODE_PAD}" y="${round(cursor)}" fill="${escapeHtml(node.color)}">${escapeHtml(node.typeLabel.toUpperCase())}</text>`,
  )
  cursor += 6
  for (const line of node.nameLines) {
    cursor += NAME_LH
    lines.push(`<text class="n-name" x="${node.x + NODE_PAD}" y="${round(cursor)}" fill="${escapeHtml(node.color)}">${escapeHtml(line)}</text>`)
  }
  if (node.technology) {
    cursor += META_LH
    lines.push(`<text class="n-tech" x="${node.x + NODE_PAD}" y="${round(cursor)}" fill="${escapeHtml(node.color)}">${escapeHtml(`[${node.technology}]`)}</text>`)
  }
  if (node.descLines.length > 0) {
    cursor += 6
    for (const line of node.descLines) {
      cursor += DESC_LH
      lines.push(`<text class="n-desc" x="${node.x + NODE_PAD}" y="${round(cursor)}" fill="${escapeHtml(node.color)}">${escapeHtml(line)}</text>`)
    }
  }

  const label = [node.typeLabel, node.nameLines.join(' ')].join(': ')
  const drill = node.drillTo ? ` data-drill="${escapeHtml(node.drillTo)}"` : ''
  return [
    `<g class="node" data-id="${escapeHtml(node.id)}"${drill} tabindex="0" role="button" aria-label="${escapeHtml(label)}">`,
    `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="8"`,
    ` fill="${escapeHtml(node.background)}" stroke="${escapeHtml(node.stroke)}" stroke-width="${node.strokeWidth}"/>`,
    ...lines,
    '</g>',
  ].join('')
}

function renderEdge(edge: RenderEdge, index: number): string {
  const color = edge.color ? escapeHtml(edge.color) : 'var(--edge)'
  const dash = edge.dashed ? ' stroke-dasharray="7 5"' : ''
  const midX = round((edge.x1 + edge.x2) / 2)
  const midY = round((edge.y1 + edge.y2) / 2)
  const label = edge.label
    ? `<text class="e-label" x="${midX}" y="${midY - 5}" text-anchor="middle">${escapeHtml(edge.label)}</text>`
    : ''
  return (
    `<g class="edge" data-edge="${index}">` +
    `<line x1="${edge.x1}" y1="${edge.y1}" x2="${edge.x2}" y2="${edge.y2}" stroke="${color}" stroke-width="1.6"${dash} marker-end="url(#c4-arrow)"/>` +
    label +
    '</g>'
  )
}

function renderRect(rect: RenderRect): string {
  const sub = rect.sublabel
    ? `<text class="r-sub" x="${rect.x + 16}" y="${rect.y + 42}">${escapeHtml(rect.sublabel)}</text>`
    : ''
  return (
    `<g class="rect ${rect.kind}">` +
    `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" rx="10"/>` +
    `<text class="r-label" x="${rect.x + 16}" y="${rect.y + 26}">${escapeHtml(rect.label)}</text>` +
    sub +
    '</g>'
  )
}

function renderViewSvg(view: RenderView, active: boolean): string {
  // Overlay rectangles first so nodes and edges paint on top of them.
  const body = [
    ...view.rects.map(renderRect),
    ...view.edges.map(renderEdge),
    ...view.nodes.map(renderNode),
  ].join('')
  return (
    `<div class="stage" data-view="${escapeHtml(view.key)}"${active ? '' : ' hidden'}>` +
    `<svg viewBox="0 0 ${view.width} ${view.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(view.title)}">` +
    '<defs><marker id="c4-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
    '<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge)"/></marker></defs>' +
    '<g class="viewport">' + body + '</g>' +
    '</svg></div>'
  )
}

interface DocumentInput {
  title: string
  background: string
  views: RenderView[]
  data: unknown
  generator?: string
}

function renderDocument({ title, background, views, data, generator }: DocumentInput): string {
  const tabs = views
    .map(
      (view, index) =>
        `<button type="button" class="tab" data-view="${escapeHtml(view.key)}"${index === 0 ? ' aria-current="page"' : ''}>` +
        `${escapeHtml(view.title)}<span class="tab-type">${escapeHtml(view.type)}</span></button>`,
    )
    .join('')

  // The first view renders visible: a reader whose browser blocks scripts still
  // gets a diagram instead of a blank page.
  const stages = views.map((view, index) => renderViewSvg(view, index === 0)).join('')
  const empty = views.length === 0
    ? '<p class="empty">This workspace has no views to render.</p>'
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(title)}</title>
<style>${VIEWER_CSS.replace('__BACKGROUND__', escapeHtml(background))}</style>
</head>
<body>
<header class="bar">
<h1>${escapeHtml(title)}</h1>
<div class="tabs" role="tablist">${tabs}</div>
<div class="tools">
<input id="q" type="search" placeholder="Search" aria-label="Search elements" autocomplete="off">
<button type="button" id="back" hidden>Back</button>
<button type="button" id="fit">Fit</button>
</div>
</header>
<main class="canvas">${stages}${empty}</main>
<aside id="details" class="details" hidden aria-label="Element details"></aside>
<footer class="foot"><span id="view-desc"></span><span class="grow"></span><span>${escapeHtml(generator ?? 'c4hero')} &middot; static export</span></footer>
<script type="application/json" id="c4-data">${embedJson(data)}</script>
<script>${VIEWER_SCRIPT}</script>
</body>
</html>
`
}

// ─── Viewer assets ───────────────────────────────────────────────────

const VIEWER_CSS = `
:root {
  --bg: __BACKGROUND__;
  --panel: #111820;
  --border: #253040;
  --text: #e6edf3;
  --muted: #93a4b8;
  --edge: #7d8ea3;
  --accent: #4c9aff;
}
/* The diagram keeps the palette it was exported with; only the surrounding
   chrome follows the reader's system theme. */
@media (prefers-color-scheme: light) {
  :root {
    --panel: #ffffff;
    --border: #d5dde7;
    --text: #10171f;
    --muted: #566173;
    --edge: #64748b;
  }
}
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  display: flex; flex-direction: column;
  background: var(--bg); color: var(--text);
  font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.bar {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 10px 14px; background: var(--panel); border-bottom: 1px solid var(--border);
}
.bar h1 { font-size: 14px; margin: 0; font-weight: 650; }
.tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.tab {
  display: flex; align-items: baseline; gap: 6px;
  padding: 4px 10px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--border); background: transparent; color: var(--muted);
  font: inherit; font-size: 12px;
}
.tab[aria-current] { color: var(--text); border-color: var(--accent); }
.tab-type { font-size: 10px; opacity: 0.6; }
.tools { margin-left: auto; display: flex; gap: 6px; }
.tools input, .tools button {
  font: inherit; font-size: 12px; padding: 4px 9px; border-radius: 6px;
  border: 1px solid var(--border); background: transparent; color: var(--text);
}
.tools button { cursor: pointer; }
.canvas { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.stage { position: absolute; inset: 0; }
.stage[hidden] { display: none; }
.stage svg { width: 100%; height: 100%; touch-action: none; cursor: grab; }
.stage svg.grabbing { cursor: grabbing; }
.node { cursor: pointer; }
.node text { pointer-events: none; }
.n-type { font-size: 9px; font-weight: 700; letter-spacing: 0.09em; opacity: 0.72; }
.n-name { font-size: 14px; font-weight: 650; }
.n-tech { font-size: 11px; font-style: italic; opacity: 0.8; }
.n-desc { font-size: 11.5px; opacity: 0.85; }
.node.dim { opacity: 0.18; }
.node.hit rect { stroke-width: 3; }
.node.selected rect { stroke: var(--accent); stroke-width: 3; }
.node:focus-visible rect { stroke: var(--accent); stroke-width: 3; }
.node:focus { outline: none; }
.rect rect { fill: none; stroke: var(--border); stroke-width: 1.4; }
.rect.boundary rect { stroke-dasharray: 6 5; }
.rect.group rect { stroke-dasharray: 2 6; }
.r-label { font-size: 12px; font-weight: 600; fill: var(--muted); }
.r-sub { font-size: 10px; letter-spacing: 0.08em; fill: var(--muted); opacity: 0.75; }
.e-label {
  font-size: 10.5px; fill: var(--muted);
  paint-order: stroke; stroke: var(--bg); stroke-width: 4px; stroke-linejoin: round;
}
.details {
  position: absolute; top: 62px; right: 14px; width: min(300px, 42vw); max-height: 70%;
  overflow: auto; padding: 12px 14px; border-radius: 10px;
  background: var(--panel); border: 1px solid var(--border);
}
.details h2 { margin: 0 0 2px; font-size: 14px; }
.details dl { margin: 10px 0 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; }
.details dt { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
.details dd { margin: 0; overflow-wrap: anywhere; }
.details .kind { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
.details button, .details a {
  display: inline-block; margin-top: 10px; margin-right: 8px; padding: 4px 9px;
  border-radius: 6px; border: 1px solid var(--border); background: transparent;
  color: var(--text); font: inherit; font-size: 12px; cursor: pointer; text-decoration: none;
}
.foot {
  display: flex; gap: 10px; padding: 6px 14px; font-size: 11px; color: var(--muted);
  background: var(--panel); border-top: 1px solid var(--border);
}
.grow { flex: 1; }
.empty { padding: 32px; text-align: center; color: var(--muted); }
@media (prefers-reduced-motion: no-preference) {
  .node.dim, .node.selected rect { transition: opacity 120ms ease, stroke 120ms ease; }
}
`.trim()

/** The viewer runtime. Plain ES5-compatible DOM code, no build step, no
 *  dependencies — it has to run from a `file://` URL forever. */
const VIEWER_SCRIPT = `
(function () {
  var data = JSON.parse(document.getElementById('c4-data').textContent || '{}');
  var stages = Array.prototype.slice.call(document.querySelectorAll('.stage'));
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  var details = document.getElementById('details');
  var viewDesc = document.getElementById('view-desc');
  var backBtn = document.getElementById('back');
  var search = document.getElementById('q');
  var history = [];
  var current = null;
  var pan = {};

  function stageFor(key) {
    for (var i = 0; i < stages.length; i++) {
      if (stages[i].getAttribute('data-view') === key) return stages[i];
    }
    return null;
  }

  function viewMeta(key) {
    var views = data.views || [];
    for (var i = 0; i < views.length; i++) if (views[i].key === key) return views[i];
    return null;
  }

  function applyTransform(key) {
    var stage = stageFor(key);
    if (!stage) return;
    var state = pan[key] || (pan[key] = { x: 0, y: 0, k: 1 });
    var group = stage.querySelector('.viewport');
    group.setAttribute('transform', 'translate(' + state.x + ',' + state.y + ') scale(' + state.k + ')');
  }

  function show(key, record) {
    if (!stageFor(key)) return;
    if (record && current && current !== key) history.push(current);
    current = key;
    for (var i = 0; i < stages.length; i++) {
      stages[i].hidden = stages[i].getAttribute('data-view') !== key;
    }
    for (var t = 0; t < tabs.length; t++) {
      if (tabs[t].getAttribute('data-view') === key) tabs[t].setAttribute('aria-current', 'page');
      else tabs[t].removeAttribute('aria-current');
    }
    var meta = viewMeta(key);
    viewDesc.textContent = meta ? (meta.description || meta.title) : '';
    backBtn.hidden = history.length === 0;
    clearSelection();
    applyTransform(key);
    applyFilter();
  }

  function clearSelection() {
    var selected = document.querySelectorAll('.node.selected');
    for (var i = 0; i < selected.length; i++) selected[i].classList.remove('selected');
    details.hidden = true;
    details.textContent = '';
  }

  function row(list, label, value) {
    if (!value) return;
    var dt = document.createElement('dt');
    dt.textContent = label;
    var dd = document.createElement('dd');
    dd.textContent = value;
    list.appendChild(dt);
    list.appendChild(dd);
  }

  function select(node) {
    var id = node.getAttribute('data-id');
    var element = (data.elements || {})[id];
    if (!element) return;
    clearSelection();
    node.classList.add('selected');

    var kind = document.createElement('div');
    kind.className = 'kind';
    kind.textContent = element.type;
    var title = document.createElement('h2');
    title.textContent = element.name;
    details.appendChild(kind);
    details.appendChild(title);
    if (element.description) {
      var desc = document.createElement('p');
      desc.textContent = element.description;
      details.appendChild(desc);
    }
    var list = document.createElement('dl');
    row(list, 'Technology', element.technology);
    row(list, 'Owner', element.owner);
    row(list, 'Status', element.status);
    row(list, 'Tags', element.tags ? element.tags.join(', ') : '');
    if (list.childNodes.length) details.appendChild(list);
    if (element.url) {
      var link = document.createElement('a');
      link.href = element.url;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = 'Open link';
      details.appendChild(link);
    }
    if (element.drillTo && element.drillTo !== current) {
      var drill = document.createElement('button');
      drill.type = 'button';
      drill.textContent = 'Zoom in';
      drill.addEventListener('click', function () { show(element.drillTo, true); });
      details.appendChild(drill);
    }
    details.hidden = false;
  }

  function applyFilter() {
    var query = (search.value || '').trim().toLowerCase();
    var stage = stageFor(current);
    if (!stage) return;
    var nodes = stage.querySelectorAll('.node');
    for (var i = 0; i < nodes.length; i++) {
      var element = (data.elements || {})[nodes[i].getAttribute('data-id')] || {};
      var haystack = (element.name + ' ' + (element.description || '') + ' ' + (element.technology || '') + ' ' + ((element.tags || []).join(' '))).toLowerCase();
      var hit = query !== '' && haystack.indexOf(query) !== -1;
      nodes[i].classList.toggle('dim', query !== '' && !hit);
      nodes[i].classList.toggle('hit', hit);
    }
  }

  function bindStage(stage) {
    var key = stage.getAttribute('data-view');
    var svg = stage.querySelector('svg');
    var dragging = false;
    var origin = null;

    svg.addEventListener('pointerdown', function (event) {
      if (event.target.closest && event.target.closest('.node')) return;
      dragging = true;
      origin = { x: event.clientX, y: event.clientY, state: { x: pan[key].x, y: pan[key].y } };
      svg.classList.add('grabbing');
      if (svg.setPointerCapture) svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener('pointermove', function (event) {
      if (!dragging || !origin) return;
      pan[key].x = origin.state.x + (event.clientX - origin.x);
      pan[key].y = origin.state.y + (event.clientY - origin.y);
      applyTransform(key);
    });
    function endDrag() { dragging = false; svg.classList.remove('grabbing'); }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('pointerleave', endDrag);

    svg.addEventListener('wheel', function (event) {
      event.preventDefault();
      var state = pan[key];
      var factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      var next = Math.min(4, Math.max(0.2, state.k * factor));
      var rect = svg.getBoundingClientRect();
      var px = event.clientX - rect.left;
      var py = event.clientY - rect.top;
      state.x = px - (px - state.x) * (next / state.k);
      state.y = py - (py - state.y) * (next / state.k);
      state.k = next;
      applyTransform(key);
    }, { passive: false });

    stage.addEventListener('click', function (event) {
      var node = event.target.closest ? event.target.closest('.node') : null;
      if (node) select(node);
      else clearSelection();
    });
    stage.addEventListener('dblclick', function (event) {
      var node = event.target.closest ? event.target.closest('.node') : null;
      if (node && node.getAttribute('data-drill')) show(node.getAttribute('data-drill'), true);
    });
    stage.addEventListener('keydown', function (event) {
      var node = event.target.closest ? event.target.closest('.node') : null;
      if (!node) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(node); }
    });
  }

  for (var s = 0; s < stages.length; s++) {
    pan[stages[s].getAttribute('data-view')] = { x: 0, y: 0, k: 1 };
    bindStage(stages[s]);
  }
  for (var t = 0; t < tabs.length; t++) {
    (function (tab) {
      tab.addEventListener('click', function () { history = []; show(tab.getAttribute('data-view'), false); });
    })(tabs[t]);
  }

  backBtn.addEventListener('click', function () {
    var previous = history.pop();
    if (previous) show(previous, false);
    backBtn.hidden = history.length === 0;
  });
  document.getElementById('fit').addEventListener('click', function () {
    pan[current] = { x: 0, y: 0, k: 1 };
    applyTransform(current);
  });
  search.addEventListener('input', applyFilter);
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (search.value) { search.value = ''; applyFilter(); }
    else clearSelection();
  });

  if (stages.length) show(stages[0].getAttribute('data-view'), false);
})();
`.trim()
