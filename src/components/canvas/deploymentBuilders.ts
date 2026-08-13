import type { Node } from '@xyflow/react'
import type { ElementStyle, ModelElement, View, Workspace } from '@/types/model'
import { isHighlighted, highlightActive, type HighlightFilters } from '@/lib/highlight'
import { stripThemeManagedStyleFields } from '@/lib/themes'
import {
  deploymentEnvironmentOf,
  buildDeploymentContentNodes,
  buildDeploymentBoundarySpecs,
} from '@/lib/deployment'
import { buildStyleIndex, getElementStyle } from './canvasBuilders'
import type { LayoutBoundaryCluster } from '@/lib/canvasLayout'

const BOUNDARY_Z = -100
const BOUNDARY_PADDING = 32
const BOUNDARY_PADDING_TOP = 64
// Each nesting level tightens the wrap so a parent node's box clears its
// children's boxes rather than overlapping their labels.
const NESTING_PADDING_STEP = 20
const EMPTY_BOUNDARY_W = 360
const EMPTY_BOUNDARY_H = 180

type OverlayRect = { x: number; y: number; w: number; h: number }

function nodeRect(node: Node): OverlayRect {
  return {
    x: node.position.x,
    y: node.position.y,
    w: node.measured?.width ?? (Number(node.style?.width) || 200),
    h: node.measured?.height ?? (Number(node.style?.height) || 100),
  }
}

/** Content nodes for a deployment view — container/system instances and
 *  infrastructure nodes. Deployment nodes themselves are drawn as boundaries.
 *
 *  Takes the same styling inputs as buildNodes: instances render through the
 *  regular C4 node components, so they get the full tag-style cascade and
 *  highlight-filter treatment — without this, an active filter fades every
 *  deployment edge (buildEdges sees no highlighted node) while the nodes
 *  ignore the filter entirely. */
export function buildDeploymentNodes(
  workspace: Workspace,
  view: View,
  filters: HighlightFilters,
  themeStyles: ElementStyle[],
): Node[] {
  const env = deploymentEnvironmentOf(workspace.model, view)
  if (!env) return []
  const content = buildDeploymentContentNodes(workspace.model, env)

  const workspaceStyles = workspace.views.configuration.styles.elements
    .map(stripThemeManagedStyleFields)
    .filter((style): style is ElementStyle => style !== null)
  const styleIndex = buildStyleIndex([...themeStyles, ...workspaceStyles])
  const active = highlightActive(filters)
  const highlightClass = (highlighted: boolean) =>
    active ? (highlighted ? 'c4-node-highlighted' : 'c4-node-faded') : undefined

  const nodes: Node[] = []
  for (const viewEl of view.elements) {
    const spec = content.get(viewEl.id)
    if (!spec) continue // deployment-node ids resolve to boundaries, not content
    const pos = { x: viewEl.x ?? 0, y: viewEl.y ?? 0 }
    if (spec.nodeType === 'infrastructureNode' && spec.infra) {
      // Infrastructure nodes carry tags/technology, which is all the
      // element-facing filter facets read; status/team simply won't match.
      const highlighted = active && isHighlighted(spec.infra as unknown as ModelElement, filters)
      nodes.push({
        id: spec.id,
        type: 'infrastructureNode',
        position: pos,
        data: { infra: spec.infra, highlighted },
        className: highlightClass(highlighted),
      })
    } else if (spec.element) {
      const style = getElementStyle(spec.element, styleIndex)
      const highlighted = active && isHighlighted(spec.element, filters)
      nodes.push({
        id: spec.id,
        type: spec.nodeType,
        position: pos,
        data: { element: spec.element, style, canDrill: false, viewCount: 1, highlighted },
        className: highlightClass(highlighted),
      })
    }
  }
  return nodes
}

/** Dagre clusters for a deployment view: one per innermost deployment node,
 *  grouping the leaves it directly hosts so instances of the same node cluster
 *  together. Parent nodes' boxes are derived post-layout from member unions. */
export function buildDeploymentLayoutClusters(workspace: Workspace, view: View): LayoutBoundaryCluster[] {
  const env = deploymentEnvironmentOf(workspace.model, view)
  if (!env) return []
  const viewIds = new Set(view.elements.map(e => e.id))
  const specs = buildDeploymentBoundarySpecs(env, viewIds)
  // Assign each leaf to the deepest node that hosts it, so it clusters with its
  // innermost tier rather than an ancestor. Deepest depth claims first.
  const ordered = [...specs].sort((a, b) => b.depth - a.depth)
  const claimed = new Set<string>()
  const clusters: LayoutBoundaryCluster[] = []
  for (const spec of ordered) {
    const elementIds = spec.memberIds.filter(id => viewIds.has(id) && !claimed.has(id))
    if (elementIds.length === 0) continue
    for (const id of elementIds) claimed.add(id)
    clusters.push({ id: spec.id, elementIds })
  }
  return clusters
}

/** Nested boundary overlay nodes for the deployment view's deployment-node
 *  tree, sized from post-layout leaf positions. */
export function buildDeploymentBoundaryNodes(workspace: Workspace, view: View, laidOutNodes: Node[]): Node[] {
  const env = deploymentEnvironmentOf(workspace.model, view)
  if (!env) return []

  const nodeMap = new Map<string, OverlayRect>()
  for (const n of laidOutNodes) {
    if (n.type !== 'boundary' && n.type !== 'group') nodeMap.set(n.id, nodeRect(n))
  }

  const presentLeafIds = new Set(nodeMap.keys())
  const specs = buildDeploymentBoundarySpecs(env, presentLeafIds)
  const maxDepth = specs.reduce((d, s) => Math.max(d, s.depth), 0)

  const boundaries: Node[] = []
  for (const spec of specs) {
    const members = spec.memberIds.map(id => nodeMap.get(id)).filter((r): r is OverlayRect => r !== undefined)
    if (members.length === 0) continue
    const depth = spec.depth
    // Padding SHRINKS with depth: an ancestor's box must wrap its children's
    // boxes, and in a single-child chain (AWS → us-east-1) both wrap the very
    // same member rects — only a larger outer padding separates them.
    const pad = BOUNDARY_PADDING + (maxDepth - depth) * NESTING_PADDING_STEP
    const padTop = BOUNDARY_PADDING_TOP + (maxDepth - depth) * NESTING_PADDING_STEP
    const minX = Math.min(...members.map(m => m.x))
    const minY = Math.min(...members.map(m => m.y))
    const maxX = Math.max(...members.map(m => m.x + m.w))
    const maxY = Math.max(...members.map(m => m.y + m.h))
    const width = (maxX - minX) + pad * 2
    const height = (maxY - minY) + padTop + pad
    boundaries.push({
      id: `__scope_boundary__${spec.id}`,
      type: 'boundary',
      position: { x: minX - pad, y: minY - padTop },
      measured: { width, height },
      style: { width, height, pointerEvents: 'none' },
      data: { name: spec.name, typeLabel: spec.typeLabel },
      // Deeper (more nested) boundaries sit above their ancestors so their
      // labels aren't covered.
      zIndex: BOUNDARY_Z + depth,
      selectable: false,
      draggable: true,
      focusable: false,
    })
  }

  // An environment with deployment nodes but nothing laid out yet (still
  // measuring) gets a single labelled placeholder so the view isn't blank.
  if (boundaries.length === 0 && env.deploymentNodes.length > 0) {
    const first = env.deploymentNodes[0]
    boundaries.push({
      id: `__scope_boundary__${first.id}`,
      type: 'boundary',
      position: { x: 0, y: 0 },
      measured: { width: EMPTY_BOUNDARY_W, height: EMPTY_BOUNDARY_H },
      style: { width: EMPTY_BOUNDARY_W, height: EMPTY_BOUNDARY_H, pointerEvents: 'none' },
      data: { name: first.name, typeLabel: first.technology ?? 'Deployment Node', empty: true },
      zIndex: BOUNDARY_Z,
      selectable: false,
      draggable: false,
      focusable: false,
    })
  }

  return boundaries
}

/** Descendant leaf ids of a deployment node — the members an overlay drag on
 *  its boundary should translate. */
export function deploymentBoundaryMemberIds(workspace: Workspace, view: View, deploymentNodeId: string): Set<string> {
  const env = deploymentEnvironmentOf(workspace.model, view)
  if (!env) return new Set()
  const viewIds = new Set(view.elements.map(e => e.id))
  const spec = buildDeploymentBoundarySpecs(env, viewIds).find(s => s.id === deploymentNodeId)
  return new Set(spec?.memberIds ?? [])
}
