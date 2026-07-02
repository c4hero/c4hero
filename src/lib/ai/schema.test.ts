import { describe, it, expect } from 'vitest'
import { toEditPlan, toReviewResult, toDescribeResult } from './schema'

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
