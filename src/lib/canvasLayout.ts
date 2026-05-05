import dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'
import type { View, Group } from '@/types/model'

/** Auto-layout nodes that don't yet have a saved position.
 *
 *  Any node with saved x/y is treated as **frozen** — already placed by a prior
 *  layout (or by the user) and left untouched. Only nodes whose positions are
 *  undefined get a fresh dagre placement. This is what makes adding a single
 *  new element feel local: the rest of the graph doesn't shift.
 *
 *  `pinned=true` is a separate concept — it means "survive a full re-layout"
 *  (used by `resetAndRelayout`, which clears x/y on unpinned nodes so they
 *  flow back into a fresh dagre run).
 *
 *  Coordinate-frame stitching: dagre lays out from its own origin, so its
 *  output coordinates have no relation to the saved positions of frozen nodes.
 *  When at least one node is frozen, we pick it as an anchor and translate
 *  dagre's output for unfrozen nodes by `(savedAnchor - dagreAnchor)` so the
 *  new nodes land in the existing cluster's coordinate frame rather than far
 *  off near the dagre origin.
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
  const frozenIds = new Set(
    view.elements.filter(e => e.x !== undefined && e.y !== undefined).map(e => e.id),
  )
  const hasUnfrozen = nodes.some(n => !frozenIds.has(n.id))
  if (!hasUnfrozen) return nodes

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

  // Stitch dagre's output frame onto the existing frozen-node frame, if any.
  // Pick any frozen node as the anchor; the offset between its saved position
  // and its dagre-computed position is the translation to apply to unfrozen
  // nodes that dagre placed *relative to* the anchor (i.e. connected via edges).
  let offsetX = 0
  let offsetY = 0
  const anchorId = nodes.find(n => frozenIds.has(n.id))?.id
  if (anchorId) {
    const dagrePos = g.node(anchorId)
    const savedAnchor = view.elements.find(e => e.id === anchorId)
    if (dagrePos && savedAnchor && savedAnchor.x !== undefined && savedAnchor.y !== undefined) {
      offsetX = savedAnchor.x - (dagrePos.x - 100)
      offsetY = savedAnchor.y - (dagrePos.y - 50)
    }
  }

  // Bbox of frozen nodes' saved positions. New disconnected nodes get parked
  // just below this box rather than wherever dagre dumped them as a separate
  // component (which is typically far off to the side, the symptom users see
  // when adding a freshly-created person/system with no edges yet).
  let bboxMinX = Infinity, bboxMaxX = -Infinity, bboxMaxY = -Infinity
  if (anchorId) {
    for (const e of view.elements) {
      if (e.x === undefined || e.y === undefined) continue
      bboxMinX = Math.min(bboxMinX, e.x)
      bboxMaxX = Math.max(bboxMaxX, e.x + 200)
      bboxMaxY = Math.max(bboxMaxY, e.y + 100)
    }
  }
  const haveBbox = isFinite(bboxMinX)

  // An unfrozen node is "anchored" to existing content when it shares an edge
  // with any frozen node — in that case dagre's relative placement is
  // meaningful and the anchor offset is the right translation. A node with no
  // such edge is disconnected and would land in dagre's own component layout
  // (far away), so we override its position to sit below the frozen bbox.
  const isAnchoredToFrozen = (id: string): boolean => {
    for (const e of edges) {
      if (e.source === id && frozenIds.has(e.target)) return true
      if (e.target === id && frozenIds.has(e.source)) return true
    }
    return false
  }

  let parkIndex = 0
  return nodes.map((node) => {
    if (frozenIds.has(node.id)) return node
    if (haveBbox && !isAnchoredToFrozen(node.id)) {
      // Park disconnected new nodes in a row below the frozen bbox.
      const x = bboxMinX + parkIndex * 250
      const y = bboxMaxY + 120
      parkIndex++
      return { ...node, position: { x, y } }
    }
    const pos = g.node(node.id)
    return {
      ...node,
      position: { x: pos.x - 100 + offsetX, y: pos.y - 50 + offsetY },
    }
  })
}
