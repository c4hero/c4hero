import { describe, it, expect } from 'vitest'
import { toEditPlan, toRepoScanResult, toReviewResult, toDescribeResult } from './schema'

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
