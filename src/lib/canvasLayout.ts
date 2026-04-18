import dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'
import type { View, Group } from '@/types/model'

/** Auto-layout unpinned nodes using dagre. Pinned nodes keep their positions.
 *  A node is only treated as pinned when it has BOTH pinned=true AND saved x/y.
 *  If pinned=true but positions are missing (e.g. loaded from DSL with no sidecar),
 *  the node is re-laid out by dagre rather than stacking at origin.
 *
 *  Groups are expressed as dagre compound-graph parents so that members cluster
 *  together in the final layout and the group rectangle (drawn afterwards around
 *  member bounds) stays tight without engulfing unrelated nodes.
 *
 *  The scope boundary (for container/component views) is also expressed as a
 *  compound parent so that internal nodes cluster together and external nodes
 *  are positioned outside the boundary area. */
export function applyAutoLayout(
  nodes: Node[],
  edges: Edge[],
  view: View,
  groups: Group[],
  direction: string = 'TB',
  boundaryInternalIds: Set<string> = new Set(),
): Node[] {
  const pinnedIds = new Set(
    view.elements.filter(e => e.pinned && e.x !== undefined && e.y !== undefined).map(e => e.id),
  )
  const hasUnpinned = nodes.some(n => !pinnedIds.has(n.id))
  if (!hasUnpinned) return nodes

  const g = new dagre.graphlib.Graph({ compound: true })
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, ranksep: 300, nodesep: 250 })

  // Create a compound parent for the scope boundary so dagre separates
  // internal nodes (inside the boundary) from external nodes.
  const hasBoundary = boundaryInternalIds.size > 0
  const boundaryParentId = '__dagre_boundary__'
  if (hasBoundary) {
    g.setNode(boundaryParentId, {})
  }

  // Assign dagre parent clusters for groups that have ≥2 members present in this
  // view. Matches the gate in buildGroupNodes so the layout and the drawn group
  // rectangles agree on which groups are "active".
  const nodeIds = new Set(nodes.map(n => n.id))
  const parentByChild = new Map<string, string>()
  for (const group of groups) {
    const present = group.elementIds.filter(id => nodeIds.has(id))
    if (present.length < 2) continue
    const groupParentId = `__group_${group.id}`
    g.setNode(groupParentId, {})
    for (const id of present) parentByChild.set(id, groupParentId)
    // Nest fully-internal groups inside the boundary parent
    if (hasBoundary && present.every(id => boundaryInternalIds.has(id))) {
      g.setParent(groupParentId, boundaryParentId)
    }
  }

  for (const node of nodes) {
    g.setNode(node.id, { width: 200, height: 100 })
    const groupParentId = parentByChild.get(node.id)
    if (groupParentId) {
      g.setParent(node.id, groupParentId)
    } else if (hasBoundary && boundaryInternalIds.has(node.id)) {
      // Ungrouped internal node → child of boundary
      g.setParent(node.id, boundaryParentId)
    }
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map((node) => {
    if (pinnedIds.has(node.id)) return node
    const pos = g.node(node.id)
    return {
      ...node,
      position: { x: pos.x - 100, y: pos.y - 50 },
    }
  })
}
