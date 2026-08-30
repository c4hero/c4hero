// Deployment-model helpers shared by the DSL layer, the store, and the canvas.
//
// Deployment elements (nodes, infrastructure nodes, instances) live in a tree
// under Model.deploymentEnvironments, separate from the C4 element tree. These
// helpers flatten that tree into indexable/renderable form.

import type {
    Model,
    DeploymentEnvironment,
    DeploymentNode,
    ElementInView,
    ModelElement,
    Container,
    SoftwareSystem,
    InfrastructureNode,
    Relationship,
} from '@/types/model'

/** Depth-first walk over an environment's deployment node tree. */
export function walkDeploymentNodes(env: DeploymentEnvironment, visit: (node: DeploymentNode) => void): void {
    const stack = [...env.deploymentNodes]
    while (stack.length > 0) {
        const node = stack.pop()!
        visit(node)
        stack.push(...node.children)
    }
}

/** Element IDs that belong to the scope system for deployment-view filtering:
 *  the system itself plus its containers. */
export function deploymentScopeIds(model: Model, softwareSystemId: string): Set<string> {
    const ids = new Set<string>([softwareSystemId])
    const sys = model.softwareSystems.find(s => s.id === softwareSystemId)
    if (sys) for (const c of sys.containers) ids.add(c.id)
    return ids
}

/** Every deployment element a deployment view of `environmentName` shows:
 *  all deployment nodes (plus their infrastructure nodes and instances). When
 *  `scopeSystemId` is given, only instances of that system (or its containers)
 *  are kept, nodes whose subtree contains no kept instance are dropped, and
 *  infrastructure nodes survive with their parent node. */
export function expandDeploymentElements(
    model: Model,
    environmentName: string | undefined,
    scopeSystemId?: string,
): ElementInView[] {
    const env = (model.deploymentEnvironments ?? []).find(e => e.name === environmentName)
    if (!env) return []

    const scopeIds = scopeSystemId ? deploymentScopeIds(model, scopeSystemId) : undefined

    const ids: string[] = []
    const addNode = (node: DeploymentNode): boolean => {
        const keptChildIds: string[] = []
        let hasKeptInstance = false

        for (const inst of node.containerInstances) {
            if (!scopeIds || scopeIds.has(inst.containerId)) {
                keptChildIds.push(inst.id)
                hasKeptInstance = true
            }
        }
        for (const inst of node.softwareSystemInstances) {
            if (!scopeIds || scopeIds.has(inst.softwareSystemId)) {
                keptChildIds.push(inst.id)
                hasKeptInstance = true
            }
        }

        let hasKeptDescendant = hasKeptInstance
        for (const child of node.children) {
            if (addNode(child)) hasKeptDescendant = true
        }

        // Unscoped views keep every node; scoped views keep only subtrees
        // that actually deploy something relevant.
        if (!scopeIds || hasKeptDescendant) {
            ids.push(node.id)
            for (const infra of node.infrastructureNodes) ids.push(infra.id)
            ids.push(...keptChildIds)
            return true
        }
        return false
    }

    for (const node of env.deploymentNodes) addNode(node)

    const seen = new Set<string>()
    return ids.filter(id => (seen.has(id) ? false : (seen.add(id), true))).map(id => ({ id }))
}

// ─── Canvas rendering helpers ────────────────────────────────────────

/** The environment whose deployment tree a deployment view renders. */
export function deploymentEnvironmentOf(model: Model, view: { environment?: string }): DeploymentEnvironment | undefined {
    return (model.deploymentEnvironments ?? []).find(e => e.name === view.environment)
}

/** The leaf (content) deployment element IDs directly hosted on a node —
 *  its container/software-system instances and infrastructure nodes. Child
 *  deployment nodes are excluded (they render as their own boundaries). */
export function directLeafIds(node: DeploymentNode): string[] {
    return [
        ...node.infrastructureNodes.map(n => n.id),
        ...node.containerInstances.map(i => i.id),
        ...node.softwareSystemInstances.map(i => i.id),
    ]
}

/** Every leaf (content) deployment element ID anywhere in a node's subtree,
 *  including nested child nodes. Used to size a node's boundary rectangle so
 *  parent nodes wrap all their descendants. */
export function descendantLeafIds(node: DeploymentNode): string[] {
    const ids: string[] = [...directLeafIds(node)]
    for (const child of node.children) ids.push(...descendantLeafIds(child))
    return ids
}

export interface DeploymentContentNode {
    /** The deployment element id — used as the canvas node id and view element id. */
    id: string
    /** Which React Flow node type renders this. */
    nodeType: 'container' | 'softwareSystem' | 'infrastructureNode'
    /** A synthetic display element for instances (referenced element cloned with
     *  the instance id) so the existing C4 node components render them unchanged.
     *  Infrastructure nodes carry their own data instead (see `infra`). */
    element?: ModelElement
    infra?: InfrastructureNode
}

/** Resolve every content deployment element (instance / infrastructure node) in
 *  an environment to a renderable form. Deployment nodes themselves are omitted
 *  — they render as boundaries, not content nodes. Instances resolve to a clone
 *  of their referenced container/system carrying the instance's own id, so the
 *  standard ContainerNode / SystemNode components render them without changes. */
export function buildDeploymentContentNodes(model: Model, env: DeploymentEnvironment): Map<string, DeploymentContentNode> {
    const containers = new Map<string, Container>()
    const systems = new Map<string, SoftwareSystem>()
    for (const sys of model.softwareSystems) {
        systems.set(sys.id, sys)
        for (const c of sys.containers) containers.set(c.id, c)
    }

    const out = new Map<string, DeploymentContentNode>()
    walkDeploymentNodes(env, (node) => {
        for (const infra of node.infrastructureNodes) {
            out.set(infra.id, { id: infra.id, nodeType: 'infrastructureNode', infra })
        }
        for (const inst of node.containerInstances) {
            const container = containers.get(inst.containerId)
            if (!container) continue
            out.set(inst.id, {
                id: inst.id,
                nodeType: 'container',
                element: { ...container, id: inst.id, tags: [...container.tags, ...inst.tags] },
            })
        }
        for (const inst of node.softwareSystemInstances) {
            const sys = systems.get(inst.softwareSystemId)
            if (!sys) continue
            out.set(inst.id, {
                id: inst.id,
                nodeType: 'softwareSystem',
                element: { ...sys, id: inst.id, tags: [...sys.tags, ...inst.tags] },
            })
        }
    })
    return out
}

export interface DeploymentBoundarySpec {
    /** The deployment node's own id. */
    id: string
    name: string
    /** Sublabel: technology, or an instances count like "×3". */
    typeLabel: string
    /** Tree depth: top-level deployment nodes are 0, their children 1, etc.
     *  Drives boundary nesting (z-order + padding + which node claims a leaf).
     *  Real tree depth is used rather than member-set subset because a
     *  single-child chain (e.g. AWS → us-east-1) leaves ancestor and child
     *  with identical member sets. */
    depth: number
    /** Content leaf node ids anywhere in this node's subtree. Boundary geometry
     *  is the union of these members' rects. */
    memberIds: string[]
}

/** One boundary spec per deployment node that has at least one visible leaf in
 *  the view, in depth-first order with tree depth recorded. */
export function buildDeploymentBoundarySpecs(
    env: DeploymentEnvironment,
    visibleLeafIds: Set<string>,
): DeploymentBoundarySpec[] {
    const specs: DeploymentBoundarySpec[] = []
    const visit = (node: DeploymentNode, depth: number) => {
        const memberIds = descendantLeafIds(node).filter(id => visibleLeafIds.has(id))
        if (memberIds.length > 0) {
            const instanceCount = node.instances && node.instances !== '1' ? node.instances : undefined
            const typeLabel = node.technology
                ? (instanceCount ? `${node.technology} · ×${instanceCount}` : node.technology)
                : (instanceCount ? `Deployment Node · ×${instanceCount}` : 'Deployment Node')
            specs.push({ id: node.id, name: node.name, typeLabel, depth, memberIds })
        }
        for (const child of node.children) visit(child, depth + 1)
    }
    for (const node of env.deploymentNodes) visit(node, 0)
    return specs
}

/** Instance-to-instance relationships implied by the model, derived on demand.
 *
 *  Mirrors Structurizr's implied instance relationships: if container A ->
 *  container B exists and both have instances in `environmentName`, each
 *  instance pair gets a derived relationship carrying the original's
 *  description/technology/style.
 *
 *  These are intentionally NOT materialized into `model.relationships`:
 *  they are a projection of the container/system relationship, so storing
 *  them would let users edit or delete copies that parse re-derives on the
 *  next load (silently reverting the edit), and it forces every serializer
 *  and view-population path to know which relationships are "real". The
 *  canvas asks for them when rendering a deployment view instead.
 *
 *  Ids embed the source relationship id plus both instance ids, so two model
 *  relationships between the same element pair derive distinct ids.
 *
 *  Instance pairs connected by an explicit model relationship (Structurizr
 *  allows `liveWeb -> liveDb` between instances) are skipped — the explicit
 *  relationship overrides the derived one. */
export function deriveInstanceRelationships(model: Model, environmentName?: string): Relationship[] {
    const derived: Relationship[] = []
    const explicitPairs = new Set(model.relationships.map(r => `${r.sourceId}→${r.destinationId}`))

    for (const env of model.deploymentEnvironments ?? []) {
        if (environmentName !== undefined && env.name !== environmentName) continue

        // Map: model element id -> instance ids within this environment
        const instancesByElement = new Map<string, string[]>()
        walkDeploymentNodes(env, node => {
            for (const inst of node.containerInstances) {
                const list = instancesByElement.get(inst.containerId) ?? []
                list.push(inst.id)
                instancesByElement.set(inst.containerId, list)
            }
            for (const inst of node.softwareSystemInstances) {
                const list = instancesByElement.get(inst.softwareSystemId) ?? []
                list.push(inst.id)
                instancesByElement.set(inst.softwareSystemId, list)
            }
        })
        if (instancesByElement.size === 0) continue

        for (const rel of model.relationships) {
            const sourceInstances = instancesByElement.get(rel.sourceId)
            const destInstances = instancesByElement.get(rel.destinationId)
            if (!sourceInstances || !destInstances) continue
            for (const src of sourceInstances) {
                for (const dst of destInstances) {
                    if (explicitPairs.has(`${src}→${dst}`)) continue
                    derived.push({
                        id: `rel-implied-${rel.id}-${src}-${dst}`,
                        sourceId: src,
                        destinationId: dst,
                        description: rel.description,
                        technology: rel.technology,
                        interactionStyle: rel.interactionStyle,
                        lineStyle: rel.lineStyle,
                        tags: [...rel.tags],
                        properties: {},
                    })
                }
            }
        }
    }
    return derived
}

/** Every relationship a deployment view draws: explicit model relationships
 *  whose endpoints are both visible in the view (instance-to-instance or
 *  infrastructure edges the user authored), plus the derived instance
 *  relationships for the view's environment. Single source for both the
 *  layout (dagre) edges and the rendered edges. */
export function deploymentViewRelationships(
    model: Model,
    view: { environment?: string; elements: { id: string }[] },
): Relationship[] {
    const viewIds = new Set(view.elements.map(e => e.id))
    const explicit = model.relationships.filter(
        r => viewIds.has(r.sourceId) && viewIds.has(r.destinationId),
    )
    const derived = deriveInstanceRelationships(model, view.environment).filter(
        r => viewIds.has(r.sourceId) && viewIds.has(r.destinationId),
    )
    return [...explicit, ...derived]
}
