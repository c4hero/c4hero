import { describe, it, expect } from 'vitest'
import { isFocalScopeElement, getFocalScopeId, getActiveView, getScopeMemberIds } from './workspace-selectors'
import type { Workspace } from '@/types/model'

function ws(): Workspace {
  return {
    name: 'T',
    model: {
      people: [],
      softwareSystems: [
        { id: 'sys', type: 'softwareSystem', name: 'Sys', tags: [], properties: {},
          containers: [
            { id: 'c1', type: 'container', name: 'C1', tags: [], properties: {},
              components: [{ id: 'cmp1', type: 'component', name: 'Cmp', tags: [], properties: {} }] },
          ],
        },
      ],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [{ type: 'systemLandscape', key: 'land', elements: [], relationships: [] }],
      systemContextViews: [{ type: 'systemContext', key: 'ctx', softwareSystemId: 'sys', elements: [{ id: 'sys' }], relationships: [] }],
      containerViews: [{ type: 'container', key: 'cont', softwareSystemId: 'sys', elements: [{ id: 'c1' }], relationships: [] }],
      componentViews: [{ type: 'component', key: 'comp', containerId: 'c1', elements: [{ id: 'cmp1' }], relationships: [] }],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

describe('isFocalScopeElement', () => {
  it('returns false for a landscape view (no focal scope)', () => {
    expect(isFocalScopeElement(ws(), 'land', 'sys')).toBe(false)
  })
  it('flags the focal system on its system context view', () => {
    expect(isFocalScopeElement(ws(), 'ctx', 'sys')).toBe(true)
  })
  it('flags the focal system on its container view', () => {
    expect(isFocalScopeElement(ws(), 'cont', 'sys')).toBe(true)
  })
  it('does not flag a container on its parent system\'s container view', () => {
    expect(isFocalScopeElement(ws(), 'cont', 'c1')).toBe(false)
  })
  it('does not flag a non-scope element on a system context view', () => {
    expect(isFocalScopeElement(ws(), 'ctx', 'c1')).toBe(false)
  })
  it('flags the focal container on its component view', () => {
    expect(isFocalScopeElement(ws(), 'comp', 'c1')).toBe(true)
  })
  it('returns false for unknown view key', () => {
    expect(isFocalScopeElement(ws(), 'nope', 'sys')).toBe(false)
  })
})

describe('getScopeMemberIds', () => {
  it('returns the scoped system\'s containers for a container view', () => {
    expect(getScopeMemberIds(ws(), getActiveView(ws(), 'cont')!)).toEqual(new Set(['c1']))
  })
  it('returns the scoped container\'s components for a component view', () => {
    expect(getScopeMemberIds(ws(), getActiveView(ws(), 'comp')!)).toEqual(new Set(['cmp1']))
  })
  it('returns an empty set for landscape and context views', () => {
    expect(getScopeMemberIds(ws(), getActiveView(ws(), 'land')!).size).toBe(0)
    expect(getScopeMemberIds(ws(), getActiveView(ws(), 'ctx')!).size).toBe(0)
  })
})

describe('getFocalScopeId', () => {
  it('returns undefined for landscape views (no focal element)', () => {
    expect(getFocalScopeId(getActiveView(ws(), 'land'))).toBeUndefined()
  })
  it('returns the system id for system context views', () => {
    expect(getFocalScopeId(getActiveView(ws(), 'ctx'))).toBe('sys')
  })
  it('returns the system id for container views', () => {
    expect(getFocalScopeId(getActiveView(ws(), 'cont'))).toBe('sys')
  })
  it('returns the container id for component views', () => {
    expect(getFocalScopeId(getActiveView(ws(), 'comp'))).toBe('c1')
  })
  it('returns undefined when given undefined (no view)', () => {
    expect(getFocalScopeId(undefined)).toBeUndefined()
  })
})
