import { describe, it, expect, vi } from 'vitest'
import {
  countMissingDescriptions, buildDescribePreview, applyDescribePreview, type DescribeActions,
} from './describe'
import type { DescribeResult } from './types'
import { makeWorkspace } from './testFixture'

describe('countMissingDescriptions', () => {
  it('counts elements + relationships lacking a description', () => {
    // admin, cart, db (3 elements) + r2 (1 relationship)
    expect(countMissingDescriptions(makeWorkspace())).toBe(4)
  })
})

describe('buildDescribePreview', () => {
  it('keeps only patches for ids that are still missing a description', () => {
    const ws = makeWorkspace()
    const result: DescribeResult = {
      elements: [
        { id: 'cart', description: 'Holds items' },
        { id: 'cust', description: 'OVERWRITE — already described' }, // should be dropped
        { id: 'ghost', description: 'nope' }, // not in workspace
      ],
      relationships: [{ id: 'r2', description: 'Reads and writes' }],
    }
    const preview = buildDescribePreview(result, ws)
    expect(preview.elements.map((e) => e.id)).toEqual(['cart'])
    expect(preview.elements[0].label).toBe('Cart')
    expect(preview.relationships.map((r) => r.id)).toEqual(['r2'])
    expect(preview.relationships[0].label).toBe('Web App → Database')
  })

  it('ignores blank descriptions and duplicate ids', () => {
    const ws = makeWorkspace()
    const result: DescribeResult = {
      elements: [
        { id: 'db', description: '   ' },
        { id: 'cart', description: 'first' },
        { id: 'cart', description: 'duplicate' },
      ],
      relationships: [],
    }
    const preview = buildDescribePreview(result, ws)
    expect(preview.elements).toEqual([{ id: 'cart', label: 'Cart', description: 'first' }])
  })
})

describe('applyDescribePreview', () => {
  it('applies element and relationship descriptions and counts them', () => {
    const actions: DescribeActions = {
      updateElement: vi.fn(),
      updateRelationship: vi.fn(),
    }
    const preview = {
      elements: [{ id: 'cart', label: 'Cart', description: 'Holds items' }],
      relationships: [{ id: 'r2', label: 'Web App → Database', description: 'Reads/writes' }],
    }
    const count = applyDescribePreview(preview, actions)
    expect(actions.updateElement).toHaveBeenCalledWith('cart', { description: 'Holds items' })
    expect(actions.updateRelationship).toHaveBeenCalledWith('r2', { description: 'Reads/writes' })
    expect(count).toBe(2)
  })
})
