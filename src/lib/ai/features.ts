import type { Workspace, View } from '@/types/model'
import type { AiProvider, DescribeResult, EditPlan, ReviewResult, RepoScanResult, AiChatTurn } from './types'
import {
  generateSystem, generateUser, reviewSystem, reviewUser,
  describeSystem, describeUser, editSystem, editUser, adrSystem, adrUser,
  interviewSystem, interviewKickoff, interviewPlanSystem, interviewPlanUser,
  repoScanSystem, repoScanUser,
} from './prompts'
import { isRecord } from '@/lib/guards'
import {
  elementsMissingDescription, relationshipsMissingDescription,
} from './context'
import {
  describeSchema, editSchema, reviewSchema, repoScanSchema,
  toDescribeResult, toEditPlan, toReviewResult, toRepoScanResult,
} from './schema'
import { extractDsl } from './dsl'

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
    maxTokens: 600,
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

/** Analyze a repo snapshot and propose model updates with provenance. */
export async function scanRepo(provider: AiProvider, ws: Workspace | null, bundle: string): Promise<RepoScanResult> {
  const raw = await provider.completeJson({
    system: repoScanSystem(ws),
    user: repoScanUser(bundle),
    schema: repoScanSchema,
    validate: isRecord,
    maxTokens: 8000,
  })
  return toRepoScanResult(raw)
}
