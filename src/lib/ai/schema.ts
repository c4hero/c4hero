import type { DescribeResult, EditPlan, EditOp, ReviewResult, ReviewFinding, RepoScanResult, RepoProposal, ScanQuestion, ScanOption } from './types'
import { isRecord, isStringArray } from '@/lib/guards'
import { createLogger } from '@/lib/logger'

// JSON Schemas (for Anthropic structured outputs) plus runtime validators for the
// two features that need machine-readable results. Validators are exported and
// unit-tested independently of the network layer.

// ─── Describe ───────────────────────────────────────────────────────

const patchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['id', 'description'],
}

export const describeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    elements: { type: 'array', items: patchSchema },
    relationships: { type: 'array', items: patchSchema },
  },
  required: ['elements', 'relationships'],
}

// ─── Edit ───────────────────────────────────────────────────────────

// One permissive object schema covering every op variant; the runtime validator
// and applier enforce per-op required fields. (Structured-output schemas can't
// express a tagged union cleanly across all providers, so we keep the schema
// loose and validate in code.)
const opSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    op: {
      type: 'string',
      enum: [
        'addPerson', 'addSoftwareSystem', 'addContainer', 'addComponent',
        'addRelationship', 'updateElement', 'updateRelationship', 'deleteElement',
      ],
    },
    ref: { type: 'string' },
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    technology: { type: 'string' },
    parent: { type: 'string' },
    source: { type: 'string' },
    destination: { type: 'string' },
    external: { type: 'boolean' },
  },
  required: ['op'],
}

export const editSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    operations: { type: 'array', items: opSchema },
  },
  required: ['operations'],
}

const OP_NAMES: ReadonlySet<string> = new Set<EditOp['op']>([
  'addPerson', 'addSoftwareSystem', 'addContainer', 'addComponent',
  'addRelationship', 'updateElement', 'updateRelationship', 'deleteElement',
])

export function isEditOp(value: unknown): value is EditOp {
  if (!isRecord(value) || typeof value.op !== 'string' || !OP_NAMES.has(value.op)) return false
  switch (value.op) {
    case 'addPerson':
    case 'addSoftwareSystem':
      return typeof value.ref === 'string' && typeof value.name === 'string'
    case 'addContainer':
    case 'addComponent':
      return typeof value.ref === 'string' && typeof value.name === 'string' && typeof value.parent === 'string'
    case 'addRelationship':
      return typeof value.source === 'string' && typeof value.destination === 'string'
    case 'updateElement':
    case 'updateRelationship':
    case 'deleteElement':
      return typeof value.id === 'string'
    default:
      return false
  }
}

// ─── Review ─────────────────────────────────────────────────────────

const REVIEW_CATEGORIES = [
  'missing-element', 'missing-relationship', 'naming', 'description',
  'technology', 'boundary', 'security', 'scalability', 'other',
]

const findingSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    detail: { type: 'string' },
    category: { type: 'string', enum: REVIEW_CATEGORIES },
    severity: { type: 'string', enum: ['high', 'medium', 'low'] },
    elementIds: { type: 'array', items: { type: 'string' } },
    suggestion: { type: 'string' },
    // Present only when the finding maps to a concrete model edit.
    operations: { type: 'array', items: opSchema },
  },
  required: ['title', 'detail', 'category', 'severity', 'elementIds', 'suggestion'],
}

export const reviewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: { type: 'array', items: findingSchema },
  },
  required: ['findings'],
}

// ─── Repo scan ──────────────────────────────────────────────────────

const proposalSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    op: opSchema,
    src: { type: 'string' },
    label: { type: 'string' },
  },
  required: ['op', 'src', 'label'],
}

export const repoScanSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    proposals: { type: 'array', items: proposalSchema },
  },
  required: ['proposals'],
}

const optionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { label: { type: 'string' }, op: opSchema },
  required: ['label'],
}

const questionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: { type: 'string' },
    options: { type: 'array', items: optionSchema },
  },
  required: ['text', 'options'],
}

/** Phase 2 (connections): relationships the scan is confident about, plus
 *  questions for anything it's unsure of. */
export const connectionsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    relationships: { type: 'array', items: proposalSchema },
    questions: { type: 'array', items: questionSchema },
  },
  required: ['relationships', 'questions'],
}

// ─── Tolerant sanitizers ────────────────────────────────────────────
//
// Models occasionally return a batch where one item is malformed. Rather than
// reject the whole response, these keep the well-formed items and drop the rest
// (logging how many were dropped), so a single bad operation never throws away a
// good plan. The applier is already defensive about ops it can't apply.

const log = createLogger('ai/schema')

function dropLog(kind: string, kept: number, total: number): void {
  if (kept < total) log.warn(`Dropped ${total - kept} malformed ${kind} from the model response`, { kept, total })
}

/** Filter an `{ operations }` envelope down to valid operations. */
export function toEditPlan(value: unknown): EditPlan {
  const ops = isRecord(value) && Array.isArray(value.operations) ? value.operations : []
  const operations = ops.filter(isEditOp)
  dropLog('operations', operations.length, ops.length)
  return { operations }
}

/** Filter an array of proposals, keeping those with a valid op and coercing
 *  missing provenance to empty strings. */
export function toRepoProposals(value: unknown): RepoProposal[] {
  const raw = Array.isArray(value) ? value : []
  const proposals: RepoProposal[] = []
  for (const p of raw) {
    if (isRecord(p) && isEditOp(p.op)) {
      proposals.push({
        op: p.op,
        src: typeof p.src === 'string' ? p.src : '',
        label: typeof p.label === 'string' ? p.label : '',
      })
    }
  }
  dropLog('proposals', proposals.length, raw.length)
  return proposals
}

/** Filter an array of scan questions: keep those with text and ≥1 labelled
 *  option, dropping options whose op is malformed (a "none" option has no op). */
export function toScanQuestions(value: unknown): ScanQuestion[] {
  const raw = Array.isArray(value) ? value : []
  const questions: ScanQuestion[] = []
  for (const q of raw) {
    if (!isRecord(q) || typeof q.text !== 'string') continue
    const opts = Array.isArray(q.options) ? q.options : []
    const options: ScanOption[] = []
    for (const o of opts) {
      if (isRecord(o) && typeof o.label === 'string') {
        options.push({ label: o.label, op: isEditOp(o.op) ? o.op : undefined })
      }
    }
    if (options.length) questions.push({ text: q.text, options })
  }
  return questions
}

/** Filter a `{ proposals, questions }` envelope into a full scan result. */
export function toRepoScanResult(value: unknown): RepoScanResult {
  const v = isRecord(value) ? value : {}
  return { proposals: toRepoProposals(v.proposals), questions: toScanQuestions(v.questions) }
}

function toReviewFinding(value: unknown): ReviewFinding | null {
  if (!isRecord(value)) return null
  if (typeof value.title !== 'string' || typeof value.detail !== 'string' || typeof value.suggestion !== 'string') return null
  const severity: ReviewFinding['severity'] = value.severity === 'high' || value.severity === 'low' ? value.severity : 'medium'
  const ops = Array.isArray(value.operations) ? value.operations.filter(isEditOp) : []
  return {
    title: value.title,
    detail: value.detail,
    category: typeof value.category === 'string' ? value.category : 'other',
    severity,
    elementIds: isStringArray(value.elementIds) ? value.elementIds : [],
    suggestion: value.suggestion,
    operations: ops.length ? ops : undefined,
  }
}

/** Filter a `{ findings }` envelope, keeping well-formed findings (and dropping
 *  any malformed operations inside each). */
export function toReviewResult(value: unknown): ReviewResult {
  const raw = isRecord(value) && Array.isArray(value.findings) ? value.findings : []
  const findings = raw.map(toReviewFinding).filter((f): f is ReviewFinding => f !== null)
  dropLog('findings', findings.length, raw.length)
  return { findings }
}

function toPatches(value: unknown): DescribeResult['elements'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((p) => (isRecord(p) && typeof p.id === 'string' && typeof p.description === 'string'
    ? [{ id: p.id, description: p.description }] : []))
}

/** Coerce a `{ elements, relationships }` describe envelope, keeping valid patches. */
export function toDescribeResult(value: unknown): DescribeResult {
  const src = isRecord(value) ? value : {}
  return { elements: toPatches(src.elements), relationships: toPatches(src.relationships) }
}
