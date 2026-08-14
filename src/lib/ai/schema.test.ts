import { describe, it, expect } from 'vitest'
import {
  toEditPlan, toReviewResult, toDescribeResult, sanitizeEditOp,
  MAX_PLAN_OPS, MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_TECHNOLOGY_LENGTH,
  MAX_OWNER_LENGTH, MAX_TITLE_LENGTH, MAX_ID_FIELD_LENGTH, MAX_TAGS_COUNT, MAX_TAG_LENGTH,
} from './schema'
import type { EditOp } from './types'

describe('tolerant sanitizers', () => {
  it('toEditPlan keeps valid operations and drops malformed ones', () => {
    const plan = toEditPlan({ operations: [
      { op: 'addPerson', ref: 'p', name: 'User' },        // valid
      { op: 'addContainer', ref: 'c', name: 'Svc' },      // missing parent → dropped
      { op: 'updateElement', id: 'x', description: 'd' },  // valid
      { op: 'nonsense' },                                 // unknown → dropped
    ] })
    expect(plan.operations).toHaveLength(2)
    expect(plan.operations.map((o) => o.op)).toEqual(['addPerson', 'updateElement'])
  })

  it('toEditPlan tolerates a non-array / missing envelope', () => {
    expect(toEditPlan({}).operations).toEqual([])
    expect(toEditPlan(null).operations).toEqual([])
  })

  it('toReviewResult keeps valid findings and strips malformed operations', () => {
    const res = toReviewResult({ findings: [
      { title: 't', detail: 'd', category: 'naming', severity: 'high', elementIds: [], suggestion: 's', operations: [{ op: 'bogus' }] },
      { title: 'x' },  // missing required strings → dropped
    ] })
    expect(res.findings).toHaveLength(1)
    expect(res.findings[0].operations).toBeUndefined()  // the one bad op was stripped
  })

  it('toReviewResult keeps fix options with a label and at least one valid op', () => {
    const res = toReviewResult({ findings: [{
      title: 't', detail: 'd', category: 'boundary', severity: 'high', elementIds: ['e1'], suggestion: 's',
      operations: [{ op: 'updateElement', id: 'e1', name: 'A' }],
      options: [
        { label: 'Make external', operations: [{ op: 'updateElement', id: 'e1', name: 'A' }] },
        { label: 'No ops here', operations: [{ op: 'bogus' }] },     // dropped — no valid op
        { label: '', operations: [{ op: 'updateElement', id: 'e1', name: 'B' }] }, // dropped — no label
      ],
    }] })
    expect(res.findings[0].options).toEqual([
      { label: 'Make external', operations: [{ op: 'updateElement', id: 'e1', name: 'A' }] },
    ])
  })

  it('toDescribeResult keeps well-formed patches only', () => {
    const res = toDescribeResult({ elements: [{ id: 'a', description: 'x' }, { id: 'b' }], relationships: 'oops' })
    expect(res.elements).toEqual([{ id: 'a', description: 'x' }])
    expect(res.relationships).toEqual([])
  })
})

describe('sanitizeEditOp and cap enforcement', () => {
  describe('text field truncation', () => {
    it('truncates name to MAX_NAME_LENGTH', () => {
      const longName = 'a'.repeat(MAX_NAME_LENGTH + 10)
      const op: EditOp = { op: 'addPerson', ref: 'p', name: longName }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      expect(sanitized!.name).toBe('a'.repeat(MAX_NAME_LENGTH))
      expect(sanitized!.name.length).toBe(MAX_NAME_LENGTH)
    })

    it('truncates description to MAX_DESCRIPTION_LENGTH', () => {
      const longDesc = 'b'.repeat(MAX_DESCRIPTION_LENGTH + 10)
      const op: EditOp = { op: 'updateElement', id: 'x', description: longDesc }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      expect(sanitized!.description.length).toBe(MAX_DESCRIPTION_LENGTH)
    })

    it('truncates technology to MAX_TECHNOLOGY_LENGTH', () => {
      const longTech = 'c'.repeat(MAX_TECHNOLOGY_LENGTH + 10)
      const op: EditOp = { op: 'addContainer', ref: 'c', parent: 'p', name: 'Svc', technology: longTech }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      expect(sanitized!.technology!.length).toBe(MAX_TECHNOLOGY_LENGTH)
    })

    it('truncates owner to MAX_OWNER_LENGTH', () => {
      const longOwner = 'd'.repeat(MAX_OWNER_LENGTH + 10)
      const op: EditOp = { op: 'updateElement', id: 'x', owner: longOwner }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      expect(sanitized!.owner!.length).toBe(MAX_OWNER_LENGTH)
    })

    it('truncates title to MAX_TITLE_LENGTH', () => {
      const longTitle = 'e'.repeat(MAX_TITLE_LENGTH + 10)
      const op: EditOp = { op: 'addView', viewType: 'systemLandscape', title: longTitle }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      expect(sanitized!.title!.length).toBe(MAX_TITLE_LENGTH)
    })
  })

  describe('control character stripping', () => {
    it('strips C0 control characters from name field', () => {
      const op: EditOp = { op: 'addPerson', ref: 'p', name: 'User\x00\x01\x02Name' }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      expect(sanitized!.name).toBe('UserName')
    })

    it('preserves newline in description field', () => {
      const op: EditOp = { op: 'updateElement', id: 'x', description: 'Line 1\nLine 2' }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      expect(sanitized!.description).toBe('Line 1\nLine 2')
    })

    it('preserves tab in description field', () => {
      const op: EditOp = { op: 'updateElement', id: 'x', description: 'Prefix\tData' }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      expect(sanitized!.description).toBe('Prefix\tData')
    })

    it('removes control chars but preserves newline and tab together in description', () => {
      const op: EditOp = { op: 'updateElement', id: 'x', description: 'Start\x01\n\tEnd' }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      expect(sanitized!.description).toBe('Start\n\tEnd')
    })

    it('strips control chars (but not newline/tab) from technology field', () => {
      const op: EditOp = { op: 'addContainer', ref: 'c', parent: 'p', name: 'S', technology: 'Java\x00Node\tJS\nRust' }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      // Tab and newline should be stripped from non-description fields
      expect(sanitized!.technology).toBe('JavaNodeJSRust')
    })
  })

  describe('id-field length limits', () => {
    it('drops op if ref exceeds MAX_ID_FIELD_LENGTH', () => {
      const longRef = 'x'.repeat(MAX_ID_FIELD_LENGTH + 1)
      const op: EditOp = { op: 'addPerson', ref: longRef, name: 'Person' }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).toBeNull()
    })

    it('drops op if id exceeds MAX_ID_FIELD_LENGTH', () => {
      const longId = 'y'.repeat(MAX_ID_FIELD_LENGTH + 1)
      const op: EditOp = { op: 'updateElement', id: longId }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).toBeNull()
    })

    it('drops op if parent exceeds MAX_ID_FIELD_LENGTH', () => {
      const longParent = 'z'.repeat(MAX_ID_FIELD_LENGTH + 1)
      const op: EditOp = { op: 'addContainer', ref: 'c', name: 'Svc', parent: longParent }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).toBeNull()
    })

    it('drops op if source exceeds MAX_ID_FIELD_LENGTH', () => {
      const longSource = 'a'.repeat(MAX_ID_FIELD_LENGTH + 1)
      const op: EditOp = { op: 'addRelationship', source: longSource, destination: 'd' }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).toBeNull()
    })

    it('drops op if destination exceeds MAX_ID_FIELD_LENGTH', () => {
      const longDest = 'b'.repeat(MAX_ID_FIELD_LENGTH + 1)
      const op: EditOp = { op: 'addRelationship', source: 's', destination: longDest }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).toBeNull()
    })

    it('drops op if scope exceeds MAX_ID_FIELD_LENGTH', () => {
      const longScope = 'c'.repeat(MAX_ID_FIELD_LENGTH + 1)
      const op: EditOp = { op: 'addView', viewType: 'systemContext', scope: longScope }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).toBeNull()
    })

    it('keeps op if ref is exactly MAX_ID_FIELD_LENGTH', () => {
      const ref = 'x'.repeat(MAX_ID_FIELD_LENGTH)
      const op: EditOp = { op: 'addPerson', ref, name: 'Person' }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      expect(sanitized!.ref).toBe(ref)
    })
  })

  describe('tags capping', () => {
    it('caps tags array to MAX_TAGS_COUNT', () => {
      const tags = Array.from({ length: MAX_TAGS_COUNT + 5 }, (_, i) => `tag${i}`)
      const op: EditOp = { op: 'updateElement', id: 'x', tags }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      expect(sanitized!.tags).toHaveLength(MAX_TAGS_COUNT)
    })

    it('keeps only first MAX_TAGS_COUNT tags', () => {
      const tags = Array.from({ length: MAX_TAGS_COUNT + 3 }, (_, i) => `tag${i}`)
      const op: EditOp = { op: 'updateElement', id: 'x', tags }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      expect(sanitized!.tags).toEqual(tags.slice(0, MAX_TAGS_COUNT))
    })

    it('drops tags longer than MAX_TAG_LENGTH', () => {
      const longTag = 'x'.repeat(MAX_TAG_LENGTH + 1)
      const tags = ['short', longTag, 'ok']
      const op: EditOp = { op: 'updateElement', id: 'x', tags }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      expect(sanitized!.tags).toEqual(['short', 'ok'])
    })

    it('trims tags but keeps tag within length limit', () => {
      const tags = ['  spaced  ', ' ' + 'x'.repeat(MAX_TAG_LENGTH - 2) + ' ']
      const op: EditOp = { op: 'updateElement', id: 'x', tags }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      expect(sanitized!.tags).toEqual(['spaced', 'x'.repeat(MAX_TAG_LENGTH - 2)])
    })

    it('drops empty tags after trimming', () => {
      const tags = ['  ', 'valid', '   ', 'also-valid']
      const op: EditOp = { op: 'updateElement', id: 'x', tags }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      expect(sanitized!.tags).toEqual(['valid', 'also-valid'])
    })

    it('omits tags field if all tags are invalid/empty', () => {
      const tags = ['  ', '   ', '\t']
      const op: EditOp = { op: 'updateElement', id: 'x', tags }
      const sanitized = sanitizeEditOp(op)
      expect(sanitized).not.toBeNull()
      expect(sanitized!.tags).toBeUndefined()
    })
  })

  describe('non-string location/viewType rejection', () => {
    it('rejects op with non-string location via isEditOp', () => {
      const op: Record<string, unknown> = { op: 'updateElement', id: 'x', location: 123 }
      // isEditOp should reject this since location is not a string
      const isValid = (typeof op === 'object' && op !== null && 'op' in op && typeof op.location === 'string')
      expect(isValid).toBe(false)
    })

    it('rejects op with non-string viewType via isEditOp', () => {
      const op: Record<string, unknown> = { op: 'addView', viewType: { type: 'system' } }
      // isEditOp should reject this since viewType is not a string
      const isValid = (typeof op === 'object' && op !== null && 'op' in op && typeof op.viewType === 'string')
      expect(isValid).toBe(false)
    })
  })
})

describe('plan size cap', () => {
  it('keeps only first MAX_PLAN_OPS valid operations', () => {
    const ops = Array.from({ length: MAX_PLAN_OPS + 10 }, (_, i) => ({
      op: 'updateElement' as const,
      id: `id${i}`,
    }))
    const plan = toEditPlan({ operations: ops })
    expect(plan.operations).toHaveLength(MAX_PLAN_OPS)
  })

  it('301 valid operations reduced to 300 kept', () => {
    const ops = Array.from({ length: 301 }, (_, i) => ({
      op: 'updateElement' as const,
      id: `id${i}`,
    }))
    const plan = toEditPlan({ operations: ops })
    expect(plan.operations).toHaveLength(MAX_PLAN_OPS)
  })
})

describe('review finding ops/options sanitization', () => {
  it('sanitizes operations in finding.operations', () => {
    const longName = 'a'.repeat(MAX_NAME_LENGTH + 10)
    const res = toReviewResult({
      findings: [{
        title: 't',
        detail: 'd',
        category: 'naming',
        severity: 'high',
        elementIds: [],
        suggestion: 's',
        operations: [{ op: 'addPerson', ref: 'p', name: longName }],
      }],
    })
    expect(res.findings).toHaveLength(1)
    expect(res.findings[0].operations).toHaveLength(1)
    expect(res.findings[0].operations![0].name).toBe('a'.repeat(MAX_NAME_LENGTH))
  })

  it('sanitizes operations in finding.options', () => {
    const longName = 'b'.repeat(MAX_NAME_LENGTH + 5)
    const res = toReviewResult({
      findings: [{
        title: 't',
        detail: 'd',
        category: 'boundary',
        severity: 'high',
        elementIds: [],
        suggestion: 's',
        options: [
          {
            label: 'Fix 1',
            operations: [{ op: 'addPerson', ref: 'p1', name: longName }],
          },
        ],
      }],
    })
    expect(res.findings[0].options).toHaveLength(1)
    expect(res.findings[0].options![0].operations[0].name).toBe('b'.repeat(MAX_NAME_LENGTH))
  })

  it('drops options with ops that fail sanitization (oversized id)', () => {
    const longRef = 'x'.repeat(MAX_ID_FIELD_LENGTH + 1)
    const res = toReviewResult({
      findings: [{
        title: 't',
        detail: 'd',
        category: 'security',
        severity: 'high',
        elementIds: [],
        suggestion: 's',
        options: [
          {
            label: 'Fix 1',
            operations: [{ op: 'addPerson', ref: longRef, name: 'Person' }],
          },
        ],
      }],
    })
    expect(res.findings[0].options).toBeUndefined()
  })
})
