import type { Node, Edge } from '@xyflow/react'
import { isHighlighted, isHighlightedRel, highlightActive, type HighlightFilters } from '@/lib/highlight'
import { buildElementMap, buildRelationshipMap } from '@/store/workspace'
import type { ModelElement, ElementStyle, RelationshipStyle, View, Workspace } from '@/types/model'

/** Build a tag → style index from the styles array (O(S) once, then O(1) lookups) */
function buildStyleIndex(styles: ElementStyle[]): Map<string, ElementStyle> {
  const map = new Map<string, ElementStyle>()
  for (const style of styles) {
    map.set(style.tag, style)
  }
  return map
}

/** Get the best matching style for an element based on its tags.
 *  Cascade order follows Structurizr: Element → type tag → custom tags (in order). */
function getElementStyle(
  element: ModelElement,
  styleIndex: Map<string, ElementStyle>,
): ElementStyle | undefined {
  const typeTag =
    element.type === 'person' ? 'Person'
    : element.type === 'softwareSystem' ? 'Software System'
    : element.type === 'container' ? 'Container'
    : 'Component'

  // 1. Start with the "Element" base tag (applies to all elements)
  let matched: ElementStyle | undefined
  const baseStyle = styleIndex.get('Element')
  if (baseStyle) matched = { ...baseStyle }

  // 2. Apply type tag style (Person, Software System, Container, Component)
  const typeStyle = styleIndex.get(typeTag)
  if (typeStyle) matched = { ...matched, ...typeStyle }

  // 3. Apply custom tags in order (later tags override earlier ones)
  for (const tag of element.tags) {
    if (tag === 'Element' || tag === typeTag) continue
    const tagStyle = styleIndex.get(tag)
    if (tagStyle) matched = { ...matched, ...tagStyle }
  }

  return matched
}

/** Get the best matching relationship style based on tags */
function getRelationshipStyle(
  tags: string[],
  styles: RelationshipStyle[],
): RelationshipStyle | undefined {
  let matched: RelationshipStyle | undefined
  for (const style of styles) {
    if (tags.includes(style.tag)) {
      matched = { ...matched, ...style }
    }
  }
  return matched
}

/** Get child count for drill-down hint. External systems are opaque and excluded. */
function getChildCount(element: ModelElement): number | undefined {
  if (element.type === 'softwareSystem') {
    if (element.location === 'External') return undefined
    return element.containers.length
  }
  if (element.type === 'container') return element.components.length
  return undefined
}

/** Pick the best source/target handle sides based on relative node positions.
 *  Uses center slot (b) by default. Handle ID format: {side}-{slot}-{type} */
function computeHandlePair(
  srcPos: { x: number; y: number },
  dstPos: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
  const dx = dstPos.x - srcPos.x
  const dy = dstPos.y - srcPos.y

  // Use the dominant axis to pick sides, default to center slot (b)
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) {
      return { sourceHandle: 'right-b-source', targetHandle: 'left-b-target' }
    } else {
      return { sourceHandle: 'left-b-source', targetHandle: 'right-b-target' }
    }
  } else {
    if (dy > 0) {
      return { sourceHandle: 'bottom-b-source', targetHandle: 'top-b-target' }
    } else {
      return { sourceHandle: 'top-b-source', targetHandle: 'bottom-b-target' }
    }
  }
}

/** Pre-compute the set of element IDs that can be drilled into (have a child view).
 *  O(V) once instead of O(N * (tree + V)) per element in buildNodes. */
export function buildDrillableSet(workspace: Workspace): Set<string> {
  const drillable = new Set<string>()
  for (const v of workspace.views.containerViews) {
    if (v.softwareSystemId) drillable.add(v.softwareSystemId)
  }
  for (const v of workspace.views.systemContextViews) {
    if (v.softwareSystemId) drillable.add(v.softwareSystemId)
  }
  for (const v of workspace.views.componentViews) {
    if (v.containerId) drillable.add(v.containerId)
  }
  return drillable
}

/** Build React Flow nodes from workspace view (no edges yet — those need final positions). */
export function buildNodes(
  workspace: Workspace,
  view: View,
  onDrillIn: (elementId: string) => void,
  filters: HighlightFilters,
  viewCountMap: Map<string, number>,
  drillableIds: Set<string>,
  themeStyles: ElementStyle[],
): Node[] {
  const elementMap = buildElementMap(workspace)
  // Theme styles form the base layer; workspace styles override them per tag
  const styleIndex = buildStyleIndex([...themeStyles, ...workspace.views.configuration.styles.elements])

  const active = highlightActive(filters)
  const nodes: Node[] = []

  for (const viewEl of view.elements) {
    const element = elementMap.get(viewEl.id)
    if (!element) continue

    const style = getElementStyle(element, styleIndex)
    const highlighted = active && isHighlighted(element, filters)
    const pos = { x: viewEl.x ?? 0, y: viewEl.y ?? 0 }

    nodes.push({
      id: element.id,
      type: element.type,
      position: pos,
      data: {
        element,
        style,
        childCount: getChildCount(element),
        canDrill: drillableIds.has(element.id),
        onDrillIn,
        highlighted,
        viewCount: viewCountMap.get(element.id) ?? 1,
      },
      // Highlighter focus mode: matched nodes get the highlighted ring; the rest
      // fade to ghost context. When no facets are active, every node renders
      // normally (no class either way).
      className: active ? (highlighted ? 'c4-node-highlighted' : 'c4-node-faded') : undefined,
    })
  }

  return nodes
}

/** Build group background nodes using post-layout element positions. */
export function buildGroupNodes(
  workspace: Workspace,
  groups: typeof workspace.model.groups,
  laidOutNodes: Node[],
): Node[] {
  const PADDING = 24
  const PADDING_TOP = 52 // extra room for the group label

  // Build position+size map from the already-laid-out element nodes
  const nodeMap = new Map<string, { x: number; y: number; w: number; h: number }>()
  for (const n of laidOutNodes) {
    if (!n.id.startsWith('group-') && n.id !== '__scope_boundary__') {
      nodeMap.set(n.id, {
        x: n.position.x,
        y: n.position.y,
        w: n.measured?.width ?? 200,
        h: n.measured?.height ?? 100,
      })
    }
  }

  const groupNodes: Node[] = []
  for (const group of groups) {
    const memberNodes = group.elementIds
      .map((id) => nodeMap.get(id))
      .filter((p): p is { x: number; y: number; w: number; h: number } => p !== undefined)

    if (memberNodes.length < 2) continue

    const minX = Math.min(...memberNodes.map((p) => p.x))
    const minY = Math.min(...memberNodes.map((p) => p.y))
    const maxX = Math.max(...memberNodes.map((p) => p.x + p.w))
    const maxY = Math.max(...memberNodes.map((p) => p.y + p.h))

    groupNodes.push({
      id: `group-${group.id}`,
      type: 'group',
      position: { x: minX - PADDING, y: minY - PADDING_TOP },
      style: { width: (maxX - minX) + PADDING * 2, height: (maxY - minY) + PADDING_TOP + PADDING, backgroundColor: 'transparent' },
      data: { label: group.name, elementCount: group.elementIds.length },
      zIndex: -1,
      selectable: true,
      // Draggable: Canvas's onNodeDragStart/onNodeDrag/onNodeDragStop detect
      // group drags (id starts with `group-`) and translate every member by
      // the same delta. The group's own position is then re-derived from the
      // updated members on the next overlay rebuild.
      draggable: true,
    })
  }
  return groupNodes
}

/** Build the implicit scope boundary node for container/component views using post-layout positions. */
export function buildBoundaryNode(
  workspace: Workspace,
  view: View,
  laidOutNodes: Node[],
): Node | null {
  const BOUNDARY_PADDING = 32
  // Header has 2 lines (name + type label) + internal padding; needs more
  // headroom than the side/bottom padding so the subtitle isn't covered by the
  // topmost member node.
  const BOUNDARY_PADDING_TOP = 64

  // Build position+size map from laid-out element nodes only
  const nodeMap = new Map<string, { x: number; y: number; w: number; h: number }>()
  for (const n of laidOutNodes) {
    if (!n.id.startsWith('group-') && n.id !== '__scope_boundary__') {
      nodeMap.set(n.id, {
        x: n.position.x,
        y: n.position.y,
        w: n.measured?.width ?? 200,
        h: n.measured?.height ?? 100,
      })
    }
  }

  if (view.type === 'container' && view.softwareSystemId) {
    const scopeSystem = workspace.model.softwareSystems.find(s => s.id === view.softwareSystemId)
    if (scopeSystem) {
      const containerIds = new Set(scopeSystem.containers.map(c => c.id))
      const internalPositions = Array.from(nodeMap.entries())
        .filter(([id]) => containerIds.has(id))
        .map(([, pos]) => pos)

      if (internalPositions.length > 0) {
        const minX = Math.min(...internalPositions.map(p => p.x))
        const minY = Math.min(...internalPositions.map(p => p.y))
        const maxX = Math.max(...internalPositions.map(p => p.x + p.w))
        const maxY = Math.max(...internalPositions.map(p => p.y + p.h))
        return {
          id: '__scope_boundary__',
          type: 'boundary',
          position: { x: minX - BOUNDARY_PADDING, y: minY - BOUNDARY_PADDING_TOP },
          style: {
            width: (maxX - minX) + BOUNDARY_PADDING * 2,
            height: (maxY - minY) + BOUNDARY_PADDING_TOP + BOUNDARY_PADDING,
          },
          data: { name: scopeSystem.name, typeLabel: 'Software System' },
          zIndex: -2,
          selectable: false,
          draggable: false,
          focusable: false,
        }
      }
    }
  }

  if (view.type === 'component' && view.containerId) {
    const scopeContainer = workspace.model.softwareSystems
      .flatMap(s => s.containers)
      .find(c => c.id === view.containerId)
    if (scopeContainer) {
      const componentIds = new Set(scopeContainer.components.map(c => c.id))
      const internalPositions = Array.from(nodeMap.entries())
        .filter(([id]) => componentIds.has(id))
        .map(([, pos]) => pos)

      if (internalPositions.length > 0) {
        const minX = Math.min(...internalPositions.map(p => p.x))
        const minY = Math.min(...internalPositions.map(p => p.y))
        const maxX = Math.max(...internalPositions.map(p => p.x + p.w))
        const maxY = Math.max(...internalPositions.map(p => p.y + p.h))
        return {
          id: '__scope_boundary__',
          type: 'boundary',
          position: { x: minX - BOUNDARY_PADDING, y: minY - BOUNDARY_PADDING_TOP },
          style: {
            width: (maxX - minX) + BOUNDARY_PADDING * 2,
            height: (maxY - minY) + BOUNDARY_PADDING_TOP + BOUNDARY_PADDING,
          },
          data: { name: scopeContainer.name, typeLabel: 'Container' },
          zIndex: -2,
          selectable: false,
          draggable: false,
          focusable: false,
        }
      }
    }
  }

  return null
}

/** Distribute multiple edges on the same side across 3 slots (a–c) */
const SLOTS = ['a', 'b', 'c'] as const

/**
 * Pick N slots from the 3 available, centered on b.
 * N=1→[b], N=2→[a,c], N=3→[a,b,c],
 * N>3→cycle through all 3.
 */
function pickSlots(n: number): string[] {
  if (n <= 0) return []
  const all = SLOTS as unknown as string[]
  if (n >= all.length) {
    // More edges than slots: assign all slots then cycle
    return Array.from({ length: n }, (_, i) => all[i % all.length])
  }
  const spread: Record<number, string[]> = {
    1: ['b'],
    2: ['a', 'c'],
  }
  return spread[n] ?? all
}

/** Build edges using final node positions for optimal handle routing. */
export function buildEdges(
  workspace: Workspace,
  view: View,
  nodes: Node[],
  filters: HighlightFilters,
): Edge[] {
  const relationshipMap = buildRelationshipMap(workspace)
  const relationshipStyles = workspace.views.configuration.styles.relationships

  // Position lookup from laid-out nodes
  const posMap = new Map<string, { x: number; y: number }>()
  for (const n of nodes) posMap.set(n.id, n.position)

  const viewElementIds = new Set(view.elements.map(e => e.id))

  // First pass: compute base side pairs for all edges
  interface EdgeInfo {
    relId: string
    sourceId: string
    targetId: string
    sourceSide: string
    targetSide: string
    relStyle: ReturnType<typeof getRelationshipStyle>
    rel: NonNullable<ReturnType<typeof relationshipMap.get>>
  }

  const edgeInfos: EdgeInfo[] = []
  for (const viewRel of view.relationships) {
    const rel = relationshipMap.get(viewRel.id)
    if (!rel) continue
    if (!viewElementIds.has(rel.sourceId) || !viewElementIds.has(rel.destinationId)) continue

    const relStyle = getRelationshipStyle(rel.tags, relationshipStyles)
    const srcPos = posMap.get(rel.sourceId)
    const dstPos = posMap.get(rel.destinationId)
    const handles = srcPos && dstPos
      ? computeHandlePair(srcPos, dstPos)
      : { sourceHandle: 'bottom-b-source', targetHandle: 'top-b-target' }

    // Extract side name (e.g. "right" from "right-b-source")
    const sourceSide = handles.sourceHandle.split('-')[0]
    const targetSide = handles.targetHandle.split('-')[0]

    edgeInfos.push({ relId: rel.id, sourceId: rel.sourceId, targetId: rel.destinationId, sourceSide, targetSide, relStyle, rel })
  }

  // Second pass: count ALL edges per node+side (regardless of source/target direction),
  // then assign slots so edges sharing a side never overlap.
  const sideGroups = new Map<string, { edgeIndex: number; role: 'source' | 'target' }[]>()
  for (let i = 0; i < edgeInfos.length; i++) {
    const e = edgeInfos[i]
    const srcKey = `${e.sourceId}:${e.sourceSide}`
    const tgtKey = `${e.targetId}:${e.targetSide}`
    if (!sideGroups.has(srcKey)) sideGroups.set(srcKey, [])
    sideGroups.get(srcKey)!.push({ edgeIndex: i, role: 'source' })
    if (!sideGroups.has(tgtKey)) sideGroups.set(tgtKey, [])
    sideGroups.get(tgtKey)!.push({ edgeIndex: i, role: 'target' })
  }

  const sourceSlots = new Map<number, string>()
  const targetSlots = new Map<number, string>()

  for (const [key, entries] of sideGroups) {
    const side = key.split(':')[1]

    const sorted = [...entries].sort((a, b) => {
      const isHorizontalSide = side === 'top' || side === 'bottom'
      const nodeIdA = a.role === 'source' ? edgeInfos[a.edgeIndex].targetId : edgeInfos[a.edgeIndex].sourceId
      const nodeIdB = b.role === 'source' ? edgeInfos[b.edgeIndex].targetId : edgeInfos[b.edgeIndex].sourceId
      const posA = posMap.get(nodeIdA)
      const posB = posMap.get(nodeIdB)
      if (!posA || !posB) return 0
      return isHorizontalSide ? posA.x - posB.x : posA.y - posB.y
    })

    const chosen = pickSlots(sorted.length)
    for (let j = 0; j < sorted.length; j++) {
      const { edgeIndex, role } = sorted[j]
      const slotMap = role === 'source' ? sourceSlots : targetSlots
      slotMap.set(edgeIndex, chosen[j])
    }
  }

  // Build final edges with slot-assigned handles.
  // Highlight rules:
  //   - Tech filter active: edges that match the tech AND get the bright ring.
  //   - Any facet active: edges whose source or target is faded also fade so
  //     focus stays on the highlighted subgraph.
  const active = highlightActive(filters)
  const techActive = filters.techs.length > 0
  const highlightedNodeIds = new Set(nodes.filter((n) => (n.data as { highlighted?: boolean })?.highlighted).map((n) => n.id))
  const edges: Edge[] = []
  for (let i = 0; i < edgeInfos.length; i++) {
    const e = edgeInfos[i]
    const srcSlot = sourceSlots.get(i) ?? 'b'
    const tgtSlot = targetSlots.get(i) ?? 'b'

    const techHighlighted = techActive && isHighlightedRel(e.rel, filters)
    const endpointsHighlighted = highlightedNodeIds.has(e.sourceId) && highlightedNodeIds.has(e.targetId)
    const highlighted = techHighlighted || (active && endpointsHighlighted)
    const faded = active && !highlighted

    let className: string | undefined
    if (highlighted) className = 'c4-edge-highlighted'
    else if (faded) className = 'c4-edge-faded'

    edges.push({
      id: e.rel.id,
      source: e.sourceId,
      target: e.targetId,
      sourceHandle: `${e.sourceSide}-${srcSlot}-source`,
      targetHandle: `${e.targetSide}-${tgtSlot}-target`,
      type: 'relationship',
      data: { relationship: e.rel, relationshipStyle: e.relStyle, highlighted },
      className,
    })
  }

  return edges
}
