import type { Workspace, View } from '@/types/model'
import type { AiProvider, DescribeResult, EditPlan, ReviewResult, RepoScanResult, RepoProposal, AiChatTurn } from './types'
import {
  generateSystem, generateUser, reviewSystem, reviewUser,
  describeSystem, describeUser, editSystem, editUser, adrSystem, adrUser,
  interviewSystem, interviewKickoff, interviewPlanSystem, interviewPlanUser,
  repoElementsSystem, repoElementsUser, repoConnectionsSystem, repoConnectionsUser,
} from './prompts'
import { isRecord } from '@/lib/guards'
import {
  elementsMissingDescription, relationshipsMissingDescription,
} from './context'
import {
  describeSchema, editSchema, reviewSchema, repoScanSchema, connectionsSchema,
  toDescribeResult, toEditPlan, toReviewResult, toRepoProposals, toScanQuestions,
} from './schema'
import { extractDsl } from './dsl'
import { mergeRepoProposals } from './repoScan'

// Feature orchestration. Each function takes a provider (injected, so tests use a
// fake) plus inputs, and returns parsed/validated results. No store access here —
// the UI layer applies results via the store and the operations/describe appliers.

/** Generate diagram → returns DSL text ready for parseDSL. */
export async function generateDiagram(provider: AiProvider, description: string): Promise<string> {
  const text = await provider.complete({
    system: generateSystem(),
    user: generateUser(description),
    maxTokens: 8000,
  })
  return extractDsl(text)
}

/** Review architecture → structured, triageable findings (each actionable one
 *  carries the operations that fix it). Pass `view` to scope the review to the
 *  current screen; omit/null to review the whole model. */
export async function reviewArchitecture(
  provider: AiProvider, ws: Workspace, view?: View | null,
): Promise<ReviewResult> {
  const raw = await provider.completeJson({
    system: reviewSystem(),
    user: reviewUser(ws, view),
    schema: reviewSchema,
    validate: isRecord,
    maxTokens: 6000,
  })
  return toReviewResult(raw)
}

/** Auto-describe → returns validated descriptions for missing-description ids. */
export async function autoDescribe(provider: AiProvider, ws: Workspace): Promise<DescribeResult> {
  const missingEl = elementsMissingDescription(ws).map((e) => e.id)
  const missingRel = relationshipsMissingDescription(ws).map((r) => r.id)
  const raw = await provider.completeJson({
    system: describeSystem(),
    user: describeUser(ws, missingEl, missingRel),
    schema: describeSchema,
    validate: isRecord,
    maxTokens: 4000,
  })
  return toDescribeResult(raw)
}

/** Suggest a few category tags for one element. When `vocabulary` is non-empty
 *  the result is constrained to it (keeps the user's taxonomy consistent);
 *  otherwise a few sensible new tags are proposed. Returns 0–5 tags. */
export async function suggestTags(
  provider: AiProvider,
  target: { name: string; type: string; description?: string; technology?: string },
  vocabulary: string[],
): Promise<string[]> {
  const vocabLine = vocabulary.length
    ? `Choose ONLY from this existing tag vocabulary — do not invent new tags: ${vocabulary.join(', ')}.`
    : 'There is no existing tag vocabulary, so propose up to 4 short, reusable category tags (e.g. "Database", "External", "Critical", "Gateway").'
  const raw = await provider.completeJson({
    system: 'You categorise software-architecture elements with short tags used for styling, grouping and filtering. Return only tags that genuinely apply; prefer fewer, high-signal tags over many.',
    user: `Element: ${target.name} (${target.type})${target.technology ? ` · tech: ${target.technology}` : ''}${target.description ? `\nDescription: ${target.description}` : ''}\n\n${vocabLine}\n\nReturn JSON: { "tags": string[] } with 0–4 tags that apply to this element.`,
    schema: { type: 'object', additionalProperties: false, properties: { tags: { type: 'array', items: { type: 'string' } } }, required: ['tags'] },
    validate: isRecord,
    // Reasoning models share this budget with their thinking tokens; a tight cap
    // would starve the (tiny) JSON output.
    maxTokens: 1500,
  })
  const list = isRecord(raw) && Array.isArray((raw as { tags?: unknown }).tags) ? (raw as { tags: unknown[] }).tags : []
  const cleaned = list.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean)
  if (vocabulary.length) {
    const byLower = new Map(vocabulary.map((v) => [v.toLowerCase(), v]))
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of cleaned) {
      const match = byLower.get(t.toLowerCase())
      if (match && !seen.has(match)) { seen.add(match); out.push(match) }
    }
    return out.slice(0, 5)
  }
  return [...new Set(cleaned)].slice(0, 4)
}

/** Natural-language edit → returns a validated operation plan. */
export async function planEdit(provider: AiProvider, ws: Workspace, instruction: string): Promise<EditPlan> {
  const raw = await provider.completeJson({
    system: editSystem(),
    user: editUser(ws, instruction),
    schema: editSchema,
    validate: isRecord,
    maxTokens: 4000,
  })
  return toEditPlan(raw)
}

/** Draft an ADR → returns markdown. `ws` may be null (decision without a model). */
export async function draftAdr(provider: AiProvider, ws: Workspace | null, topic: string): Promise<string> {
  return provider.complete({
    system: adrSystem(),
    user: adrUser(ws, topic),
    maxTokens: 4000,
  })
}

/** Interview: ask the next question given the prior turns. `history` is the full
 *  alternating message log; `userMessage` is the kickoff (first turn) or the
 *  user's latest answer. Returns the next question text. */
export async function interviewAsk(
  provider: AiProvider, ws: Workspace, view: View, history: AiChatTurn[], userMessage: string,
): Promise<string> {
  return provider.complete({
    system: interviewSystem(ws, view),
    history,
    user: userMessage,
    // The question itself is short, but the default models are reasoning models
    // that spend thinking tokens from this same budget — keep enough headroom
    // that the answer isn't starved (a 600 cap left interviews empty/truncated).
    maxTokens: 2500,
  })
}

/** Convenience for the very first question. */
export function interviewKickoffMessage(view: View): string {
  return interviewKickoff(view)
}

/** Turn the interview transcript into an EditPlan to update the model. */
export async function interviewBuildPlan(
  provider: AiProvider, ws: Workspace, view: View, history: AiChatTurn[],
): Promise<EditPlan> {
  const raw = await provider.completeJson({
    system: interviewPlanSystem(ws, view),
    history,
    user: interviewPlanUser(),
    schema: editSchema,
    validate: isRecord,
    maxTokens: 4000,
  })
  return toEditPlan(raw)
}

/** Analyze a repo snapshot in two phases — discover elements, then re-evaluate
 *  the connections between them — and surface questions for anything ambiguous.
 *
 *  Phase 1 runs several passes in parallel and merges their union (the model
 *  samples, so one pass is inconsistent; the snapshot is deterministic and Claude
 *  no longer accepts a temperature override, so merging is the remaining lever).
 *  Phase 2 reasons about connections over the full, fixed element list — which is
 *  far more accurate than inferring elements and links at once. */
export async function scanRepo(
  provider: AiProvider, ws: Workspace | null, bundle: string, passes = SCAN_PASSES,
): Promise<RepoScanResult> {
  // Phase 1 — elements only.
  const elementsPass = () => provider.completeJson({
    system: repoElementsSystem(ws),
    user: repoElementsUser(bundle),
    schema: repoScanSchema,
    validate: isRecord,
    maxTokens: 8000,
  }).then((r) => toRepoProposals(r.proposals))

  const settled = await Promise.allSettled(Array.from({ length: Math.max(1, passes) }, elementsPass))
  const ok = settled.filter((s): s is PromiseFulfilledResult<RepoProposal[]> => s.status === 'fulfilled')
  if (ok.length === 0) {
    // Every pass failed — surface the real error (auth, connection, …).
    throw (settled[0] as PromiseRejectedResult).reason
  }
  const elements = mergeRepoProposals(ok.flatMap((s) => s.value))

  // Phase 2 — connections + questions over the discovered elements.
  const conn = await provider.completeJson({
    system: repoConnectionsSystem(ws),
    user: repoConnectionsUser(bundle, listScanElements(elements)),
    schema: connectionsSchema,
    validate: isRecord,
    maxTokens: 6000,
  })

  return {
    proposals: [...elements, ...toRepoProposals(conn.relationships)],
    questions: toScanQuestions(conn.questions),
  }
}

/** How many parallel element passes a scan runs; their union is used. */
export const SCAN_PASSES = 3

/** A readable element list for the connections prompt. */
function listScanElements(proposals: RepoProposal[]): string {
  const lines: string[] = []
  for (const { op } of proposals) {
    if (op.op === 'addSoftwareSystem') lines.push(`- ${op.name}${op.external ? ' (external system)' : ' (software system)'}`)
    else if (op.op === 'addContainer') lines.push(`- ${op.name} (container in ${op.parent})`)
    else if (op.op === 'addComponent') lines.push(`- ${op.name} (component in ${op.parent})`)
    else if (op.op === 'addPerson') lines.push(`- ${op.name} (person)`)
  }
  return lines.join('\n')
}
