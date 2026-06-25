import { describe, it, expect } from 'vitest'
import {
  flattenElements, elementIdSet, elementNameMap, serializeContext,
  elementsMissingDescription, relationshipsMissingDescription,
  serializeViewContext, viewLabel, describeAllowedTypes,
} from './context'
import { makeWorkspace } from './testFixture'
import type { View } from '@/types/model'

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

describe('viewLabel / serializeViewContext', () => {
  const view: View = {
    type: 'container', key: 'cont-shop', title: 'Containers', softwareSystemId: 'shop',
    elements: [{ id: 'web' }, { id: 'db' }],
    relationships: [{ id: 'r2' }],
  }

  it('labels the view by type and title', () => {
    expect(viewLabel(view)).toBe('Container view “Containers”')
  })

  it('includes only on-screen elements and their relationships', () => {
    const text = serializeViewContext(makeWorkspace(), view)
    expect(text).toContain('Container view “Containers”')
    expect(text).toContain('Scope element: Shop (shop)')
    expect(text).toContain('web | container | Web App')
    expect(text).toContain('db | container | Database')
    // 'cust' is not in the view, so it must not appear in the on-screen list.
    expect(text).not.toContain('cust | person')
    // r2 connects web -> db, both on screen.
    expect(text).toContain('r2 | Web App -> Database')
  })

  it('reports an empty view', () => {
    const empty: View = { type: 'systemLandscape', key: 'l', elements: [], relationships: [] }
    expect(serializeViewContext(makeWorkspace(), empty)).toContain('the view is empty')
  })
})

describe('describeAllowedTypes', () => {
  const ws = makeWorkspace()

  it('allows people + systems but not containers/components in a context view', () => {
    const text = describeAllowedTypes(ws, { type: 'systemContext', key: 'ctx', softwareSystemId: 'shop', elements: [], relationships: [] })
    expect(text).toContain('System Context view')
    expect(text).toContain('“Shop”')
    expect(text).toMatch(/NOT allowed: containers or components/)
  })

  it('allows containers (scoped to the system) in a container view', () => {
    const text = describeAllowedTypes(ws, { type: 'container', key: 'cont', softwareSystemId: 'shop', elements: [], relationships: [] })
    expect(text).toContain('Container view')
    expect(text).toContain('id shop')
    expect(text).toMatch(/NOT allowed: components/)
  })

  it('allows only components (scoped to the container) in a component view', () => {
    const text = describeAllowedTypes(ws, { type: 'component', key: 'cmp', containerId: 'web', elements: [], relationships: [] })
    expect(text).toContain('Component view')
    expect(text).toContain('id web')
    expect(text).toMatch(/NOT allowed: people, software systems, or containers/)
  })

  it('allows people + systems in a landscape view', () => {
    const text = describeAllowedTypes(ws, { type: 'systemLandscape', key: 'land', elements: [], relationships: [] })
    expect(text).toContain('System Landscape view')
    expect(text).toMatch(/NOT allowed: containers or components/)
  })
})
