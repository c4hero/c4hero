import type { DescribeResult, EditPlan, EditOp, ReviewResult, ReviewFinding } from './types'
import { isRecord, isStringArray } from '@/lib/guards'

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

function isPatchArray(value: unknown): boolean {
  return Array.isArray(value) && value.every(
    (p) => isRecord(p) && typeof p.id === 'string' && typeof p.description === 'string',
  )
}

export function isDescribeResult(value: unknown): value is DescribeResult {
  return isRecord(value) && isPatchArray(value.elements) && isPatchArray(value.relationships)
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

function isEditOp(value: unknown): value is EditOp {
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

export function isEditPlan(value: unknown): value is EditPlan {
  return isRecord(value) && Array.isArray(value.operations) && value.operations.every(isEditOp)
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

function isReviewFinding(value: unknown): value is ReviewFinding {
  if (!isRecord(value)) return false
  if (typeof value.title !== 'string' || typeof value.detail !== 'string') return false
  if (typeof value.category !== 'string' || typeof value.suggestion !== 'string') return false
  if (value.severity !== 'high' && value.severity !== 'medium' && value.severity !== 'low') return false
  if (!isStringArray(value.elementIds)) return false
  if (value.operations !== undefined && !(Array.isArray(value.operations) && value.operations.every(isEditOp))) return false
  return true
}

export function isReviewResult(value: unknown): value is ReviewResult {
  return isRecord(value) && Array.isArray(value.findings) && value.findings.every(isReviewFinding)
}
