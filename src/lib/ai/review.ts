import type { ReviewFinding, ReviewFixOption } from './types'

// Pure helpers for the structured Review result: the candidate-fix lookup and
// the actionable-finding check. Unit-tested.

/** The candidate fixes for a finding: its explicit `options`, or a single option
 *  synthesized from `operations` when the model didn't break out alternatives.
 *  The panel renders these; isActionable derives from the same source so the two
 *  can never disagree (rendering a fix the apply step would silently dismiss). */
export function findingOptions(f: ReviewFinding): ReviewFixOption[] {
  if (f.options?.length) return f.options
  return f.operations?.length ? [{ label: f.suggestion, operations: f.operations }] : []
}

/** True when a finding carries a concrete, applicable fix. */
export function isActionable(finding: ReviewFinding): boolean {
  return findingOptions(finding).some((o) => !!o.operations?.length)
}
