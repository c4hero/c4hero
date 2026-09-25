import { useCallback, useLayoutEffect, useMemo, useReducer, useRef, useState, type RefObject } from 'react'
import type { Edge, Node, NodeChange, ReactFlowInstance } from '@xyflow/react'
import type { ElementStyle, View, Workspace } from '@/types/model'
import type { HighlightFilters } from '@/lib/highlight'
import { registerActiveCamera } from '@/lib/activeCamera'
import { buildLayout, connectionsFor, type Box, type MapNode } from '@/lib/explore/layout'
import { relationshipRefinements, relationshipOpacity } from '@/lib/explore/relationshipReveal'
import { visibility } from '@/lib/explore/motion'
import { SemanticCamera } from '@/lib/explore/semanticCamera'
import { useWorkspaceStore } from '@/store/workspace'
import { buildNodes, buildEdges, buildDrillableSet } from './canvasBuilders'

export function useSemanticZoom(
  enabled: boolean, host: RefObject<HTMLDivElement | null>, rf: ReactFlowInstance,
  workspace: Workspace | null, view: View | undefined, nodes: Node[], edges: Edge[],
  filters: HighlightFilters, theme: ElementStyle[], viewCounts: Map<string, number>,
) {
  const [, repaint] = useReducer(n => n + 1, 0)
  const measurements = useRef(new Map<string, { width: number; height: number; headerHeight?: number }>())
  const [intrinsic, setIntrinsic] = useState(new Map<string, { width: number; height: number; headerHeight?: number }>())
  const reportSize = useCallback((id: string, size: { width: number; height: number; headerHeight?: number }) => {
    setIntrinsic(previous => {
      const old = previous.get(id)
      return size.width > 0 && size.height > 0 && (!old || old.width !== size.width || old.height !== size.height || old.headerHeight !== size.headerHeight)
        ? new Map(previous).set(id, size) : previous
    })
  }, [])
  const controller = useRef<SemanticCamera | null>(null)
  const layout = useMemo(() => {
    if (!enabled || !workspace || !view) return null
    const boxes = new Map<string, Box>(nodes.filter(n => n.data.element).map(n => [n.id, {
      ...n.position, width: n.measured?.width ?? 280, height: n.measured?.height ?? 120,
    }]))
    return buildLayout(workspace, view, boxes, true, intrinsic)
  }, [enabled, workspace, view, nodes, intrinsic])

  useLayoutEffect(() => {
    if (!enabled || !host.current || !layout) return
    measurements.current.clear()
    const camera = new SemanticCamera(host.current, rf, layout, repaint)
    controller.current = camera
    const unregister = registerActiveCamera(camera)
    repaint()
    return () => { unregister(); camera.dispose(); controller.current = null }
    // Keep one camera throughout a view; model edits update its layout below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, view?.key, rf, host])

  useLayoutEffect(() => {
    if (layout) controller.current?.update(layout)
  }, [layout])

  const descendants = useMemo(() => {
    if (!layout || !workspace || !view) return []
    const nested = layout.nodes.filter(n => n.parent)
    const nestedView: View = { ...view, elements: nested.map(n => ({ id: n.id, x: n.x, y: n.y, ...view.exploreLayout?.elements?.[n.id] })) }
    return buildNodes(workspace, nestedView, id => useWorkspaceStore.getState().zoomInto(id), filters, viewCounts, buildDrillableSet(workspace), theme)
  }, [layout, workspace, view, filters, theme, viewCounts])

  const connections = useMemo(() => layout && workspace && view ? connectionsFor(layout, workspace.model.relationships, view).connections : [], [layout, workspace, view])
  const refinements = useMemo(() => relationshipRefinements(connections), [connections])
  const camera = controller.current
  let renderedNodes = nodes, renderedEdges = edges
  if (enabled && layout && workspace && view) {
    const reveal = camera?.reveal ?? new Map<string, number>()
    const annotate = (node: Node): Node => {
      const n = layout.byId.get(node.id)
      if (!n) return node.data.element ? { ...node, hidden: true } : node
      const alpha = visibility(n, reveal), amount = reveal.get(n.id) ?? 0
      return { ...node,
        ...(n.parent ? { measured: measurements.current.get(n.id) ?? { width: n.width, height: n.height }, position: { x: n.x, y: n.y }, hidden: alpha < .002, zIndex: 10 + 2 * depth(n),
          selected: useWorkspaceStore.getState().selectedElementIds.includes(n.id),
          style: { ...node.style, width: n.width, height: n.height, opacity: intrinsic.has(n.id) ? alpha : 0, pointerEvents: alpha > .5 ? undefined : 'none' }, selectable: alpha > .5, draggable: node.draggable !== false && alpha > .5 && !view.exploreLayout?.locked && !view.exploreLayout?.elements?.[n.id]?.locked,
        } : {}),
        data: { ...node.data, semantic: { scale: n.scale, width: n.width / n.scale, height: n.height / n.scale, reveal: amount, expandable: n.children.length > 0, nested: !!n.parent, onMeasure: reportSize } },
      }
    }
    renderedNodes = [...nodes.map(annotate), ...descendants.map(annotate)]
    const byId = new Map(connections.map(c => [c.relationship.id, c]))
    const opacity = (id: string) => {
      const c = byId.get(id)
      return c ? relationshipOpacity(c, refinements, reveal, n => !n.parent || intrinsic.has(n.id)) : 1
    }
    const nestedConnections = connections.filter(c => c.from.parent || c.to.parent)
    const nestedView: View = { ...view, elements: layout.nodes.map(n => ({ id: n.id })), relationships: nestedConnections.map(c => ({ id: c.relationship.id })) }
    const nestedEdges = buildEdges(workspace, nestedView, renderedNodes, filters).map(edge => {
      const from = layout.byId.get(edge.source)!, to = layout.byId.get(edge.target)!
      const alpha = opacity(edge.id)
      // Each edge sits above its enclosing cards and below its endpoints.
      const zIndex = 9 + 2 * Math.max(depth(from), depth(to))
      const selected = useWorkspaceStore.getState().selectedRelationshipId === edge.id
      return { ...edge, selected, zIndex, hidden: alpha < .002, reconnectable: edge.reconnectable !== false && selected,
        data: { ...edge.data, sourceScale: from.scale, targetScale: to.scale, semanticAlpha: alpha, semanticZIndex: zIndex },
      }
    })
    renderedEdges = [...edges.map(edge => {
      const alpha = opacity(edge.id)
      return { ...edge, hidden: edge.hidden || alpha < .002,
        data: { ...edge.data, semanticAlpha: alpha },
      }
    }), ...nestedEdges.filter(e => !edges.some(root => root.id === e.id))]
  }
  return {
    nodes: renderedNodes, edges: renderedEdges, controller,
    handleChanges(changes: NodeChange[]) {
      for (const change of changes) {
        if (change.type === 'position' && change.position) camera?.drag(change.id, change.position)
        if (change.type === 'dimensions' && change.dimensions && layout?.byId.get(change.id)?.parent) {
          const old = measurements.current.get(change.id)
          if (!old || old.width !== change.dimensions.width || old.height !== change.dimensions.height) { measurements.current.set(change.id, change.dimensions); repaint() }
        }
      }
      return changes.filter(change => !('id' in change) || nodes.some(n => n.id === change.id))
    },
  }
}

function depth(node: MapNode): number {
  let result = 0
  for (let p: MapNode | undefined = node; p?.parent; p = p.parent) result++
  return result
}
