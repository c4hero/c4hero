import type { Workspace } from '@/types/model'
import type { MissingGap, ReviewFinding } from '@/lib/ai'

// The "Improve my model" wizard's queue is either an instant local fix (a gap
// from missingInfoGaps) or an AI review finding. Kept out of AiPanel.tsx
// (a component file) so these can be exported as plain functions without
// tripping the react-refresh/only-export-components lint rule.

export interface FixStep { type: 'fix'; key: string; cat: 'missing'; gap: MissingGap }
export interface FindingStep { type: 'finding'; key: string; cat: 'review'; finding: ReviewFinding }
export type Step = FixStep | FindingStep

// The element id(s) a step refers to, for revealing them on the canvas. A
// relationship gap resolves to its two endpoints. A review finding's
// elementIds come straight from the model's response — the review prompt is
// ambiguous about relationship-focused findings, so the model sometimes
// echoes the relationship's OWN id there instead of its two endpoints. That
// id never appears in any view's element list, so reveal would silently find
// nothing; resolve it to its endpoints the same way a 'rel' gap does.
export function stepElementIds(step: Step, ws: Workspace): string[] {
  if (step.type === 'finding') {
    return (step.finding.elementIds ?? []).flatMap((id) => {
      const rel = ws.model.relationships.find((r) => r.id === id)
      return rel ? [rel.sourceId, rel.destinationId] : [id]
    })
  }
  const g = step.gap
  if (g.kind === 'rel') {
    const r = ws.model.relationships.find((x) => x.id === g.targetId)
    return r ? [r.sourceId, r.destinationId] : []
  }
  return [g.targetId]
}

// The relationship a step points at (if any), so reveal can frame the edge
// itself, not just one endpoint. A finding may reference a relationship
// directly by id, same ambiguity as stepElementIds above.
export function stepRelationshipId(step: Step, ws: Workspace): string | null {
  if (step.type === 'fix') return step.gap.kind === 'rel' ? step.gap.targetId : null
  const relId = (step.finding.elementIds ?? []).find((id) => ws.model.relationships.some((r) => r.id === id))
  return relId ?? null
}
