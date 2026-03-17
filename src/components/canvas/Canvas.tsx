import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnSelectionChangeParams,
  type Connection,
  BackgroundVariant,
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import { useWorkspaceStore, getActiveView, buildElementMap, buildRelationshipMap, canDrillInto } from '@/store/workspace'
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
 *  Returns [sourceHandle, targetHandle] IDs matching NodeHandles component. */
function computeHandlePair(
  srcPos: { x: number; y: number },
  dstPos: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
  const dx = dstPos.x - srcPos.x
  const dy = dstPos.y - srcPos.y

  // Use the dominant axis to pick sides
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal dominant
    if (dx > 0) {
      return { sourceHandle: 'right-source', targetHandle: 'left-target' }
    } else {
      return { sourceHandle: 'left-source', targetHandle: 'right-target' }
    }
  } else {
    // Vertical dominant
    if (dy > 0) {
      return { sourceHandle: 'bottom-source', targetHandle: 'top-target' }
    } else {
      return { sourceHandle: 'top-source', targetHandle: 'bottom-target' }
    }
  }
}

/** Build React Flow nodes from workspace view (no edges yet — those need final positions). */
function buildNodes(
  workspace: Workspace,
  view: View,
  onDrillIn: (elementId: string) => void,
  activeTagFilter: string | null,
): Node[] {
  const elementMap = buildElementMap(workspace)
  const elementStyles = workspace.views.configuration.styles.elements

  const nodes: Node[] = []
  for (const viewEl of view.elements) {
    const element = elementMap.get(viewEl.id)
    if (!element) continue

    const style = getElementStyle(element, elementStyles)
    const matchesFilter = !activeTagFilter || element.tags.includes(activeTagFilter)

    nodes.push({
      id: element.id,
      type: element.type,
      position: { x: viewEl.x ?? 0, y: viewEl.y ?? 0 },
      data: {
        element,
        style,
        childCount: getChildCount(element),
        canDrill: canDrillInto(workspace, element.id),
        onDrillIn,
        dimmed: !matchesFilter,
      },
      style: matchesFilter ? undefined : { opacity: 0.2 },
    })
  }

  return nodes
}

/** Build edges using final node positions for optimal handle routing. */
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
  const edges: Edge[] = []

  for (const viewRel of view.relationships) {
    const rel = relationshipMap.get(viewRel.id)
    if (!rel) continue
    if (!viewElementIds.has(rel.sourceId) || !viewElementIds.has(rel.destinationId)) continue

    const relStyle = getRelationshipStyle(rel.tags, relationshipStyles)
    const srcPos = posMap.get(rel.sourceId)
    const dstPos = posMap.get(rel.destinationId)
    const handles = srcPos && dstPos
      ? computeHandlePair(srcPos, dstPos)
      : { sourceHandle: 'bottom-source', targetHandle: 'top-target' }

    edges.push({
      id: rel.id,
      source: rel.sourceId,
      target: rel.destinationId,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle,
      type: 'relationship',
      data: { relationship: rel, relationshipStyle: relStyle },
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
  g.setGraph({ rankdir: direction, ranksep: 100, nodesep: 80 })

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
  const clearSelection = useWorkspaceStore((s) => s.clearSelection)
  const drillInto = useWorkspaceStore((s) => s.drillInto)
  const updateNodePosition = useWorkspaceStore((s) => s.updateNodePosition)
  const addRelationship = useWorkspaceStore((s) => s.addRelationship)
  const activeTagFilter = useWorkspaceStore((s) => s.activeTagFilter)
  const minimapEnabled = useWorkspaceStore((s) => s.minimapEnabled)
  const snapToGrid = useWorkspaceStore((s) => s.snapToGrid)

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

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!workspace || !view) return { initialNodes: [], initialEdges: [] }
    const direction = view.autoLayout?.direction ?? 'TB'

    // 1. Build nodes with raw positions from view
    const rawNodes = buildNodes(workspace, view, drillInto, activeTagFilter)

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

    // 4. Build final edges using post-layout positions for handle routing
    const edges = buildEdges(workspace, view, laidOut)

    return { initialNodes: laidOut, initialEdges: edges }
  }, [workspace, view, drillInto, activeTagFilter])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync when view changes
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      if (selectedNodes.length > 0) {
        selectElements(selectedNodes.map((n) => n.id))
      } else if (selectedEdges.length > 0) {
        const edgeData = selectedEdges[0].data as { relationship?: { id: string } } | undefined
        if (edgeData?.relationship) selectRelationship(edgeData.relationship.id)
      } else {
        clearSelection()
      }
    },
    [selectElements, selectRelationship, clearSelection],
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
      if (workspace && canDrillInto(workspace, node.id)) {
        drillInto(node.id)
      }
    },
    [workspace, drillInto],
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

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target && connection.source !== connection.target) {
        addRelationship(connection.source, connection.target)
      }
    },
    [addRelationship],
  )

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onNodeDoubleClick={onNodeDoubleClick}
        onMoveStart={onMoveStart}
        onMoveEnd={onMoveEnd}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={() => setContextMenu(null)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={2}
        snapToGrid={snapToGrid}
        snapGrid={[20, 20]}
        panOnDrag={spaceHeld ? [0, 1, 2] : [0]}
        defaultEdgeOptions={{
          type: 'relationship',
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#1e3044"
        />
        {minimapEnabled && (
          <MiniMap
            nodeStrokeWidth={3}
            zoomable
            pannable
            style={{
              backgroundColor: 'var(--color-surface-1)',
              opacity: minimapVisible ? 1 : 0,
              transition: 'opacity 300ms ease',
              pointerEvents: minimapVisible ? 'auto' : 'none',
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
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b4f63" />
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
