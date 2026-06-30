import { describe, it, expect } from 'vitest'
import { findingsToMarkdown, sortedFindings, isActionable } from './review'
import type { ReviewResult, ReviewFinding } from './types'

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

describe('sortedFindings', () => {
  it('orders high → medium → low, stable within a tier', () => {
    const result: ReviewResult = {
      findings: [
        finding({ title: 'low1', severity: 'low' }),
        finding({ title: 'high1', severity: 'high' }),
        finding({ title: 'med1', severity: 'medium' }),
        finding({ title: 'high2', severity: 'high' }),
      ],
    }
    expect(sortedFindings(result).map((f) => f.title)).toEqual(['high1', 'high2', 'med1', 'low1'])
  })
})

describe('findingsToMarkdown', () => {
  it('renders a heading per finding with severity and category', () => {
    const md = findingsToMarkdown({
      findings: [finding({ title: 'Unlabeled link', severity: 'high', category: 'missing-relationship', operations: [{ op: 'updateRelationship', id: 'r1' }] })],
    })
    expect(md).toContain('# Architecture review')
    expect(md).toContain('## [HIGH] Unlabeled link')
    expect(md).toContain('*missing-relationship* · auto-fixable')
    expect(md).toContain('**Suggestion:** S')
  })

  it('handles an empty result', () => {
    expect(findingsToMarkdown({ findings: [] })).toContain('No issues found')
  })
})
