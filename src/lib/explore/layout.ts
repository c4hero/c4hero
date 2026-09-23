import { applyAutoLayout, BOUNDARY_PADDING_TOP } from '@/lib/canvasLayout'
import type { View } from '@/types/model'
import type { ModelElement, Relationship, Workspace } from '@/types/model'

export const HEADER_HEIGHT = { softwareSystem: BOUNDARY_PADDING_TOP, container: BOUNDARY_PADDING_TOP } as const

export interface Box { x: number; y: number; width: number; height: number }
export interface MapNode extends Box {
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

export function buildLayout(workspace: Workspace): MapLayout {
  const nodes: MapNode[] = [], byId = new Map<string, MapNode>()
  const hidden = new Set(workspace.exploreLayout?.hiddenIds)
  function adapt(element: ModelElement, parent?: MapNode): MapNode {
    const n = { id: element.id, element, parent, children: [], scale: 1, x: 0, y: 0, width: 0, height: 0 } as unknown as MapNode
    n.root = parent?.root ?? n
    nodes.push(n); byId.set(n.id, n)
    n.children = (element.type === 'softwareSystem' ? element.containers : element.type === 'container' ? element.components : []).filter(e => !hidden.has(e.id)).map(e => adapt(e, n))
    return n
  }
  const roots = [...workspace.model.people, ...workspace.model.softwareSystems].filter(e => !hidden.has(e.id)).map(e => adapt(e))
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
    const authored = matching.sort((a, b) => b.elements.filter(e => ids.has(e.id) && e.x !== undefined && e.y !== undefined).length - a.elements.filter(e => ids.has(e.id) && e.x !== undefined && e.y !== undefined).length)[0]
    const useAuthoredPositions = !workspace.exploreLayout?.direction
    const saved = new Map(useAuthoredPositions ? authored?.elements.filter(e => ids.has(e.id) && e.x !== undefined && e.y !== undefined).map(e => [e.id, { x: e.x!, y: e.y! }]) ?? [] : [])
    const view: View = { type: authored?.type ?? 'systemLandscape', key: '__explore', elements: siblings.map(n => ({ id: n.id, ...saved.get(n.id) })), relationships: [] }
    const directions = workspace.exploreLayout?.direction ? [workspace.exploreLayout.direction] : saved.size ? [authored?.autoLayout?.direction ?? 'TB'] : parent ? ['LR', 'TB'] : [authored?.autoLayout?.direction ?? 'TB']
    const candidates = directions.map(direction => {
      const arranged = applyAutoLayout(siblings.map(n => ({ id: n.id, data: {}, position: saved.get(n.id) ?? { x: 0, y: 0 }, style: { width: n.width, height: n.height } })),
        edges, view, workspace.model.groups, direction, new Set(), [], parent ? { ranksep: 80, nodesep: 48 } : undefined)
      const width = Math.max(...arranged.map(n => n.position.x + byId.get(n.id)!.width)) - Math.min(...arranged.map(n => n.position.x))
      const height = Math.max(...arranged.map(n => n.position.y + byId.get(n.id)!.height)) - Math.min(...arranged.map(n => n.position.y))
      return { arranged, fit: parent ? Math.min((parent.width - 28) / width, (parent.height - 54) / height) : 1 }
    })
    // Prefer the orientation that makes children largest in the available body;
    // LR wins ties. This is computed once, never during zoom/reveal.
    const arranged = candidates.sort((a, b) => b.fit - a.fit)[0].arranged
    const minX = Math.min(...arranged.map(n => n.position.x)), minY = Math.min(...arranged.map(n => n.position.y))
    for (const n of arranged) { const target = byId.get(n.id)!; target.x = n.position.x - minX; target.y = n.position.y - minY }
    return { width: Math.max(...siblings.map(n => n.x + n.width)), height: Math.max(...siblings.map(n => n.y + n.height)) }
  }

  function measure(n: MapNode) {
    n.children.forEach(measure)
    n.width = Math.max(200, Math.min(280, n.element.name.length * 7 + 52))
    n.height = 120
    if (!n.children.length) return
    const inner = arrange(n.children, n)
    // Each level has its own Diagram coordinate scale. Fit its already-laid-out
    // graph inside a normal card once, rather than inflating every ancestor.
    const padding = 14, header = 40
    const factor = Math.min((n.width - padding * 2) / inner.width, (n.height - header - padding) / inner.height)
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
    const saved = workspace.exploreLayout?.elements?.[n.id]
    if (saved?.x === undefined || saved.y === undefined) continue
    const dx = (n.parent?.x ?? 0) + saved.x * n.scale - n.x
    const dy = (n.parent?.y ?? 0) + saved.y * n.scale - n.y
    translateSubtree(n, dx, dy)
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
export function connectionsFor(layout: MapLayout, relationships: Relationship[]) {
  const connections: Connection[] = [], bundles = new Map<string, Bundle>()
  for (const relationship of relationships) {
    const from = layout.byId.get(relationship.sourceId), to = layout.byId.get(relationship.destinationId)
    if (!from || !to) continue // Deployment instances never enter the static map.
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
