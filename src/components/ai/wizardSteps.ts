import type { Workspace } from '@/types/model'
import type { GapKind, MissingGap, ReviewFinding, ReviewSeverity } from '@/lib/ai'

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

// ─── Queue overview ─────────────────────────────────────────────────
//
// Pure logic for the wizard's all-steps screen (TEA-38): display state per
// step, filter chips per gap kind / finding severity, and the target sets for
// the bulk actions.

/** A step's recorded decision: applied, skipped, or dismissed (non-actionable). */
export type StepStatus = 'apply' | 'skip' | 'dismiss'

/** Display state of a queue step: the decision record resolved against the
 *  revert ledger's keys. An 'apply' decision without a ledger entry (the apply
 *  produced no operations) still reads as applied. */
export type QueueStepState = 'applied' | 'skipped' | 'pending'

export function stepState(step: Step, decisions: Record<string, StepStatus>, appliedKeys: ReadonlySet<string>): QueueStepState {
  if (appliedKeys.has(step.key)) return 'applied'
  const d = decisions[step.key]
  if (d === 'apply') return 'applied'
  return d ? 'skipped' : 'pending'
}

/** Queue filter: everything, one missing-info kind, or one finding severity.
 *  (GapKind and ReviewSeverity are disjoint string unions.) */
export type QueueFilter = 'all' | GapKind | ReviewSeverity

export function stepMatchesFilter(step: Step, filter: QueueFilter): boolean {
  if (filter === 'all') return true
  return step.type === 'fix' ? step.gap.kind === filter : step.finding.severity === filter
}

export interface QueueChip { id: QueueFilter; label: string; count: number }

const KIND_CHIPS: readonly (readonly [GapKind, string])[] = [['title', 'Titles'], ['desc', 'Descriptions'], ['tech', 'Tech'], ['rel', 'Links']]
const SEV_CHIPS: readonly (readonly [ReviewSeverity, string])[] = [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]

/** The filter chips for a queue: All + one per gap kind / finding severity
 *  present, each with its step count — the "14 steps: 8 descriptions, 3 tech,
 *  3 findings" readout the stepper alone can't give. */
export function queueFilterChips(queue: Step[]): QueueChip[] {
  const counts = new Map<QueueFilter, number>()
  for (const s of queue) {
    const k: QueueFilter = s.type === 'fix' ? s.gap.kind : s.finding.severity
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const chips: QueueChip[] = [{ id: 'all', label: 'All', count: queue.length }]
  for (const [id, label] of [...KIND_CHIPS, ...SEV_CHIPS]) {
    const count = counts.get(id)
    if (count) chips.push({ id, label, count })
  }
  return chips
}

/** The fix steps "Apply all suggested" would apply: pending, matching the
 *  filter, holding a non-empty draft, and not opted out. Findings are never
 *  included — they need judgment, so they keep the one-at-a-time stepper. */
export function bulkApplyTargets(
  queue: Step[], filter: QueueFilter,
  decisions: Record<string, StepStatus>, appliedKeys: ReadonlySet<string>,
  drafts: Record<string, string>, optOut: Record<string, boolean>,
): FixStep[] {
  return queue.filter((s): s is FixStep =>
    s.type === 'fix'
    && stepMatchesFilter(s, filter)
    && stepState(s, decisions, appliedKeys) === 'pending'
    && !!(drafts[s.key] ?? '').trim()
    && !optOut[s.key])
}

/** The steps "Skip shown" would skip: everything pending under the filter. */
export function bulkSkipTargets(
  queue: Step[], filter: QueueFilter,
  decisions: Record<string, StepStatus>, appliedKeys: ReadonlySet<string>,
): Step[] {
  return queue.filter((s) => stepMatchesFilter(s, filter) && stepState(s, decisions, appliedKeys) === 'pending')
}

/** First index at or after `from` whose step has no decision yet (queue.length
 *  when none remain) — the wizard's forward-advance rule. */
export function nextUndecidedIndex(queue: Step[], from: number, decisions: Record<string, StepStatus>): number {
  let i = Math.max(0, from)
  while (i < queue.length && decisions[queue[i].key]) i++
  return i
}
