import type { Workspace, Relationship } from '@/types/model'

/** Compute implied relationships from the element hierarchy.
 *  If a component in System A talks to a component in System B,
 *  there's an implied container→container and system→system relationship. */
export function computeImpliedRelationships(workspace: Workspace): Relationship[] {
  const implied: Relationship[] = []
  const existingPairs = new Set(
    workspace.model.relationships.map(r => `${r.sourceId}→${r.destinationId}`)
  )

  // Build parent maps: element → parent container/system
  const containerOf = new Map<string, string>() // componentId → containerId
  const systemOf = new Map<string, string>()    // containerId/componentId → systemId

  for (const sys of workspace.model.softwareSystems) {
    for (const c of sys.containers) {
      systemOf.set(c.id, sys.id)
      for (const comp of c.components) {
        containerOf.set(comp.id, c.id)
        systemOf.set(comp.id, sys.id)
      }
    }
  }

  let impliedId = 0

  for (const rel of workspace.model.relationships) {
    const srcSystem = systemOf.get(rel.sourceId)
    const dstSystem = systemOf.get(rel.destinationId)
    const srcContainer = containerOf.get(rel.sourceId)
    const dstContainer = containerOf.get(rel.destinationId)

    // Implied container→container (from component→component across containers)
    if (srcContainer && dstContainer && srcContainer !== dstContainer) {
      const pair = `${srcContainer}→${dstContainer}`
      if (!existingPairs.has(pair)) {
        existingPairs.add(pair)
        implied.push({
          id: `implied-${impliedId++}`,
          sourceId: srcContainer,
          destinationId: dstContainer,
          description: rel.description ? `[implied] ${rel.description}` : '[implied]',
          technology: rel.technology,
          tags: ['Relationship', 'Implied'],
          properties: {},
        })
      }
    }

    // Implied system→system (from any child across systems)
    if (srcSystem && dstSystem && srcSystem !== dstSystem) {
      const pair = `${srcSystem}→${dstSystem}`
      if (!existingPairs.has(pair)) {
        existingPairs.add(pair)
        implied.push({
          id: `implied-${impliedId++}`,
          sourceId: srcSystem,
          destinationId: dstSystem,
          description: rel.description ? `[implied] ${rel.description}` : '[implied]',
          technology: rel.technology,
          tags: ['Relationship', 'Implied'],
          properties: {},
        })
      }
    }
  }

  return implied
}
