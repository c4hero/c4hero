import dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'
import type { View, Group } from '@/types/model'

const DEFAULT_NODE_WIDTH = 200
const DEFAULT_NODE_HEIGHT = 100
const GROUP_PADDING = 24
const GROUP_PADDING_TOP = 52
const BOUNDARY_PADDING = 32
const BOUNDARY_PADDING_TOP = 64
const BOUNDARY_SPANNING_GROUP_PADDING = GROUP_PADDING + BOUNDARY_PADDING + 16
const BOUNDARY_SPANNING_GROUP_PADDING_TOP = GROUP_PADDING_TOP + BOUNDARY_PADDING_TOP + 16
const OVERLAY_CLUSTER_GAP = 72
const MAX_CLUSTER_SEPARATION_PASSES = 24

export interface LayoutBoundaryCluster {
  id: string
  elementIds: string[]
}

type LayoutRect = { x: number; y: number; w: number; h: number }
type ClusterKind = 'boundary' | 'group' | 'node'
type OverlayCluster = {
  id: string
  kind: ClusterKind
  memberIds: Set<string>
  paddingX?: number
  paddingTop?: number
}

function numericSize(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
  }
  return undefined
}

function layoutSize(node: Node): { width: number; height: number } {
  return {
    width: numericSize(node.measured?.width) ?? numericSize(node.style?.width) ?? DEFAULT_NODE_WIDTH,
    height: numericSize(node.measured?.height) ?? numericSize(node.style?.height) ?? DEFAULT_NODE_HEIGHT,
  }
}

function makeBoundaryClusters(
  boundaryInternalIds: Set<string>,
  boundaryClusters: LayoutBoundaryCluster[],
  nodeIds: Set<string>,
): LayoutBoundaryCluster[] {
  const source = boundaryClusters.length > 0
    ? boundaryClusters
    : boundaryInternalIds.size > 0
      ? [{ id: 'scope', elementIds: [...boundaryInternalIds] }]
      : []

  return source
    .map((cluster) => ({
      id: cluster.id,
      elementIds: [...new Set(cluster.elementIds.filter((id) => nodeIds.has(id)))],
    }))
    .filter((cluster) => cluster.elementIds.length > 0)
}

function nodeLayoutRect(
  nodeId: string,
  positions: Map<string, { x: number; y: number }>,
  sizeById: Map<string, { width: number; height: number }>,
): LayoutRect | null {
  const position = positions.get(nodeId)
  if (!position) return null
  const size = sizeById.get(nodeId) ?? { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT }
  return { x: position.x, y: position.y, w: size.width, h: size.height }
}

function unionRects(rects: LayoutRect[]): LayoutRect | null {
  if (rects.length === 0) return null
  const minX = Math.min(...rects.map((rect) => rect.x))
  const minY = Math.min(...rects.map((rect) => rect.y))
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.w))
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.h))
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function expandRect(rect: LayoutRect, paddingX: number, paddingTop: number, paddingBottom = paddingX): LayoutRect {
  return {
    x: rect.x - paddingX,
    y: rect.y - paddingTop,
    w: rect.w + paddingX * 2,
    h: rect.h + paddingTop + paddingBottom,
  }
}

function isSubset(child: Set<string>, parent: Set<string>): boolean {
  for (const id of child) {
    if (!parent.has(id)) return false
  }
  return true
}

function boundarySetsTouchedByGroup(
  groupElementIds: Iterable<string>,
  boundaryClusters: LayoutBoundaryCluster[],
  presentIds?: Set<string>,
): Set<string>[] {
  const groupIds = new Set([...groupElementIds].filter((id) => !presentIds || presentIds.has(id)))
  if (groupIds.size === 0) return []

  return boundaryClusters
    .map((cluster) => new Set(cluster.elementIds.filter((id) => !presentIds || presentIds.has(id))))
    .filter((boundaryIds) => boundaryIds.size > 0 && setsOverlap(groupIds, boundaryIds))
}

export function groupSpansBoundaryClusters(
  groupElementIds: Iterable<string>,
  boundaryClusters: LayoutBoundaryCluster[],
  presentIds?: Set<string>,
): boolean {
  return boundarySetsTouchedByGroup(groupElementIds, boundaryClusters, presentIds).length > 1
}

export function expandedGroupElementIds(
  groupElementIds: Iterable<string>,
  boundaryClusters: LayoutBoundaryCluster[],
  presentIds?: Set<string>,
): string[] {
  const expanded = new Set([...groupElementIds].filter((id) => !presentIds || presentIds.has(id)))
  const touchedBoundaries = boundarySetsTouchedByGroup(expanded, boundaryClusters, presentIds)
  if (touchedBoundaries.length > 1) {
    for (const boundaryIds of touchedBoundaries) {
      for (const id of boundaryIds) expanded.add(id)
    }
  }
  return [...expanded]
}

function setsOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const id of a) {
    if (b.has(id)) return true
  }
  return false
}

function groupsAreNested(child: OverlayCluster, parent: OverlayCluster): boolean {
  return child.kind === 'group'
    && parent.kind === 'group'
    && child.memberIds.size < parent.memberIds.size
    && isSubset(child.memberIds, parent.memberIds)
}

function boundaryContainsGroup(boundary: OverlayCluster, group: OverlayCluster): boolean {
  return boundary.kind === 'boundary'
    && group.kind === 'group'
    && isSubset(group.memberIds, boundary.memberIds)
}

function chooseClusterParent(cluster: OverlayCluster, clusters: OverlayCluster[]): string | null {
  if (cluster.kind !== 'group') return null

  const candidates = clusters.filter((candidate) => (
    candidate.id !== cluster.id
    && (groupsAreNested(cluster, candidate) || boundaryContainsGroup(candidate, cluster))
  ))
  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    if (a.memberIds.size !== b.memberIds.size) return a.memberIds.size - b.memberIds.size
    if (a.kind === b.kind) return a.id.localeCompare(b.id)
    return a.kind === 'group' ? -1 : 1
  })
  return candidates[0].id
}

function rectsOverlap(a: LayoutRect, b: LayoutRect, gap = 0): boolean {
  return a.x < b.x + b.w + gap
    && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap
    && a.y + a.h + gap > b.y
}

function clusterCenter(rect: LayoutRect, axis: 'x' | 'y'): number {
  return axis === 'x' ? rect.x + rect.w / 2 : rect.y + rect.h / 2
}

function collisionShift(a: LayoutRect, b: LayoutRect): { dx: number; dy: number } | null {
  const moveRight = (a.x + a.w + OVERLAY_CLUSTER_GAP) - b.x
  const moveLeft = (a.x - OVERLAY_CLUSTER_GAP) - (b.x + b.w)
  const dx = clusterCenter(b, 'x') >= clusterCenter(a, 'x') ? moveRight : moveLeft

  const moveDown = (a.y + a.h + OVERLAY_CLUSTER_GAP) - b.y
  const moveUp = (a.y - OVERLAY_CLUSTER_GAP) - (b.y + b.h)
  const dy = clusterCenter(b, 'y') >= clusterCenter(a, 'y') ? moveDown : moveUp

  if (dx === 0 && dy === 0) return null
  if (Math.abs(dx) <= Math.abs(dy)) {
    return { dx, dy: 0 }
  }

  return { dx: 0, dy }
}

function separateOverlayClusters(
  nodes: Node[],
  sizeById: Map<string, { width: number; height: number }>,
  frozenIds: Set<string>,
  groups: Group[],
  boundaryClusters: LayoutBoundaryCluster[],
): Node[] {
  const contentIds = new Set(nodes.map((node) => node.id))
  const groupClusters: OverlayCluster[] = groups
    .map((group) => {
      const spansBoundaries = groupSpansBoundaryClusters(group.elementIds, boundaryClusters, contentIds)
      return {
        id: `group:${group.id}`,
        kind: 'group' as const,
        memberIds: new Set(expandedGroupElementIds(group.elementIds, boundaryClusters, contentIds)),
        paddingX: spansBoundaries ? BOUNDARY_SPANNING_GROUP_PADDING : GROUP_PADDING,
        paddingTop: spansBoundaries ? BOUNDARY_SPANNING_GROUP_PADDING_TOP : GROUP_PADDING_TOP,
      }
    })
    .filter((cluster) => cluster.memberIds.size >= 2)
  const boundaryOverlayClusters: OverlayCluster[] = boundaryClusters
    .map((cluster) => ({
      id: `boundary:${cluster.id}`,
      kind: 'boundary' as const,
      memberIds: new Set(cluster.elementIds.filter((id) => contentIds.has(id))),
    }))
    .filter((cluster) => cluster.memberIds.size > 0)

  const overlayClusters = [...boundaryOverlayClusters, ...groupClusters]
  if (overlayClusters.length === 0) return nodes

  const parentById = new Map<string, string | null>()
  for (const cluster of overlayClusters) {
    parentById.set(cluster.id, chooseClusterParent(cluster, overlayClusters))
  }

  const topLevelOverlayClusters = overlayClusters.filter((cluster) => parentById.get(cluster.id) === null)
  const coveredTopLevelIds = new Set<string>()
  for (const cluster of topLevelOverlayClusters) {
    for (const id of cluster.memberIds) coveredTopLevelIds.add(id)
  }

  const looseNodeClusters: OverlayCluster[] = nodes
    .filter((node) => !coveredTopLevelIds.has(node.id))
    .map((node) => ({
      id: `node:${node.id}`,
      kind: 'node' as const,
      memberIds: new Set([node.id]),
    }))

  const clusters = [...overlayClusters, ...looseNodeClusters]
  if (clusters.length < 2) return nodes

  const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]))
  for (const cluster of looseNodeClusters) parentById.set(cluster.id, null)

  const childrenByParent = new Map<string | null, OverlayCluster[]>()
  for (const cluster of clusters) {
    const parentId = parentById.get(cluster.id) ?? null
    const siblings = childrenByParent.get(parentId) ?? []
    siblings.push(cluster)
    childrenByParent.set(parentId, siblings)
  }

  const positions = new Map(nodes.map((node) => [node.id, { ...node.position }]))
  let changed = false

  const groupRect = (cluster: OverlayCluster, visiting = new Set<string>()): LayoutRect | null => {
    if (visiting.has(cluster.id)) return null
    visiting.add(cluster.id)
    const memberRects = [...cluster.memberIds]
      .map((id) => nodeLayoutRect(id, positions, sizeById))
      .filter((rect): rect is LayoutRect => rect !== null)
    if (memberRects.length < 2) {
      visiting.delete(cluster.id)
      return null
    }

    const nestedGroupRects = groupClusters
      .filter((candidate) => groupsAreNested(candidate, cluster))
      .map((candidate) => groupRect(candidate, visiting))
      .filter((rect): rect is LayoutRect => rect !== null)
    const raw = unionRects([...memberRects, ...nestedGroupRects])
    visiting.delete(cluster.id)
    return raw ? expandRect(raw, cluster.paddingX ?? GROUP_PADDING, cluster.paddingTop ?? GROUP_PADDING_TOP) : null
  }

  const clusterRect = (cluster: OverlayCluster): LayoutRect | null => {
    if (cluster.kind === 'node') {
      return nodeLayoutRect([...cluster.memberIds][0], positions, sizeById)
    }

    if (cluster.kind === 'group') return groupRect(cluster)

    const memberRects = [...cluster.memberIds]
      .map((id) => nodeLayoutRect(id, positions, sizeById))
      .filter((rect): rect is LayoutRect => rect !== null)
    const nestedGroupRects = groupClusters
      .filter((group) => isSubset(group.memberIds, cluster.memberIds))
      .map((group) => groupRect(group))
      .filter((rect): rect is LayoutRect => rect !== null)
    const raw = unionRects([...memberRects, ...nestedGroupRects])
    return raw ? expandRect(raw, BOUNDARY_PADDING, BOUNDARY_PADDING_TOP) : null
  }

  const clusterIsMovable = (cluster: OverlayCluster) => {
    for (const id of cluster.memberIds) {
      if (frozenIds.has(id)) return false
    }
    return true
  }

  const moveCluster = (cluster: OverlayCluster, dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return
    for (const id of cluster.memberIds) {
      const position = positions.get(id)
      if (!position) continue
      positions.set(id, { x: position.x + dx, y: position.y + dy })
    }
    changed = true
  }

  const orderedSiblings = (siblings: OverlayCluster[]) => {
    return [...siblings].sort((a, b) => {
      const aRect = clusterRect(a)
      const bRect = clusterRect(b)
      if (!aRect || !bRect) return a.id.localeCompare(b.id)
      const dy = clusterCenter(aRect, 'y') - clusterCenter(bRect, 'y')
      if (Math.abs(dy) > 0.5) return dy
      const dx = clusterCenter(aRect, 'x') - clusterCenter(bRect, 'x')
      return Math.abs(dx) > 0.5 ? dx : a.id.localeCompare(b.id)
    })
  }

  const separateSiblings = (siblings: OverlayCluster[]) => {
    if (siblings.length < 2) return
    for (let pass = 0; pass < MAX_CLUSTER_SEPARATION_PASSES; pass++) {
      let movedThisPass = false
      const ordered = orderedSiblings(siblings)
      for (let i = 0; i < ordered.length; i++) {
        for (let j = i + 1; j < ordered.length; j++) {
          const a = ordered[i]
          const b = ordered[j]
          if (setsOverlap(a.memberIds, b.memberIds)) continue

          const aRect = clusterRect(a)
          const bRect = clusterRect(b)
          if (!aRect || !bRect || !rectsOverlap(aRect, bRect, OVERLAY_CLUSTER_GAP)) continue

          const shift = collisionShift(aRect, bRect)
          if (!shift) continue

          if (clusterIsMovable(b)) {
            moveCluster(b, shift.dx, shift.dy)
            movedThisPass = true
          } else if (clusterIsMovable(a)) {
            moveCluster(a, -shift.dx, -shift.dy)
            movedThisPass = true
          }
        }
      }
      if (!movedThisPass) break
    }
  }

  const resolveChildren = (parentId: string | null) => {
    for (const child of childrenByParent.get(parentId) ?? []) {
      if (clusterById.has(child.id)) resolveChildren(child.id)
    }
    separateSiblings(childrenByParent.get(parentId) ?? [])
  }

  resolveChildren(null)

  if (!changed) return nodes
  return nodes.map((node) => {
    const position = positions.get(node.id)
    return position ? { ...node, position } : node
  })
}

export function spaceOverlayClusters(
  nodes: Node[],
  groups: Group[],
  boundaryClusters: LayoutBoundaryCluster[] = [],
  frozenIds: Set<string> = new Set(),
): Node[] {
  const sizeById = new Map(nodes.map((node) => [node.id, layoutSize(node)]))
  return separateOverlayClusters(nodes, sizeById, frozenIds, groups, boundaryClusters)
}

/** Auto-layout nodes that don't yet have a saved position.
 *
 *  Any node with saved x/y is treated as **frozen** — already placed by a prior
 *  layout (or by the user) and left untouched. Only nodes whose positions are
 *  undefined get a fresh dagre placement. This is what makes adding a single
 *  new element feel local: the rest of the graph doesn't shift.
 *
 *  `locked=true` is a separate concept — it means "survive a full re-layout".
 *  It needs nothing here: `resetAndRelayout` and `setLayoutDirection` clear x/y
 *  on every *unlocked* element, so a locked one still holds a saved position
 *  when this runs and is frozen by the rule above, while everything else flows
 *  back into a fresh dagre run.
 *
 *  (`pinned` is a third thing again, and not a layout concept at all — it marks
 *  a position as hand-authored so the sidecar knows to persist it.)
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
  boundaryClusters: LayoutBoundaryCluster[] = [],
): Node[] {
  const frozenIds = new Set(
    view.elements.filter(e => e.x !== undefined && e.y !== undefined).map(e => e.id),
  )
  const hasUnfrozen = nodes.some(n => !frozenIds.has(n.id))
  if (!hasUnfrozen) return nodes

  const g = new dagre.graphlib.Graph({ compound: true })
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, ranksep: 300, nodesep: 250 })

  const sizeById = new Map<string, { width: number; height: number }>()
  const nodeIds = new Set(nodes.map(n => n.id))
  const activeBoundaryClusters = makeBoundaryClusters(boundaryInternalIds, boundaryClusters, nodeIds)

  // Create compound parents for every boundary that will be drawn after layout.
  // Dagre only positions the element nodes, so a second pass below still spaces
  // the rendered boundary rectangles; these parents keep members from being
  // interleaved before that final collision pass.
  const boundaryParentByChild = new Map<string, string>()
  for (const cluster of activeBoundaryClusters) {
    const parentId = `__boundary_${cluster.id}`
    g.setNode(parentId, {})
    for (const id of cluster.elementIds) {
      if (!boundaryParentByChild.has(id)) boundaryParentByChild.set(id, parentId)
    }
  }

  // Assign dagre parent clusters for groups that have ≥2 members present in this
  // view. Matches the gate in buildGroupNodes so the layout and the drawn group
  // rectangles agree on which groups are "active".
  const parentByChild = new Map<string, string>()
  for (const group of groups) {
    const present = group.elementIds.filter(id => nodeIds.has(id))
    if (present.length < 2) continue
    const groupParentId = `__group_${group.id}`
    g.setNode(groupParentId, {})
    for (const id of present) parentByChild.set(id, groupParentId)
    // Nest fully-internal groups inside the matching boundary parent.
    const boundaryParentId = boundaryParentByChild.get(present[0])
    if (boundaryParentId && present.every(id => boundaryParentByChild.get(id) === boundaryParentId)) {
      g.setParent(groupParentId, boundaryParentId)
    }
  }

  for (const node of nodes) {
    const size = layoutSize(node)
    sizeById.set(node.id, size)
    g.setNode(node.id, size)
    const groupParentId = parentByChild.get(node.id)
    if (groupParentId) {
      g.setParent(node.id, groupParentId)
    } else {
      const boundaryParentId = boundaryParentByChild.get(node.id)
      if (boundaryParentId) {
        // Ungrouped internal node → child of its boundary
        g.setParent(node.id, boundaryParentId)
      }
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
    const anchorSize = sizeById.get(anchorId) ?? { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT }
    if (dagrePos && savedAnchor && savedAnchor.x !== undefined && savedAnchor.y !== undefined) {
      offsetX = savedAnchor.x - (dagrePos.x - anchorSize.width / 2)
      offsetY = savedAnchor.y - (dagrePos.y - anchorSize.height / 2)
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
      const size = sizeById.get(e.id) ?? { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT }
      bboxMinX = Math.min(bboxMinX, e.x)
      bboxMaxX = Math.max(bboxMaxX, e.x + size.width)
      bboxMaxY = Math.max(bboxMaxY, e.y + size.height)
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
  const laidOutNodes = nodes.map((node) => {
    if (frozenIds.has(node.id)) return node
    if (haveBbox && !isAnchoredToFrozen(node.id)) {
      // Park disconnected new nodes in a row below the frozen bbox.
      const x = bboxMinX + parkIndex * 250
      const y = bboxMaxY + 120
      parkIndex++
      return { ...node, position: { x, y } }
    }
    const pos = g.node(node.id)
    const size = sizeById.get(node.id) ?? { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT }
    return {
      ...node,
      position: { x: pos.x - size.width / 2 + offsetX, y: pos.y - size.height / 2 + offsetY },
    }
  })

  return separateOverlayClusters(laidOutNodes, sizeById, frozenIds, groups, activeBoundaryClusters)
}
