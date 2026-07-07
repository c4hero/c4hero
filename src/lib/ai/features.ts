import type { Workspace, View } from '@/types/model'
import type { AiProvider, DescribeResult, EditPlan, ReviewResult, ReviewFinding, AiChatTurn } from './types'
import {
  generateSystem, generateUser, reviewSystem, reviewUser,
  describeSystem, describeUser, editSystem, editUser, adrSystem, adrUser,
  interviewSystem, interviewKickoff, interviewPlanSystem, interviewPlanUser,
  qaSystem, qaUser,
} from './prompts'
import { isRecord } from '@/lib/guards'
import type { GapKind } from './sweep'
import {
  elementsMissingDescription, relationshipsMissingDescription,
  viewScopeInternalIds, makeHumanizer,
  serializeContext, flattenElements, elementNameMap,
} from './context'
import {
  describeSchema, editSchema, reviewSchema,
  toDescribeResult, toEditPlan, toReviewResult, toReviewFinding,
} from './schema'
import { createArrayStreamParser } from './streamJson'
import { extractDsl } from './dsl'

// Feature orchestration. Each function takes a provider (injected, so tests use a
// fake) plus inputs, and returns parsed/validated results. No store access here —
// the UI layer applies results via the store and the operations/describe appliers.

/** Streaming generate: fires `onText` with each raw chunk (fences/preamble and
 *  all — the caller shows it as a live preview) and resolves with the extracted,
 *  parse-ready DSL. Falls back to a single non-streaming `complete` (one `onText`
 *  with the whole text) when the provider has no SSE support. Pass `signal` to
 *  cancel; the returned promise rejects with the fetch abort error. */
export async function generateDiagramStream(
  provider: AiProvider,
  description: string,
  onText: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const req = { system: generateSystem(), user: generateUser(description), maxTokens: 8000 }
  if (!provider.completeStream) {
    const text = await provider.complete(req)
    onText(text)
    return extractDsl(text)
  }
  const text = await provider.completeStream({ ...req, onText, signal })
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
  // Humanize ids in the prose, and (for a scoped review) drop boundary findings
  // that only complain about elements which are intentionally external to the
  // view's scope — another system's container shown as context is valid C4.
  const internal = view ? viewScopeInternalIds(ws, view) : new Set<string>()
  const humanize = makeHumanizer(ws) // compile the id→name map once for the whole review
  const findings = toReviewResult(raw).findings
    .map((f) => humanizeFinding(f, humanize))
    .filter((f) => !isExternalMisplacement(f, internal))
  return { findings }
}

/** Apply the id→name humanizer to a finding's prose fields (title, detail,
 *  suggestion, and each fix-option label). Shared by the bulk `reviewArchitecture`
 *  map and the per-finding streaming path so both humanize identically. */
function humanizeFinding(f: ReviewFinding, humanize: (s: string) => string): ReviewFinding {
  return {
    ...f,
    title: humanize(f.title),
    detail: humanize(f.detail),
    suggestion: humanize(f.suggestion),
    options: f.options?.map((o) => ({ ...o, label: humanize(o.label) })),
  }
}

/** A "boundary" finding whose every referenced element is external to the view's
 *  scope — i.e. it's objecting to an external context element merely being shown.
 *  That's intentional C4, so we suppress it. Never fires when the scope is empty
 *  (whole-model review or a landscape view with no boundary). */
function isExternalMisplacement(f: ReviewFinding, internalIds: Set<string>): boolean {
  return internalIds.size > 0
    && f.category === 'boundary'
    && f.elementIds.length > 0
    && f.elementIds.every((id) => !internalIds.has(id))
}

/** Humanize + scope-filter one raw finding, exactly as `reviewArchitecture` does
 *  in bulk — returns the finished finding, or null if it's malformed or a
 *  suppressed external-misplacement. */
function finishFinding(raw: unknown, humanize: (s: string) => string, internal: Set<string>): ReviewFinding | null {
  const f = toReviewFinding(raw)
  if (!f) return null
  const h = humanizeFinding(f, humanize)
  return isExternalMisplacement(h, internal) ? null : h
}

/** Streaming architecture review: fires `onFinding` for each finding the moment it
 *  finishes parsing out of the streamed JSON — already humanized and scope-filtered
 *  exactly like `reviewArchitecture` — and resolves with the full result. Lets the
 *  UI triage the first finding while the rest are still generating (a whole-model
 *  review runs 30–60s). Falls back to a single non-streaming `reviewArchitecture`
 *  (replaying its findings through `onFinding`) when the provider has no SSE. Pass
 *  `signal` to cancel. */
export async function reviewArchitectureStream(
  provider: AiProvider,
  ws: Workspace,
  view: View | null | undefined,
  onFinding: (finding: ReviewFinding) => void,
  signal?: AbortSignal,
): Promise<ReviewResult> {
  // Non-streaming providers: run the normal review, then replay its findings.
  if (!provider.completeStream) {
    const result = await reviewArchitecture(provider, ws, view)
    result.findings.forEach(onFinding)
    return result
  }

  const internal = view ? viewScopeInternalIds(ws, view) : new Set<string>()
  const humanize = makeHumanizer(ws)
  const collected: ReviewFinding[] = []
  const process = (raw: unknown): void => {
    const f = finishFinding(raw, humanize, internal)
    if (f) { collected.push(f); onFinding(f) }
  }

  // completeStream carries no JSON mode (unlike completeJson), so spell out the
  // envelope in the prompt; the tolerant parser lifts each finding from the
  // streamed text as it closes.
  const parse = createArrayStreamParser('findings')
  let acc = ''
  const text = await provider.completeStream({
    system: `${reviewSystem()}\n\nReturn ONLY a JSON object of the form {"findings": [ ... ]} that conforms to this JSON Schema — no prose, no code fence:\n${JSON.stringify(reviewSchema)}`,
    user: reviewUser(ws, view),
    maxTokens: 6000,
    onText: (delta) => { acc += delta; for (const raw of parse(acc)) process(raw) },
    signal,
  })
  // Safety net for any tail the incremental pass didn't consume.
  for (const raw of parse(text)) process(raw)
  return { findings: collected }
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

// ─── Single-field suggestion (the sweep's per-step "Rewrite") ───────

const FIELD_ASK: Record<GapKind, string> = {
  title: 'Suggest a short, specific name for this element.',
  desc: 'Write a short description (one phrase or sentence) of what this element does.',
  tech: 'Suggest a plausible technology (e.g. "React", "PostgreSQL", "Node.js/Express") for this element, inferred from its name, description and the rest of the model. Return only the technology, not a sentence.',
  rel: 'Write a short description of what this relationship represents (e.g. "Sends order confirmations to", "Reads customer records from").',
}

/** One line identifying the target of a single-field suggestion, or null when
 *  the id no longer resolves (deleted mid-sweep). */
function describeFieldTarget(ws: Workspace, kind: GapKind, targetId: string): string | null {
  if (kind === 'rel') {
    const r = ws.model.relationships.find((x) => x.id === targetId)
    if (!r) return null
    const names = elementNameMap(ws)
    return `Target relationship: ${names.get(r.sourceId) ?? r.sourceId} -> ${names.get(r.destinationId) ?? r.destinationId} (id ${r.id}).`
  }
  const el = flattenElements(ws).find((e) => e.id === targetId)
  if (!el) return null
  const part = el.parentName ? `, part of ${el.parentName}` : ''
  return `Target element: ${el.type} “${el.name}” (id ${el.id})${part}.`
}

/** Draft a value for ONE missing field — an element's name/description/
 *  technology or a relationship's description — grounded in the whole model.
 *  The guided sweep's per-step "Rewrite" uses this instead of re-running the
 *  whole-model autoDescribe/planEdit batches: same grounding, one tiny answer,
 *  a fraction of the tokens and latency. Pass `avoid` (the draft being
 *  re-rolled) to ask for a different take. Returns null when the target no
 *  longer exists or the model returns nothing usable. */
export async function suggestFieldValue(
  provider: AiProvider, ws: Workspace, kind: GapKind, targetId: string, avoid?: string,
): Promise<string | null> {
  const target = describeFieldTarget(ws, kind, targetId)
  if (!target) return null
  const avoidLine = avoid?.trim()
    ? `The user was shown “${avoid.trim()}” and asked for a different suggestion — do not repeat it.`
    : null
  const raw = await provider.completeJson({
    system: [
      'You fill in one missing field of a C4 architecture model, using the rest of the model as context.',
      'Be specific and free of filler. Return JSON: { "value": string } — the field value only, with no',
      'label, surrounding quotes, or explanation.',
    ].join('\n'),
    user: [
      serializeContext(ws),
      '',
      target,
      FIELD_ASK[kind],
      ...(avoidLine ? [avoidLine] : []),
      'Return JSON: { "value": string }.',
    ].join('\n'),
    schema: { type: 'object', additionalProperties: false, properties: { value: { type: 'string' } }, required: ['value'] },
    validate: isRecord,
    // Reasoning models share this budget with their thinking tokens; a tight cap
    // would starve the (tiny) JSON output.
    maxTokens: 1500,
    // Vary the answer when re-rolling a rejected draft (ignored by providers
    // that no longer support temperature).
    temperature: avoidLine ? 1 : undefined,
  })
  const v = isRecord(raw) && typeof (raw as { value?: unknown }).value === 'string' ? (raw as { value: string }).value.trim() : ''
  // Models sometimes wrap the value in quotes despite instructions.
  const unquoted = v.match(/^["'“](.*)["'”]$/s)
  const cleaned = (unquoted ? unquoted[1] : v).trim()
  return cleaned || null
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

/** Streaming Q&A: fires `onText` with each token and resolves with
 *  the full answer. `history` carries the prior chat turns so follow-ups ("tell
 *  me more about the second one") resolve against the conversation, not just the
 *  model snapshot in the current question. Falls back to a single non-streaming
 *  `complete` when the provider has no SSE. Pass `signal` to cancel. */
export async function answerQuestionStream(
  provider: AiProvider, ws: Workspace, view: View | null, question: string,
  history: AiChatTurn[], onText: (delta: string) => void, signal?: AbortSignal,
): Promise<string> {
  const req = { system: qaSystem(), history, user: qaUser(ws, view, question), maxTokens: 2000 }
  if (!provider.completeStream) {
    const text = await provider.complete(req)
    onText(text)
    return text
  }
  return provider.completeStream({ ...req, onText, signal })
}

/** Streaming interview ask: fires `onText` with each token as it arrives and
 *  resolves with the full question. Falls back to a single non-streaming
 *  `complete` (one `onText` with the whole text) when the provider has no SSE
 *  support. Pass `signal` to cancel. */
export async function interviewAskStream(
  provider: AiProvider, ws: Workspace, view: View, history: AiChatTurn[], userMessage: string,
  onText: (delta: string) => void, signal?: AbortSignal,
): Promise<string> {
  const req = { system: interviewSystem(ws, view), history, user: userMessage, maxTokens: 2500, cacheSystem: true }
  if (!provider.completeStream) {
    const text = await provider.complete(req)
    onText(text)
    return text
  }
  return provider.completeStream({ ...req, onText, signal })
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
    // Large system (full model + view context) built from the same ws/view the
    // interview turns already cached — reuse the cached prefix.
    cacheSystem: true,
  })
  return toEditPlan(raw)
}

