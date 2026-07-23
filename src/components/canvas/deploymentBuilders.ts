import type { Node } from '@xyflow/react'
import type { View, Workspace } from '@/types/model'
import {
  deploymentEnvironmentOf,
  buildDeploymentContentNodes,
  buildDeploymentBoundarySpecs,
} from '@/lib/deployment'
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
 *  infrastructure nodes. Deployment nodes themselves are drawn as boundaries. */
export function buildDeploymentNodes(workspace: Workspace, view: View): Node[] {
  const env = deploymentEnvironmentOf(workspace.model, view)
  if (!env) return []
  const content = buildDeploymentContentNodes(workspace.model, env)

  const nodes: Node[] = []
  for (const viewEl of view.elements) {
    const spec = content.get(viewEl.id)
    if (!spec) continue // deployment-node ids resolve to boundaries, not content
    const pos = { x: viewEl.x ?? 0, y: viewEl.y ?? 0 }
    if (spec.nodeType === 'infrastructureNode' && spec.infra) {
      nodes.push({ id: spec.id, type: 'infrastructureNode', position: pos, data: { infra: spec.infra } })
    } else if (spec.element) {
      nodes.push({
        id: spec.id,
        type: spec.nodeType,
        position: pos,
        data: { element: spec.element, canDrill: false, viewCount: 1 },
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

  const boundaries: Node[] = []
  for (const spec of specs) {
    const members = spec.memberIds.map(id => nodeMap.get(id)).filter((r): r is OverlayRect => r !== undefined)
    if (members.length === 0) continue
    const depth = spec.depth
    const pad = BOUNDARY_PADDING + depth * NESTING_PADDING_STEP
    const padTop = BOUNDARY_PADDING_TOP + depth * NESTING_PADDING_STEP
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
