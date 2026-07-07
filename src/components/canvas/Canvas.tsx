import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStore,
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
import type { HighlightFilters } from '@/lib/highlight'
import type { View, Workspace } from '@/types/model'
import { useWorkspaceStore, getActiveView, allViewsOf, buildRelationshipMap } from '@/store/workspace'
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
import {
  buildNodes,
  buildEdges,
  buildGroupNodes,
  buildBoundaryNodes,
  buildDrillableSet,
  buildBoundaryLayoutClusters,
} from './canvasBuilders'
import CanvasGuide from './CanvasGuide'

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
const SCOPE_BOUNDARY_PREFIX = '__scope_boundary__'

function isScopeBoundaryNode(node: Pick<Node, 'id'>): boolean {
  return node.id.startsWith(SCOPE_BOUNDARY_PREFIX)
}

function getViewportFitNodes(nodes: Node[]): Node[] {
  const contentNodes = nodes.filter(isContentFitNode)
  return contentNodes.length > 0 ? contentNodes : nodes.filter(isScopeBoundaryNode)
}

function getBoundaryMemberIds(workspace: Workspace | null | undefined, view: View | undefined, boundaryNodeId: string): Set<string> {
  const parentId = boundaryNodeId.startsWith(SCOPE_BOUNDARY_PREFIX)
    ? boundaryNodeId.slice(SCOPE_BOUNDARY_PREFIX.length)
    : null
  const memberIds = new Set<string>()
  if (!workspace || !view || !parentId) return memberIds

  if (view.type === 'container') {
    const system = workspace.model.softwareSystems.find((item) => item.id === parentId)
    for (const container of system?.containers ?? []) memberIds.add(container.id)
  } else if (view.type === 'component') {
    const container = workspace.model.softwareSystems
      .flatMap((system) => system.containers)
      .find((item) => item.id === parentId)
    for (const component of container?.components ?? []) memberIds.add(component.id)
  }

  return memberIds
}

function getNestedGroupNodeIds(workspace: Workspace | null | undefined, memberIds: Set<string>, draggedNodeId: string): Set<string> {
  const nestedGroupIds = new Set<string>()
  if (!workspace || memberIds.size === 0) return nestedGroupIds

  for (const group of workspace.model.groups) {
    const groupNodeId = `group-${group.id}`
    if (groupNodeId === draggedNodeId || group.elementIds.length === 0) continue
    if (group.elementIds.every((id) => memberIds.has(id))) nestedGroupIds.add(groupNodeId)
  }

  return nestedGroupIds
}

function isOverlayNode(node: Pick<Node, 'id' | 'type'>): boolean {
  return node.type === 'group' || node.type === 'boundary' || node.id.startsWith('group-') || isScopeBoundaryNode(node)
}

function nodeNumberStyle(node: Node, key: 'width' | 'height'): number | undefined {
  const value = node.style?.[key]
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function sameOverlayGeometry(a: Node, b: Node): boolean {
  const samePosition = a.position.x === b.position.x && a.position.y === b.position.y
  const sameSize = nodeNumberStyle(a, 'width') === nodeNumberStyle(b, 'width')
    && nodeNumberStyle(a, 'height') === nodeNumberStyle(b, 'height')
  const sameState = a.type === b.type
    && a.zIndex === b.zIndex
    && a.selectable === b.selectable
    && a.draggable === b.draggable
    && a.focusable === b.focusable
  const sameData = JSON.stringify(a.data ?? {}) === JSON.stringify(b.data ?? {})
  return samePosition && sameSize && sameState && sameData
}

function rebuildNodesWithOverlays(workspace: Workspace, view: View | undefined, nodes: Node[]): Node[] {
  const contentOnly = nodes.filter((n) => !isOverlayNode(n))
  const previousOverlays = new Map(nodes.filter(isOverlayNode).map((n) => [n.id, n]))
  const boundaryClusters = view ? buildBoundaryLayoutClusters(workspace, view) : []
  const updatedGroups = buildGroupNodes(workspace, workspace.model.groups, contentOnly, boundaryClusters)
  const updatedBoundaries = view ? buildBoundaryNodes(workspace, view, contentOnly, updatedGroups) : []
  const overlays = [...updatedBoundaries, ...updatedGroups].map((overlay) => {
    const previous = previousOverlays.get(overlay.id)
    return previous && sameOverlayGeometry(previous, overlay) ? previous : overlay
  })
  return [...overlays, ...contentOnly]
}

function carryForwardMeasurements(nodes: Node[], measuredNodes: Node[]): Node[] {
  const measuredById = new Map<string, { width?: number; height?: number }>()
  for (const node of measuredNodes) {
    if (node.measured?.width && node.measured?.height) measuredById.set(node.id, node.measured)
  }
  if (measuredById.size === 0) return nodes
  return nodes.map((node) => {
    const measured = measuredById.get(node.id)
    return measured ? { ...node, measured } : node
  })
}

// Constant style for the zero-size SVG that holds the arrow marker definition.
// Hoisted so React never re-creates it on render.
const MARKER_SVG_STYLE: React.CSSProperties = { position: 'absolute', width: 0, height: 0, overflow: 'hidden' }


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
  const storeSelectedGroupId = useWorkspaceStore((s) => s.selectedGroupId)
  const updateNodePosition = useWorkspaceStore((s) => s.updateNodePosition)
  const updateNodePositions = useWorkspaceStore((s) => s.updateNodePositions)
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
  const canvasGuideOpen = useWorkspaceStore((s) => s.canvasGuideOpen)
  const setCanvasGuideOpen = useWorkspaceStore((s) => s.setCanvasGuideOpen)

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
  const canvasGuideDismissed = useSettingsStore((s) => s.canvasGuideDismissed)
  const updateSettings = useSettingsStore((s) => s.update)
  const themeStyles = THEMES[colorTheme]
  const themeCanvasBackground = THEME_CANVAS_BACKGROUNDS[colorTheme]
  const themeSelectionColor = THEME_SELECTION_COLORS[colorTheme]
  const themeEdgeColor = THEME_EDGE_COLORS[colorTheme]
  const isLightCanvas = isLightCanvasTheme(colorTheme)
  const reactFlowInstance = useReactFlow()
  const guideAutoOpened = useRef(false)

  useEffect(() => {
    if (!workspace || !activeViewKey || canvasGuideDismissed || guideAutoOpened.current) return
    guideAutoOpened.current = true
    setCanvasGuideOpen(true)
  }, [workspace, activeViewKey, canvasGuideDismissed, setCanvasGuideOpen])

  const closeCanvasGuide = useCallback(() => {
    setCanvasGuideOpen(false)
    updateSettings({ canvasGuideDismissed: true })
  }, [setCanvasGuideOpen, updateSettings])

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
    const boundaryBorder = colorTheme === 'highContrast'
      ? '#000000'
      : isLightCanvas
        ? 'color-mix(in srgb, var(--canvas-selection, var(--color-accent)) 42%, transparent)'
        : null
    set('--canvas-bg', themeCanvasBackground ?? null)
    set('--canvas-selection', themeSelectionColor)
    set('--canvas-label-color', labelColorOverride ?? (isLightCanvas ? '#1f2937' : 'var(--color-text-secondary)'))
    set('--canvas-label-muted', labelMutedOverride ?? (isLightCanvas ? '#475569' : 'var(--color-text-muted)'))
    set('--canvas-edge', themeEdgeColor ?? null)
    set('--canvas-boundary-border', boundaryBorder)
    set('--canvas-boundary-bg', isLightCanvas ? 'rgba(15, 23, 42, 0.012)' : null)
    set('--canvas-boundary-title', isLightCanvas ? 'var(--canvas-label-muted)' : null)
    set('--canvas-boundary-subtitle', isLightCanvas ? 'color-mix(in srgb, var(--canvas-label-muted) 74%, transparent)' : null)
    if (isLightCanvas) root.setAttribute('data-canvas-light', '')
    else root.removeAttribute('data-canvas-light')
    return () => {
      set('--canvas-bg', null)
      set('--canvas-selection', null)
      set('--canvas-label-color', null)
      set('--canvas-label-muted', null)
      set('--canvas-edge', null)
      set('--canvas-boundary-border', null)
      set('--canvas-boundary-bg', null)
      set('--canvas-boundary-title', null)
      set('--canvas-boundary-subtitle', null)
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

  // Compute a stable numeric fingerprint of the view structure so that
  // viewCountMap only recomputes when views are actually added/removed or
  // their element membership changes — not on every workspace clone
  // (e.g. element rename, tag change). Uses a 32-bit rolling hash instead
  // of building a giant string per store update; for typical workspaces this
  // is ~10-100x cheaper allocation-wise.
  const viewStructureKey = useWorkspaceStore((s) => {
    if (!s.workspace) return 0
    let h = 17
    for (const view of allViewsOf(s.workspace)) {
      // Mix in the key length and element count first so views with no
      // elements still differ when they're added/removed.
      h = (Math.imul(h, 31) + view.key.length) | 0
      h = (Math.imul(h, 31) + view.elements.length) | 0
      for (const el of view.elements) {
        // Hash one char from each id — cheap and order-sensitive.
        h = (Math.imul(h, 31) + el.id.charCodeAt(0)) | 0
      }
    }
    return h
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
    const layoutNodes = carryForwardMeasurements(rawNodes, reactFlowInstance.getNodes())

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
    //    Pass every drawn boundary so dagre clusters members together and the
    //    post-layout spacing pass can keep rendered boundary boxes apart.
    const boundaryClusters = buildBoundaryLayoutClusters(workspace, view)
    const focalBoundaryId = view.type === 'container' ? view.softwareSystemId : view.type === 'component' ? view.containerId : undefined
    const boundaryInternalIds = new Set(boundaryClusters.find((cluster) => cluster.id === focalBoundaryId)?.elementIds ?? [])
    const laidOut = applyAutoLayout(layoutNodes, tempEdges, view, workspace.model.groups, direction, boundaryInternalIds, boundaryClusters)

    // 4. Build group background nodes and scope boundary using post-layout positions
    const groupNodes = buildGroupNodes(workspace, workspace.model.groups, laidOut, boundaryClusters)
    const boundaryNodes = buildBoundaryNodes(workspace, view, laidOut, groupNodes)
    const overlayNodes = [...boundaryNodes, ...groupNodes]
    const allNodes = [...overlayNodes, ...laidOut]

    // 5. Build final edges using post-layout positions for handle routing
    const edges = buildEdges(workspace, view, allNodes, highlightFilters)

    return { initialNodes: allNodes, initialEdges: edges }
  }, [workspace, view, stableDrillInto, highlightFilters, viewCountMap, themeStyles, reactFlowInstance])

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
        .filter(n => !n.id.startsWith('group-') && !n.id.startsWith('__scope_boundary__'))
        .map(n => ({ ...n, measured: measuredById.get(n.id) ?? n.measured }))
      return rebuildNodesWithOverlays(ws, v, contentOnly)
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
    const fitNodes = getViewportFitNodes(rf.getNodes())
    const expected = expectedFitIds.current
    if (expected) {
      const seen = new Set(fitNodes.map(n => n.id))
      if (seen.size !== expected.size) { tryAgain(); return }
      for (const id of expected) {
        if (!seen.has(id)) { tryAgain(); return }
      }
    }

    // Check: all fit target nodes must be measured. Empty scoped views fit to
    // their boundary so the user sees the scope they are about to fill.
    if (fitNodes.length === 0 || !fitNodes.every(n => n.measured?.width && n.measured?.height)) {
      tryAgain()
      return
    }
    fitAttempts.current = 0
    expectedFitIds.current = null

    fitPending.current = false
    // Rebuild overlays first so the bbox is correct before refitting.
    rebuildOverlays()

    fitNodesToViewport(rf, fitNodes)
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
        expectedFitIds.current = new Set(getViewportFitNodes(initialNodes).map((n) => n.id))
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
        const shouldBeSelected = n.id.startsWith('group-')
          ? storeSelectedGroupId === n.id.slice(6)
          : isScopeBoundaryNode(n)
            ? false
            : elIds.has(n.id)
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
  }, [storeSelectedElementIds, storeSelectedRelationshipId, storeSelectedGroupId, setNodes, setEdges])

  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    onNodesChange(changes)
    if (fitPending.current) {
      requestAnimationFrame(fitContentNodes)
    }
    // When content nodes get measured/resized, rebuild group/boundary overlays
    // so they wrap the actual rendered sizes, not the 200×100 dagre defaults.
    if (changes.some(c => c.type === 'dimensions' && 'id' in c && !(c.id as string).startsWith('group-') && !(c.id as string).startsWith('__scope_boundary__'))) {
      requestAnimationFrame(rebuildOverlays)
    }
  }, [onNodesChange, fitContentNodes, rebuildOverlays])

  // Center view on newly created element (e.g. focused from the interview).
  const focusElementId = useWorkspaceStore((s) => s.focusElementId)
  const clearFocusElement = useWorkspaceStore((s) => s.clearFocusElement)
  useEffect(() => {
    if (!focusElementId) return
    const targetId = focusElementId
    // A focus often switches the active view first, which remounts the canvas
    // nodes — so the target may not exist for several frames. Poll a bounded
    // number of frames instead of giving up after one, or the view changes but
    // the canvas never frames the element (left off-screen). Clear the one-shot
    // focus only once we've acted (or exhausted attempts), not up front.
    let raf = 0
    let attempts = 0
    const run = () => {
      const node = reactFlowInstance.getNode(targetId)
      if (!node) {
        if (attempts++ < 60) { raf = requestAnimationFrame(run); return }
        clearFocusElement()
        return
      }
      // Center on the element but keep the current zoom level.
      reactFlowInstance.setCenter(
        node.position.x + (node.measured?.width ?? 200) / 2,
        node.position.y + (node.measured?.height ?? 100) / 2,
        { duration: 300, zoom: reactFlowInstance.getZoom() },
      )
      clearFocusElement()
    }
    raf = requestAnimationFrame(run)
    return () => cancelAnimationFrame(raf)
  }, [focusElementId, clearFocusElement, reactFlowInstance])

  // Suppress inspector opening during drag (works on touch too).
  // onSelectionChange fires at touch-start before any movement, so we schedule
  // the selectElements call and cancel it if onNodeDrag fires first.
  const isDragging = useRef(false)
  const inspectorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectionGestureActive = useRef(false)
  const pendingSelectionIds = useRef<string[] | null>(null)
  const shiftKeyDown = useRef(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') shiftKeyDown.current = true
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') shiftKeyDown.current = false
    }
    const reset = () => { shiftKeyDown.current = false }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', reset)
    }
  }, [])

  // Per-drag context for moving a group/boundary as a unit. These overlay
  // shapes are derived from their members, so dragging them translates the
  // member nodes and persists those positions.
  const overlayDragRef = useRef<{
    nodeId: string
    nodeStart: { x: number; y: number }
    memberStart: Map<string, { x: number; y: number }>
    persistedMemberIds: Set<string>
  } | null>(null)

  const onNodeDragStart = useCallback((_event: MouseEvent | TouchEvent, node: Node) => {
    isDragging.current = false
    let memberSet: Set<string> | null = null

    if (node.id.startsWith('group-')) {
      const groupId = node.id.slice(6)
      const ws = workspaceRef.current
      const group = ws?.model.groups.find((g) => g.id === groupId)
      if (!group) { overlayDragRef.current = null; return }
      memberSet = new Set(group.elementIds)
    } else if (isScopeBoundaryNode(node)) {
      memberSet = getBoundaryMemberIds(workspaceRef.current, viewRef.current, node.id)
    } else {
      overlayDragRef.current = null
      return
    }

    const persistedMemberIds = new Set(memberSet)
    const dragMemberIds = new Set(memberSet)
    for (const groupNodeId of getNestedGroupNodeIds(workspaceRef.current, memberSet, node.id)) {
      dragMemberIds.add(groupNodeId)
    }

    const memberStart = new Map<string, { x: number; y: number }>()
    for (const n of reactFlowInstance.getNodes()) {
      if (dragMemberIds.has(n.id)) memberStart.set(n.id, { x: n.position.x, y: n.position.y })
    }
    overlayDragRef.current = {
      nodeId: node.id,
      nodeStart: { x: node.position.x, y: node.position.y },
      memberStart,
      persistedMemberIds,
    }
  }, [reactFlowInstance])

  const onNodeDrag = useCallback((_event: MouseEvent | TouchEvent, node: Node) => {
    isDragging.current = true
    if (inspectorTimer.current) {
      clearTimeout(inspectorTimer.current)
      inspectorTimer.current = null
    }
    const ctx = overlayDragRef.current
    if (ctx && node.id === ctx.nodeId) {
      // Translate every member by the same delta the overlay has been dragged.
      // Reading from the captured member-start map keeps the deltas exact
      // even if RF batches multiple drag frames before flushing.
      const dx = node.position.x - ctx.nodeStart.x
      const dy = node.position.y - ctx.nodeStart.y
      setNodes((prev) => {
        const moved = prev.map((n) => {
          const start = ctx.memberStart.get(n.id)
          if (!start) return n
          return { ...n, position: { x: start.x + dx, y: start.y + dy } }
        })
        const ws = workspaceRef.current
        if (!ws || ctx.memberStart.size === 0) return moved
        return rebuildNodesWithOverlays(ws, viewRef.current, moved)
      })
      return
    }

    const ws = workspaceRef.current
    if (!ws || isOverlayNode(node)) return
    setNodes((prev) => {
      const moved = prev.map((n) => n.id === node.id ? { ...n, position: node.position } : n)
      return rebuildNodesWithOverlays(ws, viewRef.current, moved)
    })
  }, [setNodes])

  useEffect(() => {
    if (inspectorTimer.current) {
      clearTimeout(inspectorTimer.current)
      inspectorTimer.current = null
    }
    isDragging.current = false
    // Also clear on unmount — without this, a group/element selection made
    // just before the workspace changes or the canvas otherwise unmounts
    // leaves this timer pending. It still fires later against whatever is
    // NOW mounted (selectGroup/selectElements are stable store actions,
    // unscoped to any one Canvas instance), silently selecting the wrong
    // group/element in an unrelated view.
    return () => {
      if (inspectorTimer.current) {
        clearTimeout(inspectorTimer.current)
        inspectorTimer.current = null
      }
    }
  }, [activeViewKey])

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      // In multi-select mode, onNodeClick handles selection manually — ignore RF's selection events
      if (multiSelectModeRef.current) return

      const groupNodes = selectedNodes.filter(n => n.id.startsWith('group-'))
      const elementNodes = selectedNodes.filter(n => !n.id.startsWith('group-') && !isScopeBoundaryNode(n))
      const selectElementNodes = (ids: string[]) => {
        const nextIds = [...ids]
        const selectedSet = new Set(nextIds)
        setNodes((prev) => {
          let changed = false
          const next = prev.map((n) => {
            const shouldBeSelected = !isOverlayNode(n) && selectedSet.has(n.id)
            if (!!n.selected === shouldBeSelected) return n
            changed = true
            return { ...n, selected: shouldBeSelected }
          })
          return changed ? next : prev
        })
        selectElements(nextIds)
      }

      if (groupNodes.length > 0 && elementNodes.length > 0) {
        const ids = elementNodes.map((n) => n.id)
        if (selectionGestureActive.current) {
          pendingSelectionIds.current = ids
          return
        }
        if (inspectorTimer.current) { clearTimeout(inspectorTimer.current); inspectorTimer.current = null }
        selectElementNodes(ids)
        return
      }

      if (groupNodes.length > 0 && shiftKeyDown.current && useWorkspaceStore.getState().selectedElementIds.length > 0) {
        if (inspectorTimer.current) { clearTimeout(inspectorTimer.current); inspectorTimer.current = null }
        selectElementNodes(useWorkspaceStore.getState().selectedElementIds)
        return
      }

      if (groupNodes.length > 0) {
        // Defer group selection on the same 120ms / isDragging-cancel pattern
        // we use for elements. Without this, pressing a group on a phone
        // immediately pops the inspector — a tap-and-drag (long-press to move
        // the cluster) selects-then-drags, leaving the inspector flashing
        // open before the drag suppresses it.
        const groupId = groupNodes[0].id.slice(6) // strip 'group-' prefix
        if (inspectorTimer.current) clearTimeout(inspectorTimer.current)
        inspectorTimer.current = setTimeout(() => {
          inspectorTimer.current = null
          if (!isDragging.current) selectGroup(groupId)
        }, 120)
      } else if (elementNodes.length > 0) {
        const ids = elementNodes.map((n) => n.id)
        if (selectionGestureActive.current) {
          pendingSelectionIds.current = ids
          return
        }
        // If multiple nodes selected (shift+click or rubber-band), apply immediately — no delay
        if (ids.length > 1) {
          if (inspectorTimer.current) { clearTimeout(inspectorTimer.current); inspectorTimer.current = null }
          selectElementNodes(ids)
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
    [selectElements, selectRelationship, selectGroup, setNodes],
  )

  const onSelectionStart = useCallback(() => {
    selectionGestureActive.current = true
    pendingSelectionIds.current = null
    if (inspectorTimer.current) {
      clearTimeout(inspectorTimer.current)
      inspectorTimer.current = null
    }
  }, [])

  const onSelectionEnd = useCallback(() => {
    selectionGestureActive.current = false
    requestAnimationFrame(() => {
      const ids = reactFlowInstance.getNodes()
        .filter((node) => node.selected && !isOverlayNode(node))
        .map((node) => node.id)
      const finalIds = ids.length > 0 ? ids : pendingSelectionIds.current
      pendingSelectionIds.current = null
      if (finalIds && finalIds.length > 0) selectElements(finalIds)
    })
  }, [reactFlowInstance, selectElements])

  // Show minimap only while panning/zooming
  const [minimapVisible, setMinimapVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(null)

  const minimapStyle = useMemo<React.CSSProperties>(() => ({
    backgroundColor: 'var(--color-surface-1)',
    opacity: minimapMode === 'always' || minimapVisible ? 1 : 0,
    transition: 'opacity 300ms ease',
    pointerEvents: minimapMode === 'always' || minimapVisible ? 'auto' : 'none',
  }), [minimapMode, minimapVisible])

  // Fade the floating chrome only while the user actually *moves* the pane.
  // `paneDragging` is true the moment a pointer goes down on the pane (even for a
  // plain click), so we additionally require an onMove to fire — that excludes
  // clicks (no movement), and resizes/zoom/programmatic moves aren't pane-drags.
  const paneDragging = useStore((s) => s.paneDragging)
  const draggingRef = useRef(false)
  useEffect(() => {
    draggingRef.current = paneDragging
    if (!paneDragging) document.documentElement.removeAttribute('data-canvas-panning')
  }, [paneDragging])

  const onMove = useCallback(() => {
    if (draggingRef.current) document.documentElement.setAttribute('data-canvas-panning', '')
  }, [])

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

  // Safety: never leave the chrome faded if we unmount mid-drag.
  useEffect(() => () => document.documentElement.removeAttribute('data-canvas-panning'), [])

  const multiSelectModeRef = useRef(multiSelectMode)
  useEffect(() => { multiSelectModeRef.current = multiSelectMode }, [multiSelectMode])

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Let shift+click go through onSelectionChange (RF handles multi-select natively)
      if (event.shiftKey) return
      if (!multiSelectModeRef.current) return
      if (node.id.startsWith('group-') || node.id.startsWith('__scope_boundary__')) return
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
      if (node.id.startsWith('group-') || isScopeBoundaryNode(node)) return
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
    (_event: MouseEvent | TouchEvent, node: Node) => {
      let shouldRebuildOverlays = true
      const ctx = overlayDragRef.current
      if (ctx && node.id === ctx.nodeId) {
        // Persist every member at its final dragged position, then drop the
        // drag context. Reading positions from the live RF state guarantees
        // we capture whatever the last onNodeDrag wrote.
        const dx = node.position.x - ctx.nodeStart.x
        const dy = node.position.y - ctx.nodeStart.y
        const updates: { id: string; x: number; y: number }[] = []
        for (const [id, start] of ctx.memberStart) {
          if (!ctx.persistedMemberIds.has(id)) continue
          updates.push({ id, x: start.x + dx, y: start.y + dy })
        }
        if (updates.length > 0) updateNodePositions(updates)
        shouldRebuildOverlays = updates.length > 0
        overlayDragRef.current = null
      } else if (isScopeBoundaryNode(node)) {
        shouldRebuildOverlays = false
      } else {
        updateNodePosition(node.id, node.position.x, node.position.y)
      }
      // Rebuild overlays immediately so group and scope bounds do not disappear
      // for a frame between the drag stop and the store-driven refresh.
      const ws = workspaceRef.current
      const v = viewRef.current
      if (ws && shouldRebuildOverlays) {
        setNodes(prev => {
          return rebuildNodesWithOverlays(ws, v, prev)
        })
      }
      // Reset drag flag slightly after stop so any trailing onSelectionChange is still suppressed
      setTimeout(() => { isDragging.current = false }, 50)
    },
    [updateNodePosition, updateNodePositions, setNodes],
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
  const hasScopeBoundary = nodes.some(n => n.type === 'boundary')

  return (
    <div className="h-full w-full">
      {!hasContentNodes && !hasScopeBoundary && (
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
        onSelectionStart={onSelectionStart}
        onSelectionEnd={onSelectionEnd}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onMoveStart={onMoveStart}
        onMove={onMove}
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
      {canvasGuideOpen && <CanvasGuide onClose={closeCanvasGuide} />}
    </div>
  )
}
