import type { DescribeResult, EditPlan, EditOp, ReviewResult, ReviewFinding, ReviewFixOption } from './types'
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
        'addView',
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
    location: { type: 'string', enum: ['Internal', 'External'] },
    // updateElement extras: category tags (added, not replaced), lifecycle status,
    // and owner. The applier validates status against the enum and merges tags.
    tags: { type: 'array', items: { type: 'string' } },
    status: { type: 'string', enum: ['Live', 'Planned', 'Deprecated', 'Removed'] },
    owner: { type: 'string' },
    // addView: the kind of diagram and its scope element.
    viewType: { type: 'string', enum: ['systemLandscape', 'systemContext', 'container', 'component'] },
    scope: { type: 'string' },
    title: { type: 'string' },
  },
  required: ['op'],
}

/** Valid lifecycle status values (mirrors ElementStatus). */
export const ELEMENT_STATUS_VALUES: ReadonlySet<string> = new Set(['Live', 'Planned', 'Deprecated', 'Removed'])

/** Valid view-type values (mirrors ViewType). */
export const VIEW_TYPE_VALUES: ReadonlySet<string> = new Set(['systemLandscape', 'systemContext', 'container', 'component'])

// ─── Sanitizer caps ─────────────────────────────────────────────────
// Bounds on op-count and text-field lengths to defend against runaway/adversarial model output.

/** Maximum number of valid operations in a single plan. */
export const MAX_PLAN_OPS = 300

/** Maximum length (chars) for name fields. */
export const MAX_NAME_LENGTH = 200

/** Maximum length (chars) for description fields. */
export const MAX_DESCRIPTION_LENGTH = 2000

/** Maximum length (chars) for technology fields. */
export const MAX_TECHNOLOGY_LENGTH = 100

/** Maximum length (chars) for owner fields. */
export const MAX_OWNER_LENGTH = 120

/** Maximum length (chars) for title fields. */
export const MAX_TITLE_LENGTH = 120

/** Maximum length (chars) for id-like fields (ref, id, parent, source, destination, scope). */
export const MAX_ID_FIELD_LENGTH = 512

/** Maximum number of tags in a tags array. */
export const MAX_TAGS_COUNT = 20

/** Maximum length (chars) per tag. */
export const MAX_TAG_LENGTH = 80

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
  'addView',
])

const OP_STRING_FIELDS = [
  'ref', 'id', 'name', 'description', 'technology', 'parent', 'source', 'destination', 'owner',
  'scope', 'title',
] as const

function hasValidOpFieldTypes(value: Record<string, unknown>): boolean {
  for (const field of OP_STRING_FIELDS) {
    if (value[field] !== undefined && typeof value[field] !== 'string') return false
  }
  if (value.external !== undefined && typeof value.external !== 'boolean') return false
  // Only the TYPE is gated here (a malformed value drops the whole op); the
  // status enum value is validated leniently in the applier so a slightly-off
  // status doesn't discard an otherwise-valid update.
  if (value.tags !== undefined && !isStringArray(value.tags)) return false
  if (value.location !== undefined && typeof value.location !== 'string') return false
  if (value.viewType !== undefined && typeof value.viewType !== 'string') return false
  return value.status === undefined || typeof value.status === 'string'
}

export function isEditOp(value: unknown): value is EditOp {
  if (!isRecord(value) || typeof value.op !== 'string' || !OP_NAMES.has(value.op)) return false
  if (!hasValidOpFieldTypes(value)) return false
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
    case 'addView':
      // Scope requirement (system for context/container, container for component)
      // is enforced in the applier, which can skip with a reason.
      return typeof value.viewType === 'string' && VIEW_TYPE_VALUES.has(value.viewType)
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
    // A few distinct candidate fixes the user can choose between.
    options: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { label: { type: 'string' }, operations: { type: 'array', items: opSchema } },
        required: ['label', 'operations'],
      },
    },
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

/** Strip C0 control characters (U+0000 through U+001F) from a string, preserving
 *  newline and tab when keepLinebreaks is true. */
function stripControlChars(s: string, keepLinebreaks: boolean): string {
  if (keepLinebreaks) {
    // Keep \n (0x0A) and \t (0x09); strip the rest of C0 range (0x00-0x1F)
    return s.split('').filter(c => {
      const code = c.charCodeAt(0)
      return code >= 0x20 || code === 0x09 || code === 0x0A
    }).join('')
  }
  // Strip all C0 control characters (0x00-0x1F)
  return s.split('').filter(c => c.charCodeAt(0) >= 0x20).join('')
}

/** Sanitize an EditOp: truncate text fields, strip control chars, enforce id-field
 *  length limits, and cap tags. Returns the sanitized op or null if the op should
 *  be dropped entirely (e.g., an id-field exceeds MAX_ID_FIELD_LENGTH). */
export function sanitizeEditOp(op: EditOp): EditOp | null {
  // Check id-fields first: if any exceed MAX_ID_FIELD_LENGTH, drop the whole op
  const opAny = op as unknown as Record<string, unknown>
  const idFields = ['ref', 'id', 'parent', 'source', 'destination', 'scope'] as const
  for (const field of idFields) {
    if (field in opAny && typeof opAny[field] === 'string') {
      if ((opAny[field] as string).length > MAX_ID_FIELD_LENGTH) {
        return null // Drop the whole op
      }
    }
  }

  const result: Record<string, unknown> = { ...op }

  // Truncate and strip control chars from text fields
  if (typeof result.name === 'string') {
    result.name = stripControlChars(result.name, false).slice(0, MAX_NAME_LENGTH)
  }
  if (typeof result.description === 'string') {
    result.description = stripControlChars(result.description, true).slice(0, MAX_DESCRIPTION_LENGTH)
  }
  if (typeof result.technology === 'string') {
    result.technology = stripControlChars(result.technology, false).slice(0, MAX_TECHNOLOGY_LENGTH)
  }
  if (typeof result.owner === 'string') {
    result.owner = stripControlChars(result.owner, false).slice(0, MAX_OWNER_LENGTH)
  }
  if (typeof result.title === 'string') {
    result.title = stripControlChars(result.title, false).slice(0, MAX_TITLE_LENGTH)
  }

  // Sanitize tags: cap count, trim, drop empty/long tags
  if (Array.isArray(result.tags)) {
    const tags = result.tags
      .slice(0, MAX_TAGS_COUNT)
      .map((t) => {
        if (typeof t === 'string') {
          const trimmed = t.trim()
          return trimmed.length <= MAX_TAG_LENGTH ? trimmed : null
        }
        return null
      })
      .filter((t): t is string => t !== null && t.length > 0)
    result.tags = tags.length > 0 ? tags : undefined
  }

  return result as unknown as EditOp
}

/** Filter an `{ operations }` envelope down to valid operations. */
export function toEditPlan(value: unknown): EditPlan {
  const ops = isRecord(value) && Array.isArray(value.operations) ? value.operations : []
  const validOps = ops.filter(isEditOp)
  const sanitized = validOps.map(sanitizeEditOp).filter((op): op is EditOp => op !== null)

  // Cap at MAX_PLAN_OPS
  if (sanitized.length > MAX_PLAN_OPS) {
    dropLog('operations due to plan size cap', MAX_PLAN_OPS, sanitized.length)
    sanitized.length = MAX_PLAN_OPS
  }

  dropLog('operations', sanitized.length, ops.length)
  return { operations: sanitized }
}

export function toReviewFinding(value: unknown): ReviewFinding | null {
  if (!isRecord(value)) return null
  if (typeof value.title !== 'string' || typeof value.detail !== 'string' || typeof value.suggestion !== 'string') return null
  const severity: ReviewFinding['severity'] = value.severity === 'high' || value.severity === 'low' ? value.severity : 'medium'

  // Sanitize finding operations
  const ops = Array.isArray(value.operations)
    ? value.operations.filter(isEditOp).map(sanitizeEditOp).filter((op): op is EditOp => op !== null)
    : []

  // Keep only options that have a label and at least one valid operation
  const options = Array.isArray(value.options)
    ? value.options.flatMap((o): ReviewFixOption[] => {
        if (!isRecord(o) || typeof o.label !== 'string' || !o.label.trim()) return []
        const oops = Array.isArray(o.operations)
          ? o.operations.filter(isEditOp).map(sanitizeEditOp).filter((op): op is EditOp => op !== null)
          : []
        return oops.length ? [{ label: o.label, operations: oops }] : []
      })
    : []

  return {
    title: value.title,
    detail: value.detail,
    category: typeof value.category === 'string' ? value.category : 'other',
    severity,
    elementIds: isStringArray(value.elementIds) ? value.elementIds : [],
    suggestion: value.suggestion,
    operations: ops.length ? ops : undefined,
    options: options.length ? options : undefined,
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
