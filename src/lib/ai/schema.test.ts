import { describe, it, expect } from 'vitest'
import { isDescribeResult, isEditPlan } from './schema'

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
