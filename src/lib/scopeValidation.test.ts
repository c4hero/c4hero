import { describe, it, expect } from 'vitest'
import { validateScope, scopeAllowsContainers, scopeLabel } from './scopeValidation'
import type { Workspace } from '@/types/model'

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    name: 'Test',
    model: {
      people: [],
      softwareSystems: [],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
    ...overrides,
  }
}

// ─── validateScope ───────────────────────────────────────────────────────────

describe('validateScope — no scope', () => {
  it('returns no violations for unscoped workspace', () => {
    const ws = makeWorkspace()
    expect(validateScope(ws)).toHaveLength(0)
  })

  it('returns no violations when scope is "none"', () => {
    const ws = makeWorkspace({ scope: 'none' })
    expect(validateScope(ws)).toHaveLength(0)
  })
})

describe('validateScope — landscape scope', () => {
  it('returns no violations when landscape scope has no containers', () => {
    const ws = makeWorkspace({
      scope: 'landscape',
      model: {
        people: [],
        softwareSystems: [
          { id: 'sys1', type: 'softwareSystem', name: 'System A', tags: [], properties: {}, containers: [] },
        ],
        relationships: [],
        groups: [],
      },
    })
    expect(validateScope(ws)).toHaveLength(0)
  })

  it('returns an error when landscape scope has containers', () => {
    const ws = makeWorkspace({
      scope: 'landscape',
      model: {
        people: [],
        softwareSystems: [
          {
            id: 'sys1', type: 'softwareSystem', name: 'System A', tags: [], properties: {},
            containers: [
              { id: 'c1', type: 'container', name: 'API', tags: [], properties: {}, components: [] },
            ],
          },
        ],
        relationships: [],
        groups: [],
      },
    })
    const violations = validateScope(ws)
    expect(violations).toHaveLength(1)
    expect(violations[0].type).toBe('error')
    expect(violations[0].message).toMatch(/containers/i)
  })
})

describe('validateScope — softwaresystem scope', () => {
  it('returns no violations when only one system has containers', () => {
    const ws = makeWorkspace({
      scope: 'softwaresystem',
      model: {
        people: [],
        softwareSystems: [
          {
            id: 'sys1', type: 'softwareSystem', name: 'Primary', tags: [], properties: {},
            containers: [{ id: 'c1', type: 'container', name: 'API', tags: [], properties: {}, components: [] }],
          },
          { id: 'sys2', type: 'softwareSystem', name: 'External', tags: [], properties: {}, containers: [] },
        ],
        relationships: [],
        groups: [],
      },
    })
    expect(validateScope(ws)).toHaveLength(0)
  })

  it('returns an error when multiple systems have containers', () => {
    const ws = makeWorkspace({
      scope: 'softwaresystem',
      model: {
        people: [],
        softwareSystems: [
          {
            id: 'sys1', type: 'softwareSystem', name: 'System A', tags: [], properties: {},
            containers: [{ id: 'c1', type: 'container', name: 'API', tags: [], properties: {}, components: [] }],
          },
          {
            id: 'sys2', type: 'softwareSystem', name: 'System B', tags: [], properties: {},
            containers: [{ id: 'c2', type: 'container', name: 'DB', tags: [], properties: {}, components: [] }],
          },
        ],
        relationships: [],
        groups: [],
      },
    })
    const violations = validateScope(ws)
    expect(violations).toHaveLength(1)
    expect(violations[0].type).toBe('error')
    expect(violations[0].message).toContain('System A')
    expect(violations[0].message).toContain('System B')
  })
})

// ─── scopeAllowsContainers ───────────────────────────────────────────────────

describe('scopeAllowsContainers', () => {
  it('returns false for landscape scope', () => {
    expect(scopeAllowsContainers('landscape')).toBe(false)
  })

  it('returns true for softwaresystem scope', () => {
    expect(scopeAllowsContainers('softwaresystem')).toBe(true)
  })

  it('returns true for undefined scope', () => {
    expect(scopeAllowsContainers(undefined)).toBe(true)
  })

  it('returns true for empty scope', () => {
    expect(scopeAllowsContainers('')).toBe(true)
  })
})

// ─── scopeLabel ───────────────────────────────────────────────────────────────

describe('scopeLabel', () => {
  it('returns "Software system" for softwaresystem', () => {
    expect(scopeLabel('softwaresystem')).toBe('Software system')
  })

  it('returns "System landscape" for landscape', () => {
    expect(scopeLabel('landscape')).toBe('System landscape')
  })

  it('returns "Unscoped" for undefined', () => {
    expect(scopeLabel(undefined)).toBe('Unscoped')
  })

  it('returns "Unscoped" for unknown values', () => {
    expect(scopeLabel('none')).toBe('Unscoped')
  })
})
