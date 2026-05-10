import { describe, it, expect } from 'vitest'
import { formatImpactSummary } from './impactMessage'

describe('formatImpactSummary', () => {
  it('returns a single-element message with no cascade when nothing else falls', () => {
    const msg = formatImpactSummary({
      elementCount: 1, elementNames: ['Alice'],
      descendantContainers: 0, descendantComponents: 0,
      relationships: 0, scopedViews: 0,
    })
    expect(msg).toBe('Delete "Alice" from the model?')
  })

  it('summarizes a system with descendants, relationships, and dependent views', () => {
    const msg = formatImpactSummary({
      elementCount: 1, elementNames: ['Payments API'],
      descendantContainers: 4, descendantComponents: 11,
      relationships: 7, scopedViews: 2,
    })
    expect(msg).toBe(
      'Delete "Payments API" from the model? This will also remove ' +
      '4 containers, 11 components, 7 relationships, and 2 dependent views.'
    )
  })

  it('omits zero-count clauses', () => {
    const msg = formatImpactSummary({
      elementCount: 1, elementNames: ['Alice'],
      descendantContainers: 0, descendantComponents: 0,
      relationships: 3, scopedViews: 0,
    })
    expect(msg).toBe('Delete "Alice" from the model? This will also remove 3 relationships.')
  })

  it('uses singular nouns for counts of 1', () => {
    const msg = formatImpactSummary({
      elementCount: 1, elementNames: ['X'],
      descendantContainers: 1, descendantComponents: 1, relationships: 1, scopedViews: 1,
    })
    expect(msg).toBe(
      'Delete "X" from the model? This will also remove ' +
      '1 container, 1 component, 1 relationship, and 1 dependent view.'
    )
  })

  it('handles multi-element selections without quoting all names', () => {
    const msg = formatImpactSummary({
      elementCount: 3, elementNames: ['A', 'B', 'C'],
      descendantContainers: 0, descendantComponents: 0, relationships: 2, scopedViews: 0,
    })
    expect(msg).toBe('Delete 3 elements from the model? This will also remove 2 relationships.')
  })
})
