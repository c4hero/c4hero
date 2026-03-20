import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type OnSelectionChangeParams,
  type Connection,
  BackgroundVariant,
  reconnectEdge,
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import { useWorkspaceStore, getActiveView, buildElementMap, buildRelationshipMap, allViewsOf } from '@/store/workspace'
import { useSettingsStore } from '@/store/settings'
import { THEMES } from '@/lib/themes'
import { nodeTypes } from './nodes'
import type { EdgeTypes } from '@xyflow/react'
import RelationshipEdge from './edges/RelationshipEdge'
import type { ModelElement, ElementStyle, RelationshipStyle, View, Workspace } from '@/types/model'
import ContextMenu from './ContextMenu'

const edgeTypes: EdgeTypes = {
  relationship: RelationshipEdge,
}

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

  // 2. Layer type-specific tag style
  const typeStyle = styleIndex.get(typeTag)
  if (typeStyle) matched = { ...matched, ...typeStyle }

  // 3. Layer custom tags in order — last tag wins per property
  for (const tag of element.tags) {
    if (tag === typeTag || tag === 'Element') continue
    const style = styleIndex.get(tag)
    if (style) matched = { ...matched, ...style }
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

/** Get child count for drill-down hint */
function getChildCount(element: ModelElement): number | undefined {
  if (element.type === 'softwareSystem') return element.containers.length
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
function buildDrillableSet(workspace: Workspace): Set<string> {
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
function buildNodes(
  workspace: Workspace,
  view: View,
  onDrillIn: (elementId: string) => void,
  activeTagFilter: string | null,
  activeStatusFilter: string | null,
  viewCountMap: Map<string, number>,
  drillableIds: Set<string>,
  themeStyles: ElementStyle[],
): Node[] {
  const elementMap = buildElementMap(workspace)
  // Theme styles form the base layer; workspace styles override them per tag
  const styleIndex = buildStyleIndex([...themeStyles, ...workspace.views.configuration.styles.elements])

  const nodes: Node[] = []

  for (const viewEl of view.elements) {
    const element = elementMap.get(viewEl.id)
    if (!element) continue

    const style = getElementStyle(element, styleIndex)
    const matchesTag = !activeTagFilter || element.tags.includes(activeTagFilter)
    const matchesStatus = !activeStatusFilter || element.status === activeStatusFilter
    const matchesFilter = matchesTag && matchesStatus
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
        dimmed: !matchesFilter,
        viewCount: viewCountMap.get(element.id) ?? 1,
      },
      style: matchesFilter ? undefined : { opacity: 0.4 },
    })
  }

  return nodes
}

/** Build group background nodes using post-layout element positions. */
function buildGroupNodes(
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
      draggable: false,
    })
  }
  return groupNodes
}

/** Build the implicit scope boundary node for container/component views using post-layout positions. */
function buildBoundaryNode(
  workspace: Workspace,
  view: View,
  laidOutNodes: Node[],
): Node | null {
  const BOUNDARY_PADDING = 32

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
          position: { x: minX - BOUNDARY_PADDING, y: minY - BOUNDARY_PADDING },
          style: { width: (maxX - minX) + BOUNDARY_PADDING * 2, height: (maxY - minY) + BOUNDARY_PADDING * 2 },
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
          position: { x: minX - BOUNDARY_PADDING, y: minY - BOUNDARY_PADDING },
          style: { width: (maxX - minX) + BOUNDARY_PADDING * 2, height: (maxY - minY) + BOUNDARY_PADDING * 2 },
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

/** Build edges using final node positions for optimal handle routing. */
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

function buildEdges(
  workspace: Workspace,
  view: View,
  nodes: Node[],
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
  // Key: "nodeId:side" → list of { edgeIndex, role: 'source' | 'target' }
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

  // Assign slots: single edge → b, two → a+c, three → a+b+c
  const sourceSlots = new Map<number, string>() // edgeIndex → slot
  const targetSlots = new Map<number, string>()

  for (const [key, entries] of sideGroups) {
    const side = key.split(':')[1]

    // Sort by the perpendicular coordinate of the opposite node to minimize crossings
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

  // Build final edges with slot-assigned handles
  const edges: Edge[] = []
  for (let i = 0; i < edgeInfos.length; i++) {
    const e = edgeInfos[i]
    const srcSlot = sourceSlots.get(i) ?? 'b'
    const tgtSlot = targetSlots.get(i) ?? 'b'

    edges.push({
      id: e.rel.id,
      source: e.sourceId,
      target: e.targetId,
      sourceHandle: `${e.sourceSide}-${srcSlot}-source`,
      targetHandle: `${e.targetSide}-${tgtSlot}-target`,
      type: 'relationship',
      data: { relationship: e.rel, relationshipStyle: e.relStyle },
    })
  }

  return edges
}

/** Auto-layout unpinned nodes using dagre. Pinned nodes keep their positions. */
function applyAutoLayout(
  nodes: Node[],
  edges: Edge[],
  view: View,
  direction: string = 'TB',
): Node[] {
  const pinnedIds = new Set(
    view.elements.filter(e => e.pinned).map(e => e.id),
  )
  const hasUnpinned = nodes.some(n => !pinnedIds.has(n.id))
  if (!hasUnpinned) return nodes

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, ranksep: 300, nodesep: 250 })

  for (const node of nodes) {
    g.setNode(node.id, { width: 200, height: 100 })
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

export default function Canvas() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const selectElements = useWorkspaceStore((s) => s.selectElements)
  const multiSelectMode = useWorkspaceStore((s) => s.multiSelectMode)
  const selectRelationship = useWorkspaceStore((s) => s.selectRelationship)
  const selectGroup = useWorkspaceStore((s) => s.selectGroup)
  const clearSelection = useWorkspaceStore((s) => s.clearSelection)
  const updateNodePosition = useWorkspaceStore((s) => s.updateNodePosition)
  const addRelationship = useWorkspaceStore((s) => s.addRelationship)
  const reconnectRelationship = useWorkspaceStore((s) => s.reconnectRelationship)
  const activeTagFilter = useWorkspaceStore((s) => s.activeTagFilter)
  const activeStatusFilter = useWorkspaceStore((s) => s.activeStatusFilter)
  const layoutVersion = useWorkspaceStore((s) => s.layoutVersion)
  const minimapMode = useSettingsStore((s) => s.minimapMode)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const colorTheme = useSettingsStore((s) => s.colorTheme)
  const themeStyles = THEMES[colorTheme]

  // Stable callback refs — avoid new function references every render which would
  // invalidate expensive useMemos that depend on them.
  const stableDrillInto = useCallback((elementId: string) => {
    useWorkspaceStore.getState().drillInto(elementId)
  }, [])

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(null)

  // Space-to-pan
  const [spaceHeld, setSpaceHeld] = useState(false)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement).matches('input, textarea, select, [contenteditable]')) {
        setSpaceHeld(true)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const view = workspace && activeViewKey ? getActiveView(workspace, activeViewKey) : undefined

  // Compute a stable fingerprint of the view structure (keys + element counts) so that
  // the viewCountMap only recomputes when views are actually added/removed or their elements change,
  // not on every workspace clone (e.g. element rename, tag change).
  const viewStructureKey = useWorkspaceStore((s) => {
    if (!s.workspace) return ''
    const all = allViewsOf(s.workspace)
    // Build a fingerprint: "viewKey:elCount:el1,el2,..." for each view
    return all.map(view => `${view.key}:${view.elements.map(e => e.id).join(',')}`).join('|')
  })
  const viewCountMap = useMemo(() => {
    if (!viewStructureKey) return new Map<string, number>()
    const ws = useWorkspaceStore.getState().workspace
    if (!ws) return new Map<string, number>()
    const map = new Map<string, number>()
    for (const v of allViewsOf(ws)) {
      for (const ve of v.elements) {
        map.set(ve.id, (map.get(ve.id) ?? 0) + 1)
      }
    }
    return map
  }, [viewStructureKey])

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!workspace || !view) return { initialNodes: [], initialEdges: [] }
    const direction = view.autoLayout?.direction ?? 'TB'

    // 1. Build nodes with raw positions from view
    const drillableIds = buildDrillableSet(workspace)
    const rawNodes = buildNodes(workspace, view, stableDrillInto, activeTagFilter, activeStatusFilter, viewCountMap, drillableIds, themeStyles)

    // 2. Build temporary edges (just source/target, no handles yet) for dagre
    const relationshipMap = buildRelationshipMap(workspace)
    const viewElementIds = new Set(view.elements.map(e => e.id))
    const tempEdges: Edge[] = []
    for (const vr of view.relationships) {
      const rel = relationshipMap.get(vr.id)
      if (!rel) continue
      if (!viewElementIds.has(rel.sourceId) || !viewElementIds.has(rel.destinationId)) continue
      tempEdges.push({ id: rel.id, source: rel.sourceId, target: rel.destinationId })
    }

    // 3. Auto-layout: position unpinned nodes, keep pinned ones
    const laidOut = applyAutoLayout(rawNodes, tempEdges, view, direction)

    // 4. Build group background nodes and scope boundary using post-layout positions
    const groupNodes = buildGroupNodes(workspace, workspace.model.groups, laidOut)
    const boundaryNode = buildBoundaryNode(workspace, view, laidOut)
    const overlayNodes = [...(boundaryNode ? [boundaryNode] : []), ...groupNodes]
    const allNodes = [...overlayNodes, ...laidOut]

    // 5. Build final edges using post-layout positions for handle routing
    const edges = buildEdges(workspace, view, allNodes)

    return { initialNodes: allNodes, initialEdges: edges }
  }, [workspace, view, stableDrillInto, activeTagFilter, activeStatusFilter, viewCountMap, themeStyles])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const reactFlowInstance = useReactFlow()

  // Fit view — poll until all content nodes are measured, then call fitView.
  // Overlay nodes (boundary, groups) are excluded from the fit bounds since
  // they're larger than the content and would shift the center into empty space.
  const fitPending = useRef(false)
  // Store the RF instance from onInit — setViewport/fitView only work reliably
  // after onInit fires (panZoom is initialized). useReactFlow() returns a proxy
  // that may not have panZoom attached yet when called programmatically.
  const rfInitInstance = useRef<typeof reactFlowInstance | null>(null)
  // Keep stable refs so fitContentNodes (useCallback) always sees current values
  const workspaceRef = useRef(workspace)
  const viewRef = useRef(view)
  useEffect(() => { workspaceRef.current = workspace }, [workspace])
  useEffect(() => { viewRef.current = view }, [view])

  const fitContentNodes = useCallback(() => {
    if (!fitPending.current) return
    const rf = rfInitInstance.current ?? reactFlowInstance

    // Check: canvas DOM must be full-size
    const el = document.querySelector('.react-flow') as HTMLElement | null
    if (!el) { requestAnimationFrame(fitContentNodes); return }
    const { width, height } = el.getBoundingClientRect()
    if (width < 200 || height < 200) { requestAnimationFrame(fitContentNodes); return }

    // Check: all content nodes must be measured
    const contentNodes = rf.getNodes().filter(
      n => n.id !== '__scope_boundary__' && !n.id.startsWith('group-')
    )
    if (contentNodes.length === 0 || !contentNodes.every(n => n.measured?.width && n.measured?.height)) {
      requestAnimationFrame(fitContentNodes)
      return
    }

    // All conditions met — update group/boundary sizes with real measured dimensions, then fit
    fitPending.current = false

    // Rebuild group + boundary nodes now that we have real measured sizes
    const ws = workspaceRef.current
    const v = viewRef.current
    const measuredLaidOut = rf.getNodes()
    const updatedGroups = ws ? buildGroupNodes(ws, ws.model.groups, measuredLaidOut) : []
    const updatedBoundary = ws && v ? buildBoundaryNode(ws, v, measuredLaidOut) : null
    setNodes((prev) => {
      const contentOnly = prev.filter(n => !n.id.startsWith('group-') && n.id !== '__scope_boundary__')
      const overlays: typeof prev = []
      if (updatedBoundary) overlays.push(updatedBoundary as typeof prev[0])
      overlays.push(...updatedGroups as typeof prev)
      return [...contentOnly, ...overlays]
    })

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of contentNodes) {
      const w = n.measured!.width!
      const h = n.measured!.height!
      minX = Math.min(minX, n.position.x)
      minY = Math.min(minY, n.position.y)
      maxX = Math.max(maxX, n.position.x + w)
      maxY = Math.max(maxY, n.position.y + h)
    }
    if (!isFinite(minX)) return
    const PADDING = 0.15
    const boundsW = maxX - minX
    const boundsH = maxY - minY
    const zoom = Math.max(0.1, Math.min(
      (width * (1 - PADDING * 2)) / boundsW,
      (height * (1 - PADDING * 2)) / boundsH,
      2
    ))
    rf.setViewport(
      { x: width / 2 - (minX + boundsW / 2) * zoom, y: height / 2 - (minY + boundsH / 2) * zoom, zoom },
      { duration: 300 }
    )
  }, [reactFlowInstance])

  // Sync nodes/edges when workspace changes.
  // Only trigger a viewport refit on structural changes: view switch, element count change,
  // or explicit relayout (layoutVersion bump). Drag-stop position saves must NOT cause refit.
  const lastFitSignal = useRef<string>('')
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
    const signal = `${activeViewKey}:${view?.elements.length ?? 0}:${layoutVersion}`
    if (signal !== lastFitSignal.current) {
      lastFitSignal.current = signal
      fitPending.current = true
      requestAnimationFrame(fitContentNodes)
    }
  }, [initialNodes, initialEdges, setNodes, setEdges, fitContentNodes, activeViewKey, view, layoutVersion])

  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    onNodesChange(changes)
    if (fitPending.current) {
      requestAnimationFrame(fitContentNodes)
    }
  }, [onNodesChange, fitContentNodes])

  // Center view on newly created element
  const focusElementId = useWorkspaceStore((s) => s.focusElementId)
  const clearFocusElement = useWorkspaceStore((s) => s.clearFocusElement)
  useEffect(() => {
    if (!focusElementId) return
    clearFocusElement()
    // Wait a frame for React Flow to render the new node
    requestAnimationFrame(() => {
      const node = reactFlowInstance.getNode(focusElementId)
      if (node) {
        reactFlowInstance.setCenter(
          node.position.x + (node.measured?.width ?? 200) / 2,
          node.position.y + (node.measured?.height ?? 100) / 2,
          { duration: 300, zoom: reactFlowInstance.getZoom() },
        )
      }
    })
  }, [focusElementId, clearFocusElement, reactFlowInstance])

  // Suppress inspector opening during drag (works on touch too).
  // onSelectionChange fires at touch-start before any movement, so we schedule
  // the selectElements call and cancel it if onNodeDrag fires first.
  const isDragging = useRef(false)
  const inspectorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onNodeDragStart = useCallback(() => { isDragging.current = false }, [])
  const onNodeDrag = useCallback(() => {
    isDragging.current = true
    if (inspectorTimer.current) {
      clearTimeout(inspectorTimer.current)
      inspectorTimer.current = null
    }
  }, [])

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      // In multi-select mode, onNodeClick handles selection manually — ignore RF's selection events
      if (multiSelectModeRef.current) return

      const groupNodes = selectedNodes.filter(n => n.id.startsWith('group-'))
      const elementNodes = selectedNodes.filter(n => !n.id.startsWith('group-'))

      if (groupNodes.length > 0) {
        selectGroup(groupNodes[0].id.slice(6)) // strip 'group-' prefix
      } else if (elementNodes.length > 0) {
        const ids = elementNodes.map((n) => n.id)
        // If multiple nodes selected (shift+click or rubber-band), apply immediately — no delay
        if (ids.length > 1) {
          if (inspectorTimer.current) { clearTimeout(inspectorTimer.current); inspectorTimer.current = null }
          selectElements(ids)
          return
        }
        // Single node: defer opening the inspector — cancel if a drag starts within 120ms
        if (inspectorTimer.current) clearTimeout(inspectorTimer.current)
        inspectorTimer.current = setTimeout(() => {
          inspectorTimer.current = null
          if (!isDragging.current) selectElements(ids)
        }, 120)
      } else if (selectedEdges.length > 0) {
        const edgeData = selectedEdges[0].data as { relationship?: { id: string } } | undefined
        if (edgeData?.relationship) selectRelationship(edgeData.relationship.id)
      }
      // Do NOT clear selection here — clicking inspector inputs causes React Flow
      // to report empty selection. Clearing is handled by onPaneClick instead.
    },
    [selectElements, selectRelationship, selectGroup],
  )

  // Show minimap only while panning/zooming
  const [minimapVisible, setMinimapVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(null)

  const onMoveStart = useCallback(() => {
    setMinimapVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [])

  const onMoveEnd = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setMinimapVisible(false), 1500)
  }, [])

  const multiSelectModeRef = useRef(multiSelectMode)
  useEffect(() => { multiSelectModeRef.current = multiSelectMode }, [multiSelectMode])

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Let shift+click go through onSelectionChange (RF handles multi-select natively)
      if (event.shiftKey) return
      if (!multiSelectModeRef.current) return
      if (node.id.startsWith('group-') || node.id === '__scope_boundary__') return
      event.stopPropagation()
      // Toggle this node in both RF state and store
      setNodes((prev) =>
        prev.map((n) =>
          n.id === node.id ? { ...n, selected: !n.selected } : n
        )
      )
      const current = useWorkspaceStore.getState().selectedElementIds
      const isSelected = current.includes(node.id)
      const next = isSelected ? current.filter((id) => id !== node.id) : [...current, node.id]
      useWorkspaceStore.setState({ selectedElementIds: next, selectedRelationshipId: null, selectedGroupId: null })
    },
    [setNodes],
  )

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const ws = useWorkspaceStore.getState().workspace
      if (ws && buildDrillableSet(ws).has(node.id)) {
        useWorkspaceStore.getState().drillInto(node.id)
      }
    },
    [],
  )

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      updateNodePosition(node.id, node.position.x, node.position.y)
      // Rebuild group nodes to fit dragged children
      const ws = workspaceRef.current
      if (ws) {
        setNodes(prev => {
          const nonGroup = prev.filter(n => n.type !== 'group' && n.type !== 'boundary')
          const updatedGroups = buildGroupNodes(ws, ws.model.groups, nonGroup)
          return [...nonGroup, ...updatedGroups]
        })
      }
      // Reset drag flag slightly after stop so any trailing onSelectionChange is still suppressed
      setTimeout(() => { isDragging.current = false }, 50)
    },
    [updateNodePosition, setNodes],
  )

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id })
    },
    [],
  )

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault()
      setContextMenu({ x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY })
    },
    [],
  )

  // Track recent connections to prevent duplicates from multiple handle matches
  const recentConnect = useRef<string | null>(null)
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target && connection.source !== connection.target) {
        const key = `${connection.source}->${connection.target}`
        if (recentConnect.current === key) return
        recentConnect.current = key
        setTimeout(() => { recentConnect.current = null }, 100)
        addRelationship(connection.source, connection.target)
      }
    },
    [addRelationship],
  )

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (newConnection.source && newConnection.target) {
        reconnectRelationship(oldEdge.id, newConnection.source, newConnection.target)
        setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds))
      }
    },
    [reconnectRelationship, setEdges],
  )

  // Empty state — no content nodes in this view
  const hasContentNodes = nodes.some(n => n.type !== 'group' && n.type !== 'boundary')

  return (
    <div className="h-full w-full">
      {!hasContentNodes && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', userSelect: 'none',
          }}
        >
          {/* Icon */}
          <svg width="48" height="40" viewBox="0 0 48 40" fill="none" style={{ opacity: 0.18, marginBottom: 16 }}>
            <rect x="1" y="1" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2"/>
            <rect x="27" y="1" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2"/>
            <rect x="1" y="25" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2"/>
            <rect x="27" y="25" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2"/>
            <line x1="21" y1="8" x2="27" y2="8" stroke="currentColor" strokeWidth="2"/>
            <line x1="21" y1="32" x2="27" y2="32" stroke="currentColor" strokeWidth="2"/>
            <line x1="24" y1="15" x2="24" y2="25" stroke="currentColor" strokeWidth="2"/>
          </svg>
          <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text-primary)', opacity: 0.55, marginBottom: 10 }}>
            Start building your diagram
          </span>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)', opacity: 0.7, display: 'flex', alignItems: 'center', gap: 6 }}>
            Press
            <kbd style={{ padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, lineHeight: '18px' }}>A</kbd>
            to add an element
            <span style={{ opacity: 0.5 }}>·</span>
            <kbd style={{ padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 12, fontFamily: 'monospace', fontWeight: 700, lineHeight: '18px' }}>?</kbd>
            for shortcuts
          </span>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={(instance) => {
          rfInitInstance.current = instance
          if (fitPending.current) requestAnimationFrame(fitContentNodes)
        }}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onMoveStart={onMoveStart}
        onMoveEnd={onMoveEnd}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={() => {
          if (inspectorTimer.current) { clearTimeout(inspectorTimer.current); inspectorTimer.current = null }
          setContextMenu(null)
          clearSelection()
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={2}
        snapToGrid={snapToGrid}
        snapGrid={[20, 20]}
        connectionRadius={40}
        panOnDrag={spaceHeld ? [0, 1, 2] : [0]}
        defaultEdgeOptions={{
          type: 'relationship',
          reconnectable: true,
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#1e3044"
        />
        {minimapMode !== 'never' && (
          <MiniMap
            nodeStrokeWidth={3}
            zoomable
            pannable
            style={{
              backgroundColor: 'var(--color-surface-1)',
              opacity: minimapMode === 'always' || minimapVisible ? 1 : 0,
              transition: 'opacity 300ms ease',
              pointerEvents: minimapMode === 'always' || minimapVisible ? 'auto' : 'none',
            }}
          />
        )}
        {/* Custom arrow marker */}
        <svg>
          <defs>
            <marker
              id="c4-arrow"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth={8}
              markerHeight={8}
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-edge)" />
            </marker>
          </defs>
        </svg>
      </ReactFlow>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
