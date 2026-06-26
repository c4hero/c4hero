import type { Workspace } from '@/types/model'
import { flattenElements } from './context'
import { countMissingDescriptions } from './describe'

// Instant, deterministic model-quality checks — no AI call. Surfaced as an
// at-a-glance "model health" readout; each gap routes to the tool that fixes it.

export type ModelGapId = 'descriptions' | 'unconnected' | 'technology' | 'emptySystems'

export interface ModelGap {
  id: ModelGapId
  count: number
  label: string
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Compute the non-empty model gaps, in priority order. */
export function modelHealth(ws: Workspace): ModelGap[] {
  const els = flattenElements(ws)
  const rels = ws.model.relationships ?? []

  // Elements that participate in at least one relationship, and elements that
  // have children (a parent system/container is "represented" by its children).
  const connected = new Set<string>()
  for (const r of rels) { connected.add(r.sourceId); connected.add(r.destinationId) }
  const hasChildren = new Set<string>()
  for (const sys of ws.model.softwareSystems) {
    if (sys.containers.length) hasChildren.add(sys.id)
    for (const c of sys.containers) if (c.components.length) hasChildren.add(c.id)
  }

  const descriptions = countMissingDescriptions(ws)
  const unconnected = els.filter((e) => !connected.has(e.id) && !hasChildren.has(e.id)).length

  let technology = 0
  for (const sys of ws.model.softwareSystems) {
    for (const c of sys.containers) {
      if (!c.technology?.trim()) technology++
      for (const cmp of c.components) if (!cmp.technology?.trim()) technology++
    }
  }

  const emptySystems = ws.model.softwareSystems.filter((s) => s.location !== 'External' && s.containers.length === 0).length

  const gaps: ModelGap[] = [
    { id: 'descriptions', count: descriptions, label: plural(descriptions, 'item missing a description', 'items missing a description') },
    { id: 'unconnected', count: unconnected, label: plural(unconnected, 'unconnected element', 'unconnected elements') },
    { id: 'technology', count: technology, label: plural(technology, 'element missing a technology', 'elements missing a technology') },
    { id: 'emptySystems', count: emptySystems, label: plural(emptySystems, 'system with no containers', 'systems with no containers') },
  ]
  return gaps.filter((g) => g.count > 0)
}
