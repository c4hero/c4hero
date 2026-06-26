import { describe, it, expect } from 'vitest'
import {
  isDescribeResult, isEditPlan, isReviewResult, isRepoScanResult,
  toEditPlan, toRepoScanResult, toReviewResult, toDescribeResult,
} from './schema'

describe('isDescribeResult', () => {
  it('accepts a well-formed result', () => {
    expect(isDescribeResult({ elements: [{ id: 'a', description: 'x' }], relationships: [] })).toBe(true)
  })
  it('rejects missing arrays or wrong field types', () => {
    expect(isDescribeResult({ elements: [] })).toBe(false)
    expect(isDescribeResult({ elements: [{ id: 1, description: 'x' }], relationships: [] })).toBe(false)
    expect(isDescribeResult(null)).toBe(false)
  })
})

describe('isEditPlan', () => {
  it('accepts valid op variants', () => {
    expect(isEditPlan({
      operations: [
        { op: 'addPerson', ref: 'p', name: 'A' },
        { op: 'addContainer', ref: 'c', parent: 'sys', name: 'C' },
        { op: 'addRelationship', source: 'a', destination: 'b' },
        { op: 'updateElement', id: 'x' },
        { op: 'deleteElement', id: 'y' },
      ],
    })).toBe(true)
  })

  it('rejects ops missing required fields', () => {
    expect(isEditPlan({ operations: [{ op: 'addPerson', name: 'A' }] })).toBe(false) // no ref
    expect(isEditPlan({ operations: [{ op: 'addContainer', ref: 'c', name: 'C' }] })).toBe(false) // no parent
    expect(isEditPlan({ operations: [{ op: 'addRelationship', source: 'a' }] })).toBe(false) // no destination
  })

  it('rejects unknown ops and non-arrays', () => {
    expect(isEditPlan({ operations: [{ op: 'frobnicate', id: 'x' }] })).toBe(false)
    expect(isEditPlan({ operations: 'nope' })).toBe(false)
    expect(isEditPlan({})).toBe(false)
  })
})

describe('isReviewResult', () => {
  const finding = {
    title: 'Unlabeled relationship', detail: 'The link from A to B has no description.',
    category: 'missing-relationship', severity: 'medium', elementIds: ['a', 'b'],
    suggestion: 'Describe what flows from A to B.',
  }

  it('accepts findings with and without operations', () => {
    expect(isReviewResult({ findings: [finding] })).toBe(true)
    expect(isReviewResult({
      findings: [{ ...finding, operations: [{ op: 'updateRelationship', id: 'r1', description: 'x' }] }],
    })).toBe(true)
    expect(isReviewResult({ findings: [] })).toBe(true)
  })

  it('rejects bad severity, missing fields, or bad operations', () => {
    expect(isReviewResult({ findings: [{ ...finding, severity: 'critical' }] })).toBe(false)
    expect(isReviewResult({ findings: [{ ...finding, elementIds: 'a' }] })).toBe(false)
    expect(isReviewResult({ findings: [{ ...finding, operations: [{ op: 'bogus' }] }] })).toBe(false)
    const noSuggestion = { ...finding } as Partial<typeof finding>
    delete noSuggestion.suggestion
    expect(isReviewResult({ findings: [noSuggestion] })).toBe(false)
    expect(isReviewResult({})).toBe(false)
  })
})

describe('isRepoScanResult', () => {
  it('accepts proposals carrying an op, src and label', () => {
    expect(isRepoScanResult({
      proposals: [
        { op: { op: 'addContainer', ref: 'c', parent: 'sys', name: 'payments' }, src: 'package.json', label: 'Add payments' },
        { op: { op: 'updateElement', id: 'x', technology: 'Java' }, src: 'pom.xml', label: 'Set tech' },
      ],
    })).toBe(true)
    expect(isRepoScanResult({ proposals: [] })).toBe(true)
  })
  it('rejects proposals missing provenance or with a bad op', () => {
    expect(isRepoScanResult({ proposals: [{ op: { op: 'addPerson', ref: 'p', name: 'A' }, label: 'x' }] })).toBe(false)
    expect(isRepoScanResult({ proposals: [{ op: { op: 'bogus' }, src: 'a', label: 'b' }] })).toBe(false)
    expect(isRepoScanResult({})).toBe(false)
  })
})

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

  it('toRepoScanResult keeps proposals with a valid op, coercing missing provenance', () => {
    const res = toRepoScanResult({ proposals: [
      { op: { op: 'addContainer', ref: 'c', parent: 'sys', name: 'payments' }, src: 'package.json', label: 'Add payments' },
      { op: { op: 'addRelationship', source: 'a' } },     // missing destination → dropped
      { op: { op: 'updateElement', id: 'x', technology: 'Java' } },  // no src/label → kept, coerced
    ] })
    expect(res.proposals).toHaveLength(2)
    expect(res.proposals[1]).toMatchObject({ src: '', label: '' })
    expect(res.questions).toEqual([])
  })

  it('toRepoScanResult keeps well-formed questions and drops bad option ops', () => {
    const res = toRepoScanResult({
      proposals: [],
      questions: [
        { text: 'Orders → Payments?', options: [
          { label: 'Sync HTTP', op: { op: 'addRelationship', source: 'Orders', destination: 'Payments' } },
          { label: 'No connection' },                                  // valid "none" option
          { label: 'broken', op: { op: 'addRelationship', source: 'x' } }, // bad op → kept as none
        ] },
        { text: 'no options', options: [] },                            // dropped (no options)
        { options: [{ label: 'x' }] },                                  // dropped (no text)
      ],
    })
    expect(res.questions).toHaveLength(1)
    expect(res.questions[0].options).toHaveLength(3)
    expect(res.questions[0].options[0].op).toBeTruthy()
    expect(res.questions[0].options[1].op).toBeUndefined()
    expect(res.questions[0].options[2].op).toBeUndefined()
  })

  it('toReviewResult keeps valid findings and strips malformed operations', () => {
    const res = toReviewResult({ findings: [
      { title: 't', detail: 'd', category: 'naming', severity: 'high', elementIds: [], suggestion: 's', operations: [{ op: 'bogus' }] },
      { title: 'x' },  // missing required strings → dropped
    ] })
    expect(res.findings).toHaveLength(1)
    expect(res.findings[0].operations).toBeUndefined()  // the one bad op was stripped
  })

  it('toDescribeResult keeps well-formed patches only', () => {
    const res = toDescribeResult({ elements: [{ id: 'a', description: 'x' }, { id: 'b' }], relationships: 'oops' })
    expect(res.elements).toEqual([{ id: 'a', description: 'x' }])
    expect(res.relationships).toEqual([])
  })
})
