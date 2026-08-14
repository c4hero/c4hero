import { describe, expect, it } from 'vitest'
import { checkModelIntegrity } from './modelIntegrity'
import { makeWorkspace } from './ai/testFixture'
import type { Workspace } from '@/types/model'

/** Deep clone helper — keeps each test's mutation isolated from the shared fixture. */
function clone(ws: Workspace): Workspace {
  return JSON.parse(JSON.stringify(ws)) as Workspace
}

describe('checkModelIntegrity', () => {
  it('returns no violations for the intact fixture', () => {
    expect(checkModelIntegrity(makeWorkspace())).toEqual([])
  })

  it('(a) flags duplicate ids across elements/relationships', () => {
    const ws = clone(makeWorkspace())
    // Make the "admin" person share an id with the "shop" software system.
    ws.model.people[1].id = 'shop'
    const violations = checkModelIntegrity(ws)
    expect(violations.some(v => v.code === 'duplicate-id')).toBe(true)
  })

  it('(b) flags a relationship with a dangling source/destination', () => {
    const ws = clone(makeWorkspace())
    ws.model.relationships[0].sourceId = 'does-not-exist'
    const violations = checkModelIntegrity(ws)
    expect(violations).toEqual([
      expect.objectContaining({ code: 'dangling-relationship', relationshipId: 'r1' }),
    ])
  })

  it('(c) flags structural hierarchy damage — missing containers array', () => {
    const ws = clone(makeWorkspace())
    // @ts-expect-error deliberately corrupting the shape
    ws.model.softwareSystems[0].containers = null
    const violations = checkModelIntegrity(ws)
    expect(violations.some(v => v.code === 'malformed-containers')).toBe(true)
  })

  it('(c) flags structural hierarchy damage — missing components array', () => {
    const ws = clone(makeWorkspace())
    // @ts-expect-error deliberately corrupting the shape
    ws.model.softwareSystems[0].containers[0].components = 'not-an-array'
    const violations = checkModelIntegrity(ws)
    expect(violations.some(v => v.code === 'malformed-components')).toBe(true)
  })

  it('(c) flags non-object entries in containers/components arrays', () => {
    const ws = clone(makeWorkspace())
    // @ts-expect-error deliberately corrupting the shape
    ws.model.softwareSystems[0].containers.push('bogus')
    const violations = checkModelIntegrity(ws)
    expect(violations.some(v => v.code === 'malformed-container-entry')).toBe(true)
  })

  it('(d) flags an External software system that has containers', () => {
    const ws = clone(makeWorkspace())
    ws.model.softwareSystems[0].location = 'External'
    const violations = checkModelIntegrity(ws)
    expect(violations).toEqual([
      expect.objectContaining({ code: 'external-system-has-containers', elementId: 'shop' }),
    ])
  })

  it('(e) flags a view whose scope reference does not resolve', () => {
    const ws = clone(makeWorkspace())
    ws.views.systemContextViews.push({
      type: 'systemContext',
      key: 'ctx1',
      softwareSystemId: 'nope',
      elements: [],
      relationships: [],
    })
    const violations = checkModelIntegrity(ws)
    expect(violations).toEqual([
      expect.objectContaining({ code: 'bad-view-scope', viewKey: 'ctx1' }),
    ])
  })

  it('(e) flags a component view scoped to a software system instead of a container', () => {
    const ws = clone(makeWorkspace())
    ws.views.componentViews.push({
      type: 'component',
      key: 'comp1',
      containerId: 'shop', // wrong kind — should be a container id, not a software system id
      elements: [],
      relationships: [],
    })
    const violations = checkModelIntegrity(ws)
    expect(violations).toEqual([
      expect.objectContaining({ code: 'bad-view-scope', viewKey: 'comp1' }),
    ])
  })

  it('(e) flags a view element/relationship entry referencing a missing id', () => {
    const ws = clone(makeWorkspace())
    ws.views.containerViews.push({
      type: 'container',
      key: 'con1',
      softwareSystemId: 'shop',
      elements: [{ id: 'ghost' }],
      relationships: [{ id: 'ghost-rel' }],
    })
    const violations = checkModelIntegrity(ws)
    expect(violations.filter(v => v.code === 'dangling-view-ref')).toHaveLength(2)
    expect(violations.every(v => v.viewKey === 'con1')).toBe(true)
  })

  it('(f) flags an element whose tags is not a string array', () => {
    const ws = clone(makeWorkspace())
    // @ts-expect-error deliberately corrupting the shape
    ws.model.people[0].tags = 'not-an-array'
    const violations = checkModelIntegrity(ws)
    expect(violations).toEqual([
      expect.objectContaining({ code: 'bad-tags', elementId: 'cust' }),
    ])
  })

  it('(f) flags a relationship whose tags contains a non-string entry', () => {
    const ws = clone(makeWorkspace())
    // @ts-expect-error deliberately corrupting the shape
    ws.model.relationships[0].tags = ['ok', 42]
    const violations = checkModelIntegrity(ws)
    expect(violations).toEqual([
      expect.objectContaining({ code: 'bad-tags', relationshipId: 'r1' }),
    ])
  })

  it('never throws on a structurally mangled workspace and reports violations instead', () => {
    const ws = clone(makeWorkspace())
    // @ts-expect-error deliberately corrupting the shape at every level
    ws.model.softwareSystems[0].containers = null
    // @ts-expect-error deliberately corrupting the shape
    ws.model.relationships = 'nope'
    // @ts-expect-error deliberately corrupting the shape
    ws.views = undefined

    expect(() => checkModelIntegrity(ws)).not.toThrow()
    const violations = checkModelIntegrity(ws)
    expect(violations.some(v => v.code === 'malformed-containers')).toBe(true)
  })

  it('never throws on a completely empty/garbage workspace', () => {
    // @ts-expect-error deliberately testing a garbage top-level shape
    expect(() => checkModelIntegrity(null)).not.toThrow()
    // @ts-expect-error deliberately testing a garbage top-level shape
    expect(checkModelIntegrity(null)).toEqual([])
    // @ts-expect-error deliberately testing a garbage top-level shape
    expect(() => checkModelIntegrity({})).not.toThrow()
  })
})
