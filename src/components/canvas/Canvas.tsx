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
import { useWorkspaceStore, getActiveView, buildElementMap, buildRelationshipMap, canDrillInto } from '@/store/workspace'
import { useSettingsStore } from '@/store/settings'
import { nodeTypes } from './nodes'
import type { EdgeTypes } from '@xyflow/react'
import RelationshipEdge from './edges/RelationshipEdge'
import type { ModelElement, ElementStyle, RelationshipStyle, View, Workspace } from '@/types/model'
import ContextMenu from './ContextMenu'

const edgeTypes: EdgeTypes = {
  relationship: RelationshipEdge,
}

/** Get the best matching style for an element based on its tags */
function getElementStyle(
  element: ModelElement,
  styles: ElementStyle[],
): ElementStyle | undefined {
  // Match the most specific tag (last matching wins, like CSS)
  let matched: ElementStyle | undefined
  for (const style of styles) {
    if (element.tags.includes(style.tag)) {
      matched = { ...matched, ...style }
    }
  }
  // Also check type-based tags
  const typeTag =
    element.type === 'person' ? 'Person'
    : element.type === 'softwareSystem' ? 'Software System'
    : element.type === 'container' ? 'Container'
    : 'Component'
  for (const style of styles) {
    if (style.tag === typeTag) {
      matched = { ...matched, ...style }
    }
  }
  // Apply more-specific tag matches on top
  for (const style of styles) {
    if (element.tags.includes(style.tag) && style.tag !== typeTag) {
      matched = { ...matched, ...style }
    }
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

/** Build React Flow nodes from workspace view (no edges yet — those need final positions). */
function buildNodes(
  workspace: Workspace,
  view: View,
  onDrillIn: (elementId: string) => void,
  activeTagFilter: string | null,
  activeStatusFilter: string | null,
  viewCountMap: Map<string, number>,
): Node[] {
  const elementMap = buildElementMap(workspace)
  const elementStyles = workspace.views.configuration.styles.elements

  const nodes: Node[] = []

  for (const viewEl of view.elements) {
    const element = elementMap.get(viewEl.id)
    if (!element) continue

    const style = getElementStyle(element, elementStyles)
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
        canDrill: canDrillInto(workspace, element.id),
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
  const NODE_W = 200
  const NODE_H = 100
  const PADDING = 24

  // Build position map from the already-laid-out element nodes
  const posMap = new Map<string, { x: number; y: number }>()
  for (const n of laidOutNodes) {
    if (!n.id.startsWith('group-') && n.id !== '__scope_boundary__') {
      posMap.set(n.id, n.position)
    }
  }

  const groupNodes: Node[] = []
  for (const group of groups) {
    const memberPositions = group.elementIds
      .map((id) => posMap.get(id))
      .filter((p): p is { x: number; y: number } => p !== undefined)

    if (memberPositions.length < 2) continue

    const minX = Math.min(...memberPositions.map((p) => p.x))
    const minY = Math.min(...memberPositions.map((p) => p.y))
    const maxX = Math.max(...memberPositions.map((p) => p.x)) + NODE_W
    const maxY = Math.max(...memberPositions.map((p) => p.y)) + NODE_H

    groupNodes.push({
      id: `group-${group.id}`,
      type: 'group',
      position: { x: minX - PADDING, y: minY - PADDING },
      style: { width: (maxX - minX) + PADDING * 2, height: (maxY - minY) + PADDING * 2 },
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
  const NODE_W = 200
  const NODE_H = 100
  const BOUNDARY_PADDING = 32

  // Build position map from laid-out element nodes only
  const posMap = new Map<string, { x: number; y: number }>()
  for (const n of laidOutNodes) {
    if (!n.id.startsWith('group-') && n.id !== '__scope_boundary__') {
      posMap.set(n.id, n.position)
    }
  }

  if (view.type === 'container' && view.softwareSystemId) {
    const scopeSystem = workspace.model.softwareSystems.find(s => s.id === view.softwareSystemId)
    if (scopeSystem) {
      const containerIds = new Set(scopeSystem.containers.map(c => c.id))
      const internalPositions = Array.from(posMap.entries())
        .filter(([id]) => containerIds.has(id))
        .map(([, pos]) => pos)

      if (internalPositions.length > 0) {
        const minX = Math.min(...internalPositions.map(p => p.x))
        const minY = Math.min(...internalPositions.map(p => p.y))
        const maxX = Math.max(...internalPositions.map(p => p.x)) + NODE_W
        const maxY = Math.max(...internalPositions.map(p => p.y)) + NODE_H
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
      const internalPositions = Array.from(posMap.entries())
        .filter(([id]) => componentIds.has(id))
        .map(([, pos]) => pos)

      if (internalPositions.length > 0) {
        const minX = Math.min(...internalPositions.map(p => p.x))
        const minY = Math.min(...internalPositions.map(p => p.y))
        const maxX = Math.max(...internalPositions.map(p => p.x)) + NODE_W
        const maxY = Math.max(...internalPositions.map(p => p.y)) + NODE_H
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
  const selectRelationship = useWorkspaceStore((s) => s.selectRelationship)
  const selectGroup = useWorkspaceStore((s) => s.selectGroup)
  const clearSelection = useWorkspaceStore((s) => s.clearSelection)
  const updateNodePosition = useWorkspaceStore((s) => s.updateNodePosition)
  const addRelationship = useWorkspaceStore((s) => s.addRelationship)
  const reconnectRelationship = useWorkspaceStore((s) => s.reconnectRelationship)
  const activeTagFilter = useWorkspaceStore((s) => s.activeTagFilter)
  const activeStatusFilter = useWorkspaceStore((s) => s.activeStatusFilter)
  const minimapMode = useSettingsStore((s) => s.minimapMode)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)

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
    const v = s.workspace.views
    const all = [...v.systemLandscapeViews, ...v.systemContextViews, ...v.containerViews, ...v.componentViews]
    // Build a fingerprint: "viewKey:elCount:el1,el2,..." for each view
    return all.map(view => `${view.key}:${view.elements.map(e => e.id).join(',')}`).join('|')
  })
  const viewCountMap = useMemo(() => {
    if (!viewStructureKey) return new Map<string, number>()
    const views = useWorkspaceStore.getState().workspace?.views
    if (!views) return new Map<string, number>()
    const allViews = [
      ...views.systemLandscapeViews,
      ...views.systemContextViews,
      ...views.containerViews,
      ...views.componentViews,
    ]
    const map = new Map<string, number>()
    for (const v of allViews) {
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
    const rawNodes = buildNodes(workspace, view, stableDrillInto, activeTagFilter, activeStatusFilter, viewCountMap)

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
  }, [workspace, view, stableDrillInto, activeTagFilter, activeStatusFilter, viewCountMap])

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

    // All conditions met — compute bounds and set viewport
    fitPending.current = false
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

  // Sync nodes/edges when they change, then kick off fit poll
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
    fitPending.current = true
    requestAnimationFrame(fitContentNodes)
  }, [initialNodes, initialEdges, setNodes, setEdges, fitContentNodes])

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

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      const groupNodes = selectedNodes.filter(n => n.id.startsWith('group-'))
      const elementNodes = selectedNodes.filter(n => !n.id.startsWith('group-'))

      if (groupNodes.length > 0) {
        selectGroup(groupNodes[0].id.slice(6)) // strip 'group-' prefix
      } else if (elementNodes.length > 0) {
        selectElements(elementNodes.map((n) => n.id))
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

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const ws = useWorkspaceStore.getState().workspace
      if (ws && canDrillInto(ws, node.id)) {
        useWorkspaceStore.getState().drillInto(node.id)
      }
    },
    [],
  )

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      updateNodePosition(node.id, node.position.x, node.position.y)
    },
    [updateNodePosition],
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

  return (
    <div className="h-full w-full">
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
        onNodeDoubleClick={onNodeDoubleClick}
        onMoveStart={onMoveStart}
        onMoveEnd={onMoveEnd}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={() => { setContextMenu(null); clearSelection() }}
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
