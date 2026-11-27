import { wrapText } from './text'
import { zoomElements } from './editing'
import { applyAutoLayout, BOUNDARY_PADDING_TOP } from '@/lib/canvasLayout'
import type { View } from '@/types/model'
import type { ModelElement, Relationship, Workspace } from '@/types/model'

export const HEADER_HEIGHT = { softwareSystem: BOUNDARY_PADDING_TOP, container: BOUNDARY_PADDING_TOP } as const

export interface Box { x: number; y: number; width: number; height: number }
export interface MapNode extends Box {
  headerHeight?: number
  scale: number; id: string; element: ModelElement; parent?: MapNode; children: MapNode[]; root: MapNode
}
export interface MapLayout { nodes: MapNode[]; roots: MapNode[]; byId: Map<string, MapNode>; bounds: Box }

// Containment, names, connectivity, groups and layout direction affect geometry. Inspector metadata
// edits reuse the previous coordinates, even when immutable model objects change.
export function geometryKey(workspace: Workspace): string {
  const visit = (e: ModelElement): unknown => [e.id, e.name,
    e.type === 'softwareSystem' ? e.containers.map(visit) : e.type === 'container' ? e.components.map(visit) : []]
  return JSON.stringify([[...workspace.model.people, ...workspace.model.softwareSystems].map(visit),
    workspace.model.relationships.map(r => [r.sourceId, r.destinationId]), workspace.model.groups,
    [...workspace.views.systemLandscapeViews, ...workspace.views.containerViews, ...workspace.views.componentViews].map(v => [v.type, v.softwareSystemId, v.containerId, v.autoLayout?.direction, v.zoomLayout, v.elements.map(e => [e.id, e.x, e.y])])])
}

/** Auto-layouts of one card's contents, keyed by everything that decides them. */
const arrangements = new Map<string, { id: string; x: number; y: number }[]>()
const ARRANGEMENT_LIMIT = 500

export function contains(parent: MapNode, child: MapNode): boolean {
  for (let n: MapNode | undefined = child; n; n = n.parent) if (n.id === parent.id) return true
  return false
}

export function buildLayout(workspace: Workspace, activeView?: View, snapshot?: Map<string, Box>, useSnapshotPositions = true, intrinsic?: Map<string, { width: number; height: number; headerHeight?: number }>): MapLayout {
  const zoomLayout = activeView?.zoomLayout
  const groups = JSON.stringify(workspace.model.groups)
  const nodes: MapNode[] = [], byId = new Map<string, MapNode>()
  const hidden = new Set(zoomLayout?.hiddenIds)
  const eligible = zoomElements(workspace, activeView)
  const eligibleIds = new Set(eligible.map(e => e.id))
  const childIds = new Set(eligible.flatMap(e => e.type === 'softwareSystem' ? e.containers.map(c => c.id) : e.type === 'container' ? e.components.map(c => c.id) : []))
  function adapt(element: ModelElement, parent?: MapNode): MapNode {
    const n = { id: element.id, element, parent, children: [], scale: 1, x: 0, y: 0, width: 0, height: 0 } as unknown as MapNode
    n.root = parent?.root ?? n
    nodes.push(n); byId.set(n.id, n)
    n.children = (element.type === 'softwareSystem' ? element.containers : element.type === 'container' ? element.components : []).filter(e => eligibleIds.has(e.id) && !hidden.has(e.id)).map(e => adapt(e, n))
    return n
  }
  const roots = eligible.filter(e => !childIds.has(e.id) && !hidden.has(e.id)).map(e => adapt(e))
  function arrange(siblings: MapNode[], parent?: MapNode) {
    if (!siblings.length) return { width: 0, height: 0 }
    const ids = new Set(siblings.map(n => n.id))
    const lift = (id: string) => {
      let n = byId.get(id)
      while (n && !ids.has(n.id)) n = n.parent
      return n
    }
    const edges = workspace.model.relationships.flatMap(r => {
      const a = lift(r.sourceId), b = lift(r.destinationId)
      return a && b && a !== b ? [{ id: r.id, source: a.id, target: b.id }] : []
    })
    const matching = [...workspace.views.systemLandscapeViews, ...workspace.views.containerViews, ...workspace.views.componentViews].filter(v => parent
      ? parent.element.type === 'softwareSystem' ? v.type === 'container' && v.softwareSystemId === parent.id
        : v.type === 'component' && v.containerId === parent.id
      : v.type === 'systemLandscape')
    // Prefer the Diagram view that places the most nodes at this C4 level.
    // Absolute canvas offsets are normalized below; relative ordering survives.
    const authored = (!parent && activeView) || matching.sort((a, b) => b.elements.filter(e => ids.has(e.id) && e.x !== undefined && e.y !== undefined).length - a.elements.filter(e => ids.has(e.id) && e.x !== undefined && e.y !== undefined).length)[0]
    const useAuthoredPositions = !zoomLayout?.direction
    const saved = new Map(useAuthoredPositions ? authored?.elements.filter(e => ids.has(e.id) && e.x !== undefined && e.y !== undefined).map(e => [e.id, { x: e.x!, y: e.y! }]) ?? [] : [])
    if (!parent && useSnapshotPositions && snapshot) for (const n of siblings) {
      const box = snapshot.get(n.id)
      if (box) saved.set(n.id, { x: box.x, y: box.y })
    }
    if (parent && saved.size > 1) spreadApart(siblings.filter(n => saved.has(n.id)), saved)
    const view: View = { type: authored?.type ?? 'systemLandscape', key: '__zoom', elements: siblings.map(n => ({ id: n.id, ...saved.get(n.id) })), relationships: [] }
    const directions = zoomLayout?.direction ? [zoomLayout.direction] : saved.size ? [authored?.autoLayout?.direction ?? 'TB'] : parent ? ['LR', 'TB'] : [authored?.autoLayout?.direction ?? 'TB']
    // Auto-layout is the expensive step, and the whole layout is rebuilt each
    // time a revealed card reports its measured size. Each arrangement depends
    // only on what is passed to it, so keep it: a rebuild then re-arranges just
    // the cards whose own contents changed, not every card in the view.
    const input = JSON.stringify([view.type, !!parent, siblings.map(n => [n.id, n.width, n.height, saved.get(n.id) ?? null]), edges, groups])
    const candidates = directions.map(direction => {
      const key = `${direction}|${input}`
      let arranged = arrangements.get(key)
      if (!arranged) {
        arranged = applyAutoLayout(siblings.map(n => ({ id: n.id, data: {}, position: saved.get(n.id) ?? { x: 0, y: 0 }, style: { width: n.width, height: n.height } })),
          edges, view, workspace.model.groups, direction, new Set(), [], parent ? { ranksep: 80, nodesep: 48 } : undefined).map(n => ({ id: n.id, x: n.position.x, y: n.position.y }))
        if (arrangements.size >= ARRANGEMENT_LIMIT) arrangements.clear()
        arrangements.set(key, arranged)
      }
      const width = Math.max(...arranged.map(n => n.x + byId.get(n.id)!.width)) - Math.min(...arranged.map(n => n.x))
      const height = Math.max(...arranged.map(n => n.y + byId.get(n.id)!.height)) - Math.min(...arranged.map(n => n.y))
      return { arranged, fit: parent ? Math.min((parent.width - 28) / width, Math.max(8, parent.height - (parent.headerHeight ?? 48) - 14) / height) : 1 }
    })
    // Prefer the orientation that makes children largest in the available body;
    // LR wins ties.
    const arranged = candidates.sort((a, b) => b.fit - a.fit)[0].arranged
    const minX = Math.min(...arranged.map(n => n.x)), minY = Math.min(...arranged.map(n => n.y))
    const placed = arranged.map(n => [n.id, n.x - (!parent && activeView ? 0 : minX), n.y - (!parent && activeView ? 0 : minY)] as const)
    for (const [id, x, y] of placed) { const target = byId.get(id)!; target.x = x; target.y = y }
    return { width: Math.max(...siblings.map(n => n.x + n.width)), height: Math.max(...siblings.map(n => n.y + n.height)) }
  }

  function measure(n: MapNode) {
    n.headerHeight = intrinsic?.get(n.id)?.headerHeight ?? (n.parent ? 64 : 48)
    n.children.forEach(measure)
    n.width = (!n.parent && snapshot?.get(n.id)?.width) || 280
    // A conservative initial box for descendants. Rendering and typography are
    // owned entirely by the native card components, not a second text painter.
    const titleLines = Math.min(2, wrapText(n.element.name, 220, text => text.length * 7.7).length)
    const descriptionLines = Math.min(3, wrapText(n.element.description ?? '', 248, text => text.length * 6.05).length)
    n.height = (!n.parent && snapshot?.get(n.id)?.height) || Math.max(100, 36 + Math.max(26, titleLines * 18.2) + (descriptionLines ? 6 + descriptionLines * 15.4 : 0) + 24)
    if (n.parent && intrinsic?.has(n.id)) { n.width = intrinsic.get(n.id)!.width; n.height = intrinsic.get(n.id)!.height }
    if (!n.children.length) return
    const inner = arrange(n.children, n)
    // Each level has its own Diagram coordinate scale. Fit its already-laid-out
    // graph inside a normal card once, rather than inflating every ancestor.
    const padding = 14, header = n.headerHeight!
    const factor = Math.min((n.width - padding * 2) / inner.width, Math.max(8, n.height - header - padding) / inner.height)
    const shrink = (child: MapNode) => {
      child.x *= factor; child.y *= factor; child.width *= factor; child.height *= factor; child.scale *= factor
      child.children.forEach(shrink)
    }
    for (const child of n.children) {
      shrink(child)
      child.x += (n.width - inner.width * factor) / 2
      child.y += header + (n.height - header - padding - inner.height * factor) / 2
    }
  }
  roots.forEach(measure)
  const size = arrange(roots)
  function translate(n: MapNode) { for (const c of n.children) { c.x += n.x; c.y += n.y; translate(c) } }
  roots.forEach(translate)
  for (const n of nodes) {
    // The incoming renderer owns root positions during a mode handoff.
    // Persisted Zoom positions may predate a drag in the normal view.
    const saved = !n.parent && useSnapshotPositions && snapshot?.has(n.id) ? snapshot.get(n.id) : zoomLayout?.elements?.[n.id]
    if (saved?.x === undefined || saved.y === undefined) continue
    let x = (n.parent?.x ?? 0) + saved.x * n.scale
    let y = (n.parent?.y ?? 0) + saved.y * n.scale
    if (n.parent) {
      const p = n.parent, padding = 14 * p.scale, header = (p.headerHeight ?? 48) * p.scale
      const left = p.x + padding, top = p.y + header
      const right = Math.max(left, p.x + p.width - padding - n.width)
      const bottom = Math.max(top, p.y + p.height - padding - n.height)
      if (zoomLayout?.positionSpace === 'parent-body') {
        x = left + Math.max(0, Math.min(1, saved.x)) * (right - left)
        y = top + Math.max(0, Math.min(1, saved.y)) * (bottom - top)
      } else if (x < left - .01 || x > right + .01 || y < top - .01 || y > bottom + .01) {
        // Old positions used the child's previous scale. When that no longer
        // fits, retain the freshly fitted placement instead of restoring it.
        continue
      }
    }
    translateSubtree(n, x - n.x, y - n.y)
  }
  const x = Math.min(0, ...roots.map(n => n.x)) - 60, y = Math.min(0, ...roots.map(n => n.y)) - 60
  return { nodes, roots, byId, bounds: { x, y, width: Math.max(120, size.width + 120, ...roots.map(n => n.x + n.width - x + 60)), height: Math.max(120, size.height + 120, ...roots.map(n => n.y + n.height - y + 60)) } }
}

/** Clear space kept between two authored cards, in Diagram units. */
const SPREAD_GAP = 24

/** A Diagram view can be laid out before its cards are measured, spacing them
 * for the narrowest card; wider cards then touch or overlap. Scale the whole
 * arrangement about its origin, the least that separates every overlapping
 * pair at their real sizes, so the diagram keeps its shape. */
export function spreadApart(cards: { id: string; width: number; height: number }[], positions: Map<string, { x: number; y: number }>) {
  let spread = 1
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i], b = cards[j], pa = positions.get(a.id)!, pb = positions.get(b.id)!
    const dx = Math.abs(pb.x + b.width / 2 - pa.x - a.width / 2), dy = Math.abs(pb.y + b.height / 2 - pa.y - a.height / 2)
    const needX = (a.width + b.width) / 2 + SPREAD_GAP, needY = (a.height + b.height) / 2 + SPREAD_GAP
    if (dx >= needX || dy >= needY) continue
    // Scaling separates a pair along whichever axis gets there first; cards
    // sharing a centre cannot be separated by scaling at all.
    const factor = Math.min(dx ? needX / dx : Infinity, dy ? needY / dy : Infinity)
    if (Number.isFinite(factor)) spread = Math.max(spread, factor)
  }
  if (spread === 1) return
  for (const card of cards) {
    const p = positions.get(card.id)!
    positions.set(card.id, { x: (p.x + card.width / 2) * spread - card.width / 2, y: (p.y + card.height / 2) * spread - card.height / 2 })
  }
}

export function translateSubtree(node: MapNode, dx: number, dy: number) {
  node.x += dx; node.y += dy
  for (const child of node.children) translateSubtree(child, dx, dy)
}

export interface Connection { relationship: Relationship; from: MapNode; to: MapNode; external: boolean }
export interface Bundle { key: string; from: MapNode; to: MapNode; connections: Connection[] }
export function connectionsFor(layout: MapLayout, relationships: Relationship[], view?: View) {
  const connections: Connection[] = [], bundles = new Map<string, Bundle>()
  const authored = view && new Set(view.relationships.map(r => r.id))
  const excluded = new Set(view?.excludedRelationshipIds)
  const seen = new Set<string>()
  for (const relationship of relationships) {
    if (seen.has(relationship.id) || excluded.has(relationship.id)) continue
    seen.add(relationship.id)
    const from = layout.byId.get(relationship.sourceId), to = layout.byId.get(relationship.destinationId)
    if (!from || !to) continue // Deployment instances never enter the static map.
    // Hidden descendants never add overview edges. Root-to-root membership is
    // exactly the authored view; actual child edges appear with their endpoints.
    if (authored && !from.parent && !to.parent && !authored.has(relationship.id)) continue
    const c = { relationship, from, to, external: from.root !== to.root }
    connections.push(c)
    if (!c.external) continue
    // Keep opposite directions and interaction styles separate and inspectable.
    const key = JSON.stringify([from.root.id, to.root.id, relationship.interactionStyle ?? 'Synchronous'])
    if (!bundles.has(key)) bundles.set(key, { key, from: from.root, to: to.root, connections: [] })
    bundles.get(key)!.connections.push(c)
  }
  return { connections, bundles: [...bundles.values()] }
}
