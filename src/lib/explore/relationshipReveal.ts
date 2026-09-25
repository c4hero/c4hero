import type { Connection, MapNode } from './layout'
import { visibility } from './motion'

const key = (c: Connection, from = c.from, to = c.to) => JSON.stringify([
  from.id, to.id, c.relationship.description?.trim() ?? '',
  c.relationship.technology?.trim() ?? '', c.relationship.interactionStyle ?? 'Synchronous',
])

/** Only replace a summary with matching, directed relationships in its descendants. */
export function relationshipRefinements(connections: Connection[]) {
  const byEndpoints = new Map<string, Connection[]>()
  const refinements = new Map<string, Connection[]>()
  for (const c of connections) {
    const k = key(c)
    byEndpoints.set(k, [...(byEndpoints.get(k) ?? []), c])
  }
  for (const detail of connections) {
    for (let from: MapNode | undefined = detail.from; from; from = from.parent) {
      for (let to: MapNode | undefined = detail.to; to; to = to.parent) {
        if (from === detail.from && to === detail.to) continue
        for (const summary of byEndpoints.get(key(detail, from, to)) ?? []) {
          const id = summary.relationship.id
          refinements.set(id, [...(refinements.get(id) ?? []), detail])
        }
      }
    }
  }
  return refinements
}

export function relationshipOpacity(c: Connection, refinements: Map<string, Connection[]>, reveal: Map<string, number>, ready: (node: MapNode) => boolean = () => true) {
  const visible = (edge: Connection) => ready(edge.from) && ready(edge.to)
    ? Math.min(visibility(edge.from, reveal), visibility(edge.to, reveal)) : 0
  let replacement = 0
  for (const detail of refinements.get(c.relationship.id) ?? []) replacement = Math.max(replacement, visible(detail))
  return Math.max(0, visible(c) - replacement)
}
