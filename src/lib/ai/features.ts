import type { Workspace } from '@/types/model'
import type { AiProvider, DescribeResult, EditPlan } from './types'
import {
  generateSystem, generateUser, reviewSystem, reviewUser,
  describeSystem, describeUser, editSystem, editUser, adrSystem, adrUser,
} from './prompts'
import {
  elementsMissingDescription, relationshipsMissingDescription,
} from './context'
import { describeSchema, isDescribeResult, editSchema, isEditPlan } from './schema'
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

/** Review architecture → returns markdown critique. */
export async function reviewArchitecture(provider: AiProvider, ws: Workspace): Promise<string> {
  return provider.complete({
    system: reviewSystem(),
    user: reviewUser(ws),
    maxTokens: 4000,
  })
}

/** Auto-describe → returns validated descriptions for missing-description ids. */
export async function autoDescribe(provider: AiProvider, ws: Workspace): Promise<DescribeResult> {
  const missingEl = elementsMissingDescription(ws).map((e) => e.id)
  const missingRel = relationshipsMissingDescription(ws).map((r) => r.id)
  return provider.completeJson<DescribeResult>({
    system: describeSystem(),
    user: describeUser(ws, missingEl, missingRel),
    schema: describeSchema,
    validate: isDescribeResult,
    maxTokens: 4000,
  })
}

/** Natural-language edit → returns a validated operation plan. */
export async function planEdit(provider: AiProvider, ws: Workspace, instruction: string): Promise<EditPlan> {
  return provider.completeJson<EditPlan>({
    system: editSystem(),
    user: editUser(ws, instruction),
    schema: editSchema,
    validate: isEditPlan,
    maxTokens: 4000,
  })
}

/** Draft an ADR → returns markdown. `ws` may be null (decision without a model). */
export async function draftAdr(provider: AiProvider, ws: Workspace | null, topic: string): Promise<string> {
  return provider.complete({
    system: adrSystem(),
    user: adrUser(ws, topic),
    maxTokens: 4000,
  })
}
