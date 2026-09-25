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
  return JSON.stringify([workspace.exploreLayout, [...workspace.model.people, ...workspace.model.softwareSystems].map(visit),
    workspace.model.relationships.map(r => [r.sourceId, r.destinationId]), workspace.model.groups,
    [...workspace.views.systemLandscapeViews, ...workspace.views.containerViews, ...workspace.views.componentViews].map(v => [v.type, v.softwareSystemId, v.containerId, v.autoLayout?.direction, v.elements.map(e => [e.id, e.x, e.y])])])
}

export function contains(parent: MapNode, child: MapNode): boolean {
  for (let n: MapNode | undefined = child; n; n = n.parent) if (n.id === parent.id) return true
  return false
}

export function buildLayout(workspace: Workspace, activeView?: View, snapshot?: Map<string, Box>, useSnapshotPositions = true, intrinsic?: Map<string, { width: number; height: number; headerHeight?: number }>): MapLayout {
  const zoomLayout = activeView ? activeView.exploreLayout : workspace.exploreLayout
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
    const view: View = { type: authored?.type ?? 'systemLandscape', key: '__explore', elements: siblings.map(n => ({ id: n.id, ...saved.get(n.id) })), relationships: [] }
    const directions = zoomLayout?.direction ? [zoomLayout.direction] : saved.size ? [authored?.autoLayout?.direction ?? 'TB'] : parent ? ['LR', 'TB'] : [authored?.autoLayout?.direction ?? 'TB']
    const candidates = directions.map(direction => {
      const arranged = applyAutoLayout(siblings.map(n => ({ id: n.id, data: {}, position: saved.get(n.id) ?? { x: 0, y: 0 }, style: { width: n.width, height: n.height } })),
        edges, view, workspace.model.groups, direction, new Set(), [], parent ? { ranksep: 80, nodesep: 48 } : undefined)
      const width = Math.max(...arranged.map(n => n.position.x + byId.get(n.id)!.width)) - Math.min(...arranged.map(n => n.position.x))
      const height = Math.max(...arranged.map(n => n.position.y + byId.get(n.id)!.height)) - Math.min(...arranged.map(n => n.position.y))
      return { arranged, fit: parent ? Math.min((parent.width - 28) / width, Math.max(8, parent.height - (parent.headerHeight ?? 48) - 14) / height) : 1 }
    })
    // Prefer the orientation that makes children largest in the available body;
    // LR wins ties. This is computed once, never during zoom/reveal.
    const arranged = candidates.sort((a, b) => b.fit - a.fit)[0].arranged
    const minX = Math.min(...arranged.map(n => n.position.x)), minY = Math.min(...arranged.map(n => n.position.y))
    for (const n of arranged) { const target = byId.get(n.id)!; target.x = n.position.x - (!parent && activeView ? 0 : minX); target.y = n.position.y - (!parent && activeView ? 0 : minY) }
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

export function translateSubtree(node: MapNode, dx: number, dy: number) {
  node.x += dx; node.y += dy
  for (const child of node.children) translateSubtree(child, dx, dy)
}

export interface Connection { relationship: Relationship; from: MapNode; to: MapNode; external: boolean }
export interface Bundle { key: string; from: MapNode; to: MapNode; connections: Connection[] }
export function connectionsFor(layout: MapLayout, relationships: Relationship[], view?: View) {
  const connections: Connection[] = [], bundles = new Map<string, Bundle>()
  const authored = view && new Set(view.relationships.map(r => r.id))
  const seen = new Set<string>()
  for (const relationship of relationships) {
    if (seen.has(relationship.id)) continue
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
