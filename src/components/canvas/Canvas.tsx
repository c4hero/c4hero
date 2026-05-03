import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { applyAutoLayout } from '@/lib/canvasLayout'
import { fitNodesToViewport, isContentFitNode } from '@/lib/fitViewport'
import { saveViewport, loadViewport } from '@/lib/viewportStorage'
import { isHighlighted, isHighlightedRel, highlightActive, type HighlightFilters } from '@/lib/highlight'
import { useWorkspaceStore, getActiveView, buildElementMap, buildRelationshipMap, allViewsOf } from '@/store/workspace'
import { useSettingsStore } from '@/store/settings'
import {
  THEMES,
  THEME_CANVAS_BACKGROUNDS,
  THEME_SELECTION_COLORS,
  THEME_EDGE_COLORS,
  THEME_LABEL_COLORS,
  THEME_LABEL_MUTED_COLORS,
  isLightCanvasTheme,
} from '@/lib/themes'
import { nodeTypes } from './nodes'
import type { EdgeTypes } from '@xyflow/react'
import RelationshipEdge from './edges/RelationshipEdge'
import type { ModelElement, ElementStyle, RelationshipStyle, View, Workspace } from '@/types/model'

const edgeTypes: EdgeTypes = {
  relationship: RelationshipEdge,
}

const KBD_STYLE: React.CSSProperties = {
  padding: '2px 7px', borderRadius: 6,
  background: 'var(--glass-overlay-sm)', border: '1px solid var(--glass-overlay-md)',
  fontSize: 12, fontFamily: 'monospace', fontWeight: 700, lineHeight: '18px',
}

// Stable ReactFlow prop objects — defined outside the component to avoid re-creating
// them on every render (ReactFlow uses shallow equality to decide when to re-render).
const RF_PRO_OPTIONS = { hideAttribution: true }
const RF_SNAP_GRID: [number, number] = [32, 32]
const RF_DEFAULT_EDGE_OPTIONS = { type: 'relationship', reconnectable: true }
const RF_PAN_ON_DRAG_DEFAULT = [0]
const RF_PAN_ON_DRAG_SPACE = [0, 1, 2]

// Constant style for the zero-size SVG that holds the arrow marker definition.
// Hoisted so React never re-creates it on render.
const MARKER_SVG_STYLE: React.CSSProperties = { position: 'absolute', width: 0, height: 0, overflow: 'hidden' }

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


export default function Canvas() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const selectElements = useWorkspaceStore((s) => s.selectElements)
  const multiSelectMode = useWorkspaceStore((s) => s.multiSelectMode)
  const selectRelationship = useWorkspaceStore((s) => s.selectRelationship)
  const selectGroup = useWorkspaceStore((s) => s.selectGroup)
  const clearSelection = useWorkspaceStore((s) => s.clearSelection)
  const storeSelectedElementIds = useWorkspaceStore((s) => s.selectedElementIds)
  const storeSelectedRelationshipId = useWorkspaceStore((s) => s.selectedRelationshipId)
  const updateNodePosition = useWorkspaceStore((s) => s.updateNodePosition)
  const syncAutoLayoutPositions = useWorkspaceStore((s) => s.syncAutoLayoutPositions)
  const addRelationship = useWorkspaceStore((s) => s.addRelationship)
  const reconnectRelationship = useWorkspaceStore((s) => s.reconnectRelationship)
  const activeTagFilter = useWorkspaceStore((s) => s.activeTagFilter)
  const activeStatusFilter = useWorkspaceStore((s) => s.activeStatusFilter)
  const activeTechFilter = useWorkspaceStore((s) => s.activeTechFilter)
  const activeTeamFilter = useWorkspaceStore((s) => s.activeTeamFilter)
  const tagFilterMode = useWorkspaceStore((s) => s.tagFilterMode)
  const statusFilterMode = useWorkspaceStore((s) => s.statusFilterMode)
  const techFilterMode = useWorkspaceStore((s) => s.techFilterMode)
  const teamFilterMode = useWorkspaceStore((s) => s.teamFilterMode)
  const layoutVersion = useWorkspaceStore((s) => s.layoutVersion)

  const highlightFilters = useMemo<HighlightFilters>(() => ({
    tags: activeTagFilter,
    statuses: activeStatusFilter,
    techs: activeTechFilter,
    teams: activeTeamFilter,
    tagsMode: tagFilterMode,
    statusesMode: statusFilterMode,
    techsMode: techFilterMode,
    teamsMode: teamFilterMode,
  }), [activeTagFilter, activeStatusFilter, activeTechFilter, activeTeamFilter, tagFilterMode, statusFilterMode, techFilterMode, teamFilterMode])

  const minimapMode = useSettingsStore((s) => s.minimapMode)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const colorTheme = useSettingsStore((s) => s.colorTheme)
  const themeStyles = THEMES[colorTheme]
  const themeCanvasBackground = THEME_CANVAS_BACKGROUNDS[colorTheme]
  const themeSelectionColor = THEME_SELECTION_COLORS[colorTheme]
  const themeEdgeColor = THEME_EDGE_COLORS[colorTheme]
  const isLightCanvas = isLightCanvasTheme(colorTheme)

  // Cascade canvas-related theme vars to document.documentElement so the
  // floating chrome (top pill, tool rail, inspector, etc.) — which is rendered
  // outside the canvas tree — can also read them.
  useEffect(() => {
    const root = document.documentElement
    const set = (key: string, value: string | null) => {
      if (value == null) root.style.removeProperty(key)
      else root.style.setProperty(key, value)
    }
    const labelColorOverride = THEME_LABEL_COLORS[colorTheme]
    const labelMutedOverride = THEME_LABEL_MUTED_COLORS[colorTheme]
    set('--canvas-bg', themeCanvasBackground ?? null)
    set('--canvas-selection', themeSelectionColor)
    set('--canvas-label-color', labelColorOverride ?? (isLightCanvas ? '#1f2937' : 'var(--color-text-secondary)'))
    set('--canvas-label-muted', labelMutedOverride ?? (isLightCanvas ? '#475569' : 'var(--color-text-muted)'))
    set('--canvas-edge', themeEdgeColor ?? null)
    if (isLightCanvas) root.setAttribute('data-canvas-light', '')
    else root.removeAttribute('data-canvas-light')
    return () => {
      set('--canvas-bg', null)
      set('--canvas-selection', null)
      set('--canvas-label-color', null)
      set('--canvas-label-muted', null)
      set('--canvas-edge', null)
      root.removeAttribute('data-canvas-light')
    }
  }, [themeCanvasBackground, themeSelectionColor, themeEdgeColor, isLightCanvas, colorTheme])

  // Stable callback refs — avoid new function references every render which would
  // invalidate expensive useMemos that depend on them.
  // Uses zoomInto (not drillInto) so that clicking the zoom button on a system
  // with no container view prompts the user to create one instead of silently doing nothing.
  const stableDrillInto = useCallback((elementId: string) => {
    useWorkspaceStore.getState().zoomInto(elementId)
  }, [])


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
    const rawNodes = buildNodes(workspace, view, stableDrillInto, highlightFilters, viewCountMap, drillableIds, themeStyles)

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

    // 3. Auto-layout: position unpinned nodes, keep pinned ones.
    //    Compute boundary-internal IDs so dagre clusters internal nodes together
    //    and positions external nodes outside the scope boundary.
    let boundaryInternalIds = new Set<string>()
    if (view.type === 'container' && view.softwareSystemId) {
      const scopeSystem = workspace.model.softwareSystems.find(s => s.id === view.softwareSystemId)
      if (scopeSystem) boundaryInternalIds = new Set(scopeSystem.containers.map(c => c.id))
    } else if (view.type === 'component' && view.containerId) {
      const scopeContainer = workspace.model.softwareSystems.flatMap(s => s.containers).find(c => c.id === view.containerId)
      if (scopeContainer) boundaryInternalIds = new Set(scopeContainer.components.map(c => c.id))
    }
    const laidOut = applyAutoLayout(rawNodes, tempEdges, view, workspace.model.groups, direction, boundaryInternalIds)

    // 4. Build group background nodes and scope boundary using post-layout positions
    const groupNodes = buildGroupNodes(workspace, workspace.model.groups, laidOut)
    const boundaryNode = buildBoundaryNode(workspace, view, laidOut)
    const overlayNodes = [...(boundaryNode ? [boundaryNode] : []), ...groupNodes]
    const allNodes = [...overlayNodes, ...laidOut]

    // 5. Build final edges using post-layout positions for handle routing
    const edges = buildEdges(workspace, view, allNodes, highlightFilters)

    return { initialNodes: allNodes, initialEdges: edges }
  }, [workspace, view, stableDrillInto, highlightFilters, viewCountMap, themeStyles])

  // Canonicalize the initial dagre layout: write computed positions back to
  // view.elements for any element that doesn't already have a saved x/y.
  // Without this, view.elements positions stay undefined after initial layout,
  // so a subsequent add (e.g. a new Person with no edges) sees no "frozen"
  // siblings — applyAutoLayout falls back to a full dagre run, where the
  // disconnected new node ends up far off as its own component. Persisting
  // the initial layout makes those siblings frozen, letting the bbox-park
  // heuristic in applyAutoLayout drop the new node next to existing content.
  useEffect(() => {
    if (!view) return
    const updates = new Map<string, { x: number; y: number }>()
    for (const ve of view.elements) {
      if (ve.x !== undefined && ve.y !== undefined) continue
      const node = initialNodes.find(n => n.id === ve.id)
      if (node && node.position) {
        updates.set(ve.id, { x: node.position.x, y: node.position.y })
      }
    }
    if (updates.size > 0) syncAutoLayoutPositions(view.key, updates)
  }, [initialNodes, view, syncAutoLayoutPositions])

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

  // Rebuild group + boundary overlays using real measured node sizes. Polls
  // until React Flow has finished measuring; safe to call after any change
  // that mutates the group set or node sizes.
  //
  // Two sources of truth diverge here and we need to stitch them: positions
  // live in React state (`prev` inside the functional setNodes), measured
  // dimensions live in React Flow's internal store (rf.getNodes()). Reading
  // positions from rf produces a group rectangle that lags one render behind
  // the layout; reading measurements from prev gives undefined sizes (the
  // rebuild collapses to default 200x100).
  // Bound rAF polling so a measurement regression can't busy-loop forever.
  const rebuildAttempts = useRef(0)
  const MAX_MEASURE_ATTEMPTS = 60
  const rebuildOverlays = useCallback(() => {
    const rf = rfInitInstance.current ?? reactFlowInstance
    const contentNodes = rf.getNodes().filter(isContentFitNode)
    if (contentNodes.length === 0 || !contentNodes.every(n => n.measured?.width && n.measured?.height)) {
      if (rebuildAttempts.current++ < MAX_MEASURE_ATTEMPTS) {
        requestAnimationFrame(rebuildOverlays)
      }
      return
    }
    rebuildAttempts.current = 0
    const ws = workspaceRef.current
    const v = viewRef.current
    if (!ws) return
    const measuredById = new Map<string, { width?: number; height?: number }>()
    for (const n of rf.getNodes()) {
      if (n.measured?.width && n.measured?.height) measuredById.set(n.id, n.measured)
    }
    setNodes((prev) => {
      const contentOnly = prev
        .filter(n => !n.id.startsWith('group-') && n.id !== '__scope_boundary__')
        .map(n => ({ ...n, measured: measuredById.get(n.id) ?? n.measured }))
      const updatedGroups = buildGroupNodes(ws, ws.model.groups, contentOnly)
      const updatedBoundary = v ? buildBoundaryNode(ws, v, contentOnly) : null
      const overlays: typeof prev = []
      if (updatedBoundary) overlays.push(updatedBoundary as typeof prev[0])
      overlays.push(...updatedGroups as typeof prev)
      return [...contentOnly, ...overlays]
    })
  }, [reactFlowInstance, setNodes])

  const fitAttempts = useRef(0)
  // The IDs we're expecting to fit to. Set by the sync effect on a structural
  // change. Prevents a race where the rAF fires before React has committed
  // setNodes, so rf.getNodes() still returns the previous view's nodes.
  const expectedFitIds = useRef<Set<string> | null>(null)
  const fitContentNodes = useCallback(() => {
    if (!fitPending.current) return

    const tryAgain = () => {
      if (fitAttempts.current++ < MAX_MEASURE_ATTEMPTS) requestAnimationFrame(fitContentNodes)
      else { fitPending.current = false; fitAttempts.current = 0; expectedFitIds.current = null }
    }

    // React Flow's useReactFlow() returns a proxy that silently no-ops
    // setViewport/fitView until onInit fires (panZoom is initialized). If we
    // race ahead of onInit on a view switch, the fit appears to succeed but
    // the viewport never moves. Wait for the real instance before proceeding.
    const rf = rfInitInstance.current
    if (!rf) { tryAgain(); return }

    // Check: canvas DOM must be full-size
    const el = document.querySelector('.react-flow') as HTMLElement | null
    if (!el) { tryAgain(); return }
    const { width, height } = el.getBoundingClientRect()
    if (width < 200 || height < 200) { tryAgain(); return }

    // Check: React Flow's current node set matches what we scheduled the fit
    // for. Without this, a rAF fired right after setNodes can see the PREVIOUS
    // view's nodes (already measured) and fit to the wrong bounds.
    const contentNodes = rf.getNodes().filter(isContentFitNode)
    const expected = expectedFitIds.current
    if (expected) {
      const seen = new Set(contentNodes.map(n => n.id))
      if (seen.size !== expected.size) { tryAgain(); return }
      for (const id of expected) {
        if (!seen.has(id)) { tryAgain(); return }
      }
    }

    // Check: all content nodes must be measured
    if (contentNodes.length === 0 || !contentNodes.every(n => n.measured?.width && n.measured?.height)) {
      tryAgain()
      return
    }
    fitAttempts.current = 0
    expectedFitIds.current = null

    fitPending.current = false
    // Rebuild overlays first so the bbox is correct before refitting.
    rebuildOverlays()

    fitNodesToViewport(rf, contentNodes)
  }, [rebuildOverlays])

  // Sync nodes/edges when workspace changes.
  //
  // Fit-on-load policy: only fit the viewport the FIRST time a view is shown
  // in this session, or when a structural change to that view has happened
  // since its last fit (elementCount or layoutVersion changed, e.g. via add
  // element / reset & relayout). Returning to a view you've already visited
  // at the same element count and layout version preserves the current
  // viewport — the user's pan/zoom from the previous view is kept.
  //
  // Drag-stop position saves must NOT cause refit. Non-structural changes
  // (rename, relationship add, style edit) only update edges and node data.
  const lastStructuralSignal = useRef<string>('')
  const fittedSignaturesByView = useRef<Map<string, string>>(new Map())
  // Pending viewport restore (set when entering a view that has a saved
  // viewport). Polled via rAF until the RF instance is ready, since onInit
  // may not have fired on the first frame after a view switch.
  const restorePending = useRef<{ viewport: { x: number; y: number; zoom: number } } | null>(null)
  const restoreAttempts = useRef(0)
  const tryRestoreViewport = useCallback(() => {
    const pending = restorePending.current
    if (!pending) return
    const rf = rfInitInstance.current
    if (!rf) {
      if (restoreAttempts.current++ < 30) requestAnimationFrame(tryRestoreViewport)
      else { restorePending.current = null; restoreAttempts.current = 0 }
      return
    }
    rf.setViewport(pending.viewport, { duration: 0 })
    restorePending.current = null
    restoreAttempts.current = 0
  }, [])

  useEffect(() => {
    const signal = `${activeViewKey}:${view?.elements.length ?? 0}:${layoutVersion}`
    if (signal !== lastStructuralSignal.current) {
      const prevSignal = lastStructuralSignal.current
      lastStructuralSignal.current = signal

      // Structural change for the current view — swap nodes and edges.
      setNodes(initialNodes)
      setEdges(initialEdges)

      // Decide whether to refit. Fit only when THIS view hasn't been fitted
      // yet in this session, or when its content has changed (element count
      // or layout version) since the last fit.
      const viewKey = activeViewKey ?? ''
      const viewSig = `${view?.elements.length ?? 0}:${layoutVersion}`
      const lastFitSig = fittedSignaturesByView.current.get(viewKey)

      // View-switch detection: the viewKey portion of the signal changed.
      // On view-switch, prefer a saved viewport over a fit-on-load so the user
      // returns to the pan/zoom they had on this view previously. Within-view
      // structural changes (layoutVersion bump, element add/remove) still fit.
      const prevViewKey = prevSignal ? prevSignal.split(':')[0] : ''
      const isViewSwitch = viewKey !== '' && prevViewKey !== viewKey
      if (isViewSwitch) {
        const saved = loadViewport(workspaceRef.current?.name, viewKey)
        if (saved) {
          // Mark this view as "fitted at this signature" so any subsequent
          // re-render of this effect within the same view doesn't kick off
          // a fit and override the restored viewport.
          fittedSignaturesByView.current.set(viewKey, viewSig)
          fitPending.current = false
          restorePending.current = { viewport: saved }
          restoreAttempts.current = 0
          requestAnimationFrame(tryRestoreViewport)
          requestAnimationFrame(rebuildOverlays)
          return
        }
      }

      if (viewKey && lastFitSig !== viewSig) {
        fittedSignaturesByView.current.set(viewKey, viewSig)
        expectedFitIds.current = new Set(initialNodes.filter(isContentFitNode).map((n) => n.id))
        fitPending.current = true
        fitAttempts.current = 0
        requestAnimationFrame(fitContentNodes)
      } else {
        // Already fitted this view at this signature — just refresh overlays
        // against the new node positions without touching the viewport.
        requestAnimationFrame(rebuildOverlays)
      }
    } else {
      // Non-structural change (e.g. new relationship, style update, rename).
      // Only update edges and refresh node data without replacing positions.
      setEdges(initialEdges)
      setNodes((prev) => {
        const byId = new Map(initialNodes.map(n => [n.id, n]))
        return prev.map(n => {
          const next = byId.get(n.id)
          return next ? { ...n, data: next.data, className: next.className } : n
        })
      })
      requestAnimationFrame(rebuildOverlays)
    }
  }, [initialNodes, initialEdges, setNodes, setEdges, fitContentNodes, rebuildOverlays, activeViewKey, view, layoutVersion, tryRestoreViewport])

  // Reconcile RF's internal `selected` flag with the store. Without this, an
  // outside-click that clears the store selection (e.g. clicking a filter chip
  // in the bottom strip dismisses the inspector via FloatingInspector's outside
  // listener) leaves the node still marked `selected: true` inside RF — so the
  // next click on that node is a no-op (RF sees no change → no onSelectionChange
  // → inspector never reopens).
  useEffect(() => {
    const elIds = new Set(storeSelectedElementIds)
    setNodes((prev) => {
      let changed = false
      const next = prev.map((n) => {
        const shouldBeSelected = elIds.has(n.id)
        if (!!n.selected === shouldBeSelected) return n
        changed = true
        return { ...n, selected: shouldBeSelected }
      })
      return changed ? next : prev
    })
    setEdges((prev) => {
      let changed = false
      const next = prev.map((e) => {
        const shouldBeSelected = e.id === storeSelectedRelationshipId
        if (!!e.selected === shouldBeSelected) return e
        changed = true
        return { ...e, selected: shouldBeSelected }
      })
      return changed ? next : prev
    })
  }, [storeSelectedElementIds, storeSelectedRelationshipId, setNodes, setEdges])

  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    onNodesChange(changes)
    if (fitPending.current) {
      requestAnimationFrame(fitContentNodes)
    }
    // When content nodes get measured/resized, rebuild group/boundary overlays
    // so they wrap the actual rendered sizes, not the 200×100 dagre defaults.
    if (changes.some(c => c.type === 'dimensions' && 'id' in c && !(c.id as string).startsWith('group-') && c.id !== '__scope_boundary__')) {
      requestAnimationFrame(rebuildOverlays)
    }
  }, [onNodesChange, fitContentNodes, rebuildOverlays])

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

  useEffect(() => {
    if (inspectorTimer.current) {
      clearTimeout(inspectorTimer.current)
      inspectorTimer.current = null
    }
    isDragging.current = false
  }, [activeViewKey])

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

  const minimapStyle = useMemo<React.CSSProperties>(() => ({
    backgroundColor: 'var(--color-surface-1)',
    opacity: minimapMode === 'always' || minimapVisible ? 1 : 0,
    transition: 'opacity 300ms ease',
    pointerEvents: minimapMode === 'always' || minimapVisible ? 'auto' : 'none',
  }), [minimapMode, minimapVisible])

  const onMoveStart = useCallback(() => {
    setMinimapVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [])

  const onMoveEnd = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setMinimapVisible(false), 1500)
    // Persist current viewport per-view so re-entering this view restores
    // the user's last pan/zoom instead of inheriting the prior view's state.
    const rf = rfInitInstance.current
    if (rf && activeViewKey) {
      saveViewport(workspaceRef.current?.name, activeViewKey, rf.getViewport())
    }
  }, [activeViewKey])

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
      if (inspectorTimer.current) {
        clearTimeout(inspectorTimer.current)
        inspectorTimer.current = null
      }
      // zoomInto handles both cases: navigate to existing child view, or prompt
      // to create one if none exists. Internally no-ops if the element has no
      // children (person/component/etc.).
      useWorkspaceStore.getState().zoomInto(node.id)
    },
    [],
  )

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      updateNodePosition(node.id, node.position.x, node.position.y)
      // Rebuild overlays immediately so group and scope bounds do not disappear
      // for a frame between the drag stop and the store-driven refresh.
      const ws = workspaceRef.current
      const v = viewRef.current
      if (ws) {
        setNodes(prev => {
          const contentOnly = prev.filter(n => n.type !== 'group' && n.type !== 'boundary')
          const updatedGroups = buildGroupNodes(ws, ws.model.groups, contentOnly)
          const updatedBoundary = v ? buildBoundaryNode(ws, v, contentOnly) : null
          const overlays: typeof prev = []
          if (updatedBoundary) overlays.push(updatedBoundary as typeof prev[0])
          overlays.push(...updatedGroups as typeof prev)
          return [...contentOnly, ...overlays]
        })
      }
      // Reset drag flag slightly after stop so any trailing onSelectionChange is still suppressed
      setTimeout(() => { isDragging.current = false }, 50)
    },
    [updateNodePosition, setNodes],
  )


  // Track recent connections to prevent duplicates from multiple handle matches.
  // ReactFlow can fire onConnect several times for the same drag when a node has
  // multiple handles — dedup only on the exact same direction (source→target).
  // We intentionally allow B→A right after A→B so bidirectional relationships work.
  const recentConnect = useRef<Set<string>>(new Set())
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target && connection.source !== connection.target) {
        const key = `${connection.source}->${connection.target}`
        if (recentConnect.current.has(key)) return
        recentConnect.current.add(key)
        setTimeout(() => { recentConnect.current.delete(key) }, 300)
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

  const onPaneClick = useCallback(() => {
    if (inspectorTimer.current) { clearTimeout(inspectorTimer.current); inspectorTimer.current = null }
    clearSelection()
  }, [clearSelection])

  const onInit = useCallback((instance: typeof reactFlowInstance) => {
    rfInitInstance.current = instance
    if (fitPending.current) requestAnimationFrame(fitContentNodes)
  }, [fitContentNodes])

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
            <kbd style={KBD_STYLE}>A</kbd>
            to add an element
            <span style={{ opacity: 0.5 }}>·</span>
            <kbd style={KBD_STYLE}>?</kbd>
            for shortcuts
          </span>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={onInit}
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
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        proOptions={RF_PRO_OPTIONS}
        minZoom={0.1}
        maxZoom={2}
        snapToGrid={snapToGrid}
        snapGrid={RF_SNAP_GRID}
        connectionRadius={40}
        deleteKeyCode={null}
        panOnDrag={spaceHeld ? RF_PAN_ON_DRAG_SPACE : RF_PAN_ON_DRAG_DEFAULT}
        defaultEdgeOptions={RF_DEFAULT_EDGE_OPTIONS}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={32}
          size={1.5}
          color={isLightCanvas ? 'rgba(0,0,0,0.32)' : '#3a5274'}
        />
        {minimapMode !== 'never' && (
          <MiniMap
            nodeStrokeWidth={3}
            zoomable
            pannable
            style={minimapStyle}
          />
        )}
        {/* Custom arrow marker — zero-size so it doesn't occupy canvas space */}
        <svg style={MARKER_SVG_STYLE}>
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
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--canvas-edge, var(--color-edge))" />
            </marker>
            <marker
              id="c4-arrow-selected"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth={8}
              markerHeight={8}
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--canvas-selection, var(--color-accent))" />
            </marker>
            <marker
              id="c4-dot"
              viewBox="0 0 10 10"
              refX="5"
              refY="5"
              markerWidth={6}
              markerHeight={6}
            >
              <circle cx="5" cy="5" r="4" fill="var(--canvas-edge, var(--color-edge))" />
            </marker>
            <marker
              id="c4-dot-selected"
              viewBox="0 0 10 10"
              refX="5"
              refY="5"
              markerWidth={6}
              markerHeight={6}
            >
              <circle cx="5" cy="5" r="4" fill="var(--canvas-selection, var(--color-accent))" />
            </marker>
          </defs>
        </svg>
      </ReactFlow>
    </div>
  )
}
