import { describe, it, expect } from 'vitest'
import {
  flattenElements, elementIdSet, elementNameMap, serializeContext,
  elementsMissingDescription, relationshipsMissingDescription,
} from './context'
import { makeWorkspace } from './testFixture'

describe('flattenElements', () => {
  it('walks people, systems, containers, and components in order', () => {
    const flat = flattenElements(makeWorkspace())
    expect(flat.map((e) => e.id)).toEqual(['cust', 'admin', 'shop', 'web', 'cart', 'db'])
  })

  it('records parent linkage for containers and components', () => {
    const flat = flattenElements(makeWorkspace())
    expect(flat.find((e) => e.id === 'web')?.parentId).toBe('shop')
    expect(flat.find((e) => e.id === 'cart')?.parentId).toBe('web')
    expect(flat.find((e) => e.id === 'cart')?.parentName).toBe('Web App')
  })
})

describe('elementIdSet / elementNameMap', () => {
  it('contains every element id and maps to names', () => {
    const ws = makeWorkspace()
    expect(elementIdSet(ws).has('cart')).toBe(true)
    expect(elementIdSet(ws).has('nope')).toBe(false)
    expect(elementNameMap(ws).get('web')).toBe('Web App')
  })
})

describe('missing-description collectors', () => {
  it('finds only elements without a description', () => {
    const ids = elementsMissingDescription(makeWorkspace()).map((e) => e.id)
    expect(ids).toEqual(['admin', 'cart', 'db'])
  })

  it('finds only relationships without a description', () => {
    const ids = relationshipsMissingDescription(makeWorkspace()).map((r) => r.id)
    expect(ids).toEqual(['r2'])
  })
})

describe('serializeContext', () => {
  it('id-tags every element and relationship line', () => {
    const text = serializeContext(makeWorkspace())
    expect(text).toContain('cust | person | Customer')
    expect(text).toContain('web | container | Web App | React')
    expect(text).toContain('r1 | Customer -> Web App | Browses')
    expect(text).toContain('r2 | Web App -> Database | (no description)')
  })

  it('handles a workspace with no relationships', () => {
    const ws = makeWorkspace()
    ws.model.relationships = []
    const text = serializeContext(ws)
    expect(text).toContain('RELATIONSHIPS')
    expect(text).toContain('(none)')
  })
})
