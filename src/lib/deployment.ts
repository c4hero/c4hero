// Deployment-model helpers shared by the DSL layer and (later) the canvas.
//
// Deployment elements (nodes, infrastructure nodes, instances) live in a tree
// under Model.deploymentEnvironments, separate from the C4 element tree.

import type {
    Model,
    DeploymentEnvironment,
    DeploymentNode,
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
