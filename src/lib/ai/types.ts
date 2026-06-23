/** The five BYOK AI features, used as panel tab ids. */
export type AiFeatureId = 'generate' | 'edit' | 'describe' | 'review' | 'adr'

// ─── Provider abstraction ───────────────────────────────────────────
//
// Features talk to an AiProvider, never to the SDK directly. This keeps the
// network/SDK layer out of the testable feature logic and leaves room for a
// future OpenAI-compatible provider without touching feature code.

export interface AiTextRequest {
  system: string
  user: string
  /** Hard cap on output tokens. */
  maxTokens?: number
}

export interface AiJsonRequest<T> extends AiTextRequest {
  /** JSON Schema the response must conform to (structured outputs). */
  schema: Record<string, unknown>
  /** Runtime validator — the provider returns a value only if it passes. */
  validate: (value: unknown) => value is T
}

export interface AiProvider {
  /** Free-form text completion (used by Generate → DSL and Review → markdown). */
  complete(req: AiTextRequest): Promise<string>
  /** Structured completion validated against a schema (Describe, Edit). */
  completeJson<T>(req: AiJsonRequest<T>): Promise<T>
}

export interface AiProviderConfig {
  apiKey: string
  model: string
}

// ─── Errors ─────────────────────────────────────────────────────────

export type AiErrorKind = 'auth' | 'rate-limit' | 'network' | 'invalid-response' | 'unknown'

export class AiError extends Error {
  readonly kind: AiErrorKind
  constructor(kind: AiErrorKind, message: string) {
    super(message)
    this.name = 'AiError'
    this.kind = kind
  }
}

/** Friendly, user-facing message for an AiError kind. */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof AiError) {
    switch (err.kind) {
      case 'auth':
        return 'Invalid API key. Check your Anthropic key in AI settings.'
      case 'rate-limit':
        return 'Rate limited by Anthropic. Wait a moment and try again.'
      case 'network':
        return "Couldn't reach Anthropic. Check your connection and try again."
      case 'invalid-response':
        return 'The model returned an unexpected response. Try again.'
      default:
        return err.message || 'Something went wrong. Try again.'
    }
  }
  return err instanceof Error ? err.message : 'Something went wrong. Try again.'
}

// ─── Edit operations ────────────────────────────────────────────────
//
// The Edit feature returns a list of these typed operations. New elements get a
// temporary `ref` that later operations (and relationships) can target; existing
// elements are addressed by their real `id`.

export interface AddPersonOp {
  op: 'addPerson'
  ref: string
  name: string
  description?: string
}

export interface AddSoftwareSystemOp {
  op: 'addSoftwareSystem'
  ref: string
  name: string
  description?: string
}

export interface AddContainerOp {
  op: 'addContainer'
  ref: string
  /** Parent system, addressed by real id or a ref defined earlier in this batch. */
  parent: string
  name: string
  description?: string
  technology?: string
}

export interface AddComponentOp {
  op: 'addComponent'
  ref: string
  /** Parent container, addressed by real id or a ref defined earlier in this batch. */
  parent: string
  name: string
  description?: string
  technology?: string
}

export interface AddRelationshipOp {
  op: 'addRelationship'
  /** Source/destination — real id or a ref defined earlier in this batch. */
  source: string
  destination: string
  description?: string
  technology?: string
}

export interface UpdateElementOp {
  op: 'updateElement'
  /** Existing element id. */
  id: string
  name?: string
  description?: string
  technology?: string
}

export interface UpdateRelationshipOp {
  op: 'updateRelationship'
  /** Existing relationship id. */
  id: string
  description?: string
  technology?: string
}

export interface DeleteElementOp {
  op: 'deleteElement'
  /** Existing element id. */
  id: string
}

export type EditOp =
  | AddPersonOp
  | AddSoftwareSystemOp
  | AddContainerOp
  | AddComponentOp
  | AddRelationshipOp
  | UpdateElementOp
  | UpdateRelationshipOp
  | DeleteElementOp

export interface EditPlan {
  operations: EditOp[]
}

// ─── Describe results ───────────────────────────────────────────────

export interface DescribePatch {
  /** Existing element or relationship id. */
  id: string
  description: string
}

export interface DescribeResult {
  elements: DescribePatch[]
  relationships: DescribePatch[]
}
