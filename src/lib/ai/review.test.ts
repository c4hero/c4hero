import { describe, it, expect } from 'vitest'
import { isActionable } from './review'
import type { ReviewFinding } from './types'

function finding(over: Partial<ReviewFinding>): ReviewFinding {
  return {
    title: 'T', detail: 'D', category: 'other', severity: 'low',
    elementIds: [], suggestion: 'S', ...over,
  }
}

describe('isActionable', () => {
  it('is true only when operations are present and non-empty', () => {
    expect(isActionable(finding({ operations: [{ op: 'deleteElement', id: 'x' }] }))).toBe(true)
    expect(isActionable(finding({ operations: [] }))).toBe(false)
    expect(isActionable(finding({}))).toBe(false)
  })

  it('counts option-only findings (options carrying operations) as actionable', () => {
    // The panel renders fix choices from options even with no top-level
    // operations, so applyStep must not auto-dismiss these.
    expect(isActionable(finding({ options: [{ label: 'Fix A', operations: [{ op: 'deleteElement', id: 'x' }] }] }))).toBe(true)
    // Options present but none carry operations → not actionable.
    expect(isActionable(finding({ options: [{ label: 'Empty', operations: [] }] }))).toBe(false)
  })
})
