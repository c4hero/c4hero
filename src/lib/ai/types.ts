import type { ElementStatus, ViewType } from '@/types/model'

/** The BYOK AI features / panel modes. `compose` merges generate + edit;
 *  auto-describe is folded into `review`; `adr` is reachable from the command
 *  palette only. */
export type AiFeatureId = 'compose' | 'interview' | 'review' | 'adr'

// ─── Provider abstraction ───────────────────────────────────────────
//
// Features talk to an AiProvider, never to the SDK directly. This keeps the
// network/SDK layer out of the testable feature logic and leaves room for a
// future OpenAI-compatible provider without touching feature code.

export interface AiChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AiTextRequest {
  system: string
  /** Prior turns for multi-turn features (e.g. the interview). The final `user`
   *  field is appended after these. Omit for single-shot requests. */
  history?: AiChatTurn[]
  user: string
  /** Hard cap on output tokens. */
  maxTokens?: number
  /** Sampling temperature. Structured features default to 0 for consistency. */
  temperature?: number
  /** Mark the (large, reused) system block as cacheable. Multi-turn features
   *  (the interview) re-send the same serialized model + view context every
   *  turn, so a provider that supports prompt caching (Anthropic's
   *  `cache_control`) can serve it from cache after the first turn. Providers
   *  without caching ignore this flag. */
  cacheSystem?: boolean
}

export interface AiJsonRequest<T> extends AiTextRequest {
  /** JSON Schema the response must conform to (structured outputs). */
  schema: Record<string, unknown>
  /** Runtime validator — the provider returns a value only if it passes. */
  validate: (value: unknown) => value is T
}

export interface AiStreamRequest extends AiTextRequest {
  /** Invoked with each incremental text chunk as it arrives over SSE. */
  onText: (delta: string) => void
  /** Cancels the in-flight request. Rejects the returned promise with the
   *  DOMException the fetch abort raises. */
  signal?: AbortSignal
}

export interface AiProvider {
  /** Free-form text completion (used by Generate → DSL and Review → markdown). */
  complete(req: AiTextRequest): Promise<string>
  /** Structured completion validated against a schema (Describe, Edit). */
  completeJson<T>(req: AiJsonRequest<T>): Promise<T>
  /** Streaming free-form completion: fires `onText` with each chunk as it
   *  arrives and resolves with the full accumulated text, so callers can still
   *  post-process the complete result (e.g. extract DSL). Optional — a provider
   *  without SSE support omits it and callers fall back to `complete`. */
  completeStream?(req: AiStreamRequest): Promise<string>
}

export interface AiProviderConfig {
  apiKey: string
  model: string
}

// ─── Errors ─────────────────────────────────────────────────────────

export type AiErrorKind = 'auth' | 'rate-limit' | 'connection' | 'network' | 'invalid-response' | 'unknown'

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
        return 'Invalid API key. Check your key for the selected provider in AI settings.'
      case 'rate-limit':
        return 'Rate limited by the AI provider. Wait a moment and try again.'
      case 'connection':
        return err.message
          || 'The browser blocked or failed the request before it left. This is usually a '
          + 'privacy/ad-block extension, a stale cached page (try a hard refresh or an incognito '
          + 'window), or a network firewall. Open the browser console for the exact reason.'
      case 'network':
        return 'The AI provider had a server error. Try again in a moment.'
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
  /** True for a third-party / hosted system the code merely depends on (Stripe,
   *  SendGrid, a managed DB, …) — modelled as a black box (location External). */
  external?: boolean
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
  /** Internal vs external — applies to people and software systems only. */
  location?: 'Internal' | 'External'
  /** Category tags to ADD (never replace) — merged with the element's existing
   *  tags so structural tags (Element/Container/…) that drive styling are kept. */
  tags?: string[]
  /** Lifecycle status. Must be one of the ElementStatus values; an invalid value
   *  is dropped by the applier. */
  status?: ElementStatus
  /** Team/person responsible for the element. */
  owner?: string
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

export interface AddViewOp {
  op: 'addView'
  /** Kind of diagram to create. */
  viewType: ViewType
  /** The element the view is about — a software system (for systemContext /
   *  container views) or a container (for component views), addressed by real id
   *  or a ref defined earlier in this batch. Omitted/ignored for systemLandscape,
   *  which spans the whole model. The view is auto-populated with the scope plus
   *  its related elements, mirroring the app's own "new view" behaviour. */
  scope?: string
  /** Optional view title; a sensible default is used when omitted. */
  title?: string
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
  | AddViewOp

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

// ─── Review findings ────────────────────────────────────────────────

export type ReviewSeverity = 'high' | 'medium' | 'low'

/** One concrete way to fix a finding: a short human label plus the operations
 *  that implement it. A finding may offer a few of these for the user to choose
 *  between (in addition to a free-text "Other" they can write themselves). */
export interface ReviewFixOption {
  label: string
  operations: EditOp[]
}

export interface ReviewFinding {
  /** Short summary of the issue. */
  title: string
  /** One or two sentences explaining it. */
  detail: string
  /** e.g. missing-element, missing-relationship, naming, description, technology,
   *  boundary, security, scalability, other. */
  category: string
  severity: ReviewSeverity
  /** Affected existing element ids (may be empty for advisory findings). */
  elementIds: string[]
  /** Human-readable suggested fix. */
  suggestion: string
  /** Concrete operations that fix this finding, present only when it maps to a
   *  direct model edit. Empty/absent for advisory findings. */
  operations?: EditOp[]
  /** A few distinct candidate fixes to choose from. When present, the UI shows a
   *  picker; when absent, `operations` (if any) is treated as the single option. */
  options?: ReviewFixOption[]
}

export interface ReviewResult {
  findings: ReviewFinding[]
}
