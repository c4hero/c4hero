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
 *  member bounds) stays tight without engulfing unrelated nodes. */
export function applyAutoLayout(
  nodes: Node[],
  edges: Edge[],
  view: View,
  groups: Group[],
  direction: string = 'TB',
): Node[] {
  const pinnedIds = new Set(
    view.elements.filter(e => e.pinned && e.x !== undefined && e.y !== undefined).map(e => e.id),
  )
  const hasUnpinned = nodes.some(n => !pinnedIds.has(n.id))
  if (!hasUnpinned) return nodes

  const g = new dagre.graphlib.Graph({ compound: true })
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, ranksep: 300, nodesep: 250 })

  // Assign dagre parent clusters for groups that have ≥2 members present in this
  // view. Matches the gate in buildGroupNodes so the layout and the drawn group
  // rectangles agree on which groups are "active".
  const nodeIds = new Set(nodes.map(n => n.id))
  const parentByChild = new Map<string, string>()
  for (const group of groups) {
    const present = group.elementIds.filter(id => nodeIds.has(id))
    if (present.length < 2) continue
    const parentId = `__group_${group.id}`
    g.setNode(parentId, {})
    for (const id of present) parentByChild.set(id, parentId)
  }

  for (const node of nodes) {
    g.setNode(node.id, { width: 200, height: 100 })
    const parentId = parentByChild.get(node.id)
    if (parentId) g.setParent(node.id, parentId)
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
