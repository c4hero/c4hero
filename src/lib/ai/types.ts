/** The BYOK AI features / panel modes. `compose` merges generate + edit;
 *  auto-describe is folded into `review`; `repo` scans a local repository;
 *  `adr` is reachable from the command palette only. */
export type AiFeatureId = 'compose' | 'interview' | 'review' | 'repo' | 'adr'

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
        return 'Invalid API key. Check your Anthropic key in AI settings.'
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

// ─── Review findings ────────────────────────────────────────────────

export type ReviewSeverity = 'high' | 'medium' | 'low'

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
}

export interface ReviewResult {
  findings: ReviewFinding[]
}

// ─── Repo scan ──────────────────────────────────────────────────────

/** One file read from a local repository (content may be truncated). */
export interface RepoFile {
  path: string
  content: string
}

/** A compact snapshot of a repo sent to the model: its file tree plus the
 *  contents of high-signal manifest/config files. */
export interface RepoSnapshot {
  repoName: string
  tree: string[]
  files: RepoFile[]
}

/** A proposed model edit inferred from the code, with its source file. */
export interface RepoProposal {
  op: EditOp
  /** Repo file path that justifies the proposal (provenance). */
  src: string
  /** Short human-readable description of the change. */
  label: string
}

/** One answer choice for a scan question. Choosing it applies `op` (omitted for
 *  a "no / none" choice). */
export interface ScanOption {
  label: string
  op?: EditOp
}

/** A point the scan was unsure about (an ambiguous connection, or whether an
 *  element is external/internal/distinct), surfaced for the user to resolve. */
export interface ScanQuestion {
  text: string
  options: ScanOption[]
}

export interface RepoScanResult {
  /** Confident elements + relationships, applied by default. */
  proposals: RepoProposal[]
  /** Things the scan wasn't sure about, for the user to answer. */
  questions: ScanQuestion[]
}
