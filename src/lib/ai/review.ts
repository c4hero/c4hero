import type { AdrSeed, ReviewFinding, ReviewFixOption } from './types'

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

/** Turn an advisory finding into the drafter's starting point (TEA-43).
 *
 *  The topic is the finding's own title — that is what the user saw and chose
 *  to act on, so it is what the topic field should say. Everything else the
 *  review knew goes into `background`, where the prompt frames it as the
 *  problem to decide on rather than as a settled conclusion: a finding is an
 *  observation, and an ADR that treats it as a verdict has skipped the
 *  decision it was supposed to record.
 *
 *  `key` identifies this hand-off: the caller passes the worklist row's key
 *  (unique across scopes and re-runs) plus a per-click marker, so re-entering
 *  the tab doesn't re-draft but clicking the row again does. */
export function adrSeedFromFinding(key: string, f: ReviewFinding): AdrSeed {
  const lines = [`A review of the architecture model raised this: **${f.title}**`, '', f.detail]
  if (f.suggestion?.trim()) lines.push('', `What the review suggested: ${f.suggestion.trim()}`)
  if (f.elementIds.length > 0) lines.push('', `Elements involved: ${f.elementIds.join(', ')}`)
  // The ids the review rested on, in the prose too — `citations` alone never
  // reaches the model, and a decision that ignores the document that raised it
  // is the one thing an ADR must not do.
  if (f.citations?.length) lines.push('', `Documents the review pointed at: ${f.citations.join(', ')}`)
  lines.push('', `Category: ${f.category}. Severity: ${f.severity}.`)
  return {
    sourceKey: key,
    topic: f.title,
    background: lines.join('\n'),
    citations: f.citations?.length ? [...f.citations] : undefined,
  }
}
