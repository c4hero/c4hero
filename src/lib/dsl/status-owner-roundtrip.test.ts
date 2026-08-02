/**
 * Tests verifying that `status` and `owner` element fields survive the
 * serialize → parse roundtrip. These fields were previously silently dropped
 * because neither the serializer emitted them nor the parser read them.
 */
import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import type { Workspace, Person, SoftwareSystem, Container, Component } from '@/types/model'

// ─── Parsing ──────────────────────────────────────────────────────────────────

describe('status parsing', () => {
  it('parses status Live from a person block', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice" {
      status Live
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.people[0].status).toBe('Live')
  })

  it('parses all valid status values', () => {
    for (const status of ['Live', 'Planned', 'Deprecated', 'Removed'] as const) {
      const dsl = `
workspace {
  model {
    sys = softwareSystem "App" {
      status ${status}
    }
  }
  views {}
}
`
      const { workspace, errors } = parseDSL(dsl)
      expect(errors).toHaveLength(0)
      expect(workspace.model.softwareSystems[0].status).toBe(status)
    }
  })

  it('ignores unknown status values without error', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "App" {
      status UnknownValue
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.softwareSystems[0].status).toBeUndefined()
  })
})

describe('owner parsing', () => {
  it('parses owner from a person block', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice" {
      owner "Platform Team"
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.people[0].owner).toBe('Platform Team')
  })

  it('parses owner from a softwareSystem block', () => {
    const dsl = `
workspace {
  model {
    api = softwareSystem "API" {
      owner "Backend Team"
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.softwareSystems[0].owner).toBe('Backend Team')
  })
})

// ─── Serialization ────────────────────────────────────────────────────────────

describe('status serialization', () => {
  function makeWs(patch: Partial<Person>): Workspace {
    return {
      name: 'Test',
      model: {
        people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {}, ...patch }],
        softwareSystems: [],
        relationships: [],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }
  }

  it('emits status as a c4hero.status property, not a bare status keyword', () => {
    // Real Structurizr rejects the bare `status` keyword inside an element
    // block, so it must be carried as a "c4hero.status" property instead.
    const dsl = serializeDSL(makeWs({ status: 'Live' }))
    expect(dsl).not.toMatch(/^\s*status\s/m)
    expect(dsl).toContain('"c4hero.status" "Live"')
    // Must be a block form (has braces) containing a properties block
    expect(dsl).toContain('properties {')
  })

  it('does not emit status when undefined', () => {
    const dsl = serializeDSL(makeWs({}))
    expect(dsl).not.toContain('status')
  })
})

describe('owner serialization', () => {
  function makeWs(patch: Partial<SoftwareSystem>): Workspace {
    return {
      name: 'Test',
      model: {
        people: [],
        softwareSystems: [{ id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'], properties: {}, containers: [], ...patch }],
        relationships: [],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }
  }

  it('emits owner as an "owner" property inside a properties block, not a bare keyword', () => {
    // Real Structurizr rejects the bare `owner` keyword inside an element
    // block, so it must be carried as an "owner" property instead.
    const dsl = serializeDSL(makeWs({ owner: 'Platform Team' }))
    expect(dsl).not.toMatch(/^\s*owner\s/m)
    expect(dsl).toContain('"owner" "Platform Team"')
    expect(dsl).toContain('properties {')
  })

  it('does not emit owner when undefined', () => {
    const dsl = serializeDSL(makeWs({}))
    expect(dsl).not.toContain('owner')
  })
})

// ─── Roundtrip ────────────────────────────────────────────────────────────────

describe('status roundtrip', () => {
  it('person status survives serialize → parse', () => {
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {}, status: 'Deprecated' }],
        softwareSystems: [],
        relationships: [],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const alice = parsed.model.people.find(p => p.name === 'Alice') as Person | undefined
    expect(alice?.status).toBe('Deprecated')
  })

  it('softwareSystem status survives serialize → parse', () => {
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [],
        softwareSystems: [{ id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'], properties: {}, containers: [], status: 'Live' }],
        relationships: [],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const app = parsed.model.softwareSystems.find(s => s.name === 'App') as SoftwareSystem | undefined
    expect(app?.status).toBe('Live')
  })

  it('container status survives serialize → parse', () => {
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [],
        softwareSystems: [{
          id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'], properties: {}, containers: [
            { id: 'api', type: 'container', name: 'API', tags: ['Element', 'Container'], properties: {}, components: [], status: 'Planned' },
          ],
        }],
        relationships: [],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const api = parsed.model.softwareSystems[0].containers.find(c => c.name === 'API') as Container | undefined
    expect(api?.status).toBe('Planned')
  })

  it('component status survives serialize → parse', () => {
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [],
        softwareSystems: [{
          id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'], properties: {}, containers: [{
            id: 'api', type: 'container', name: 'API', tags: ['Element', 'Container'], properties: {}, components: [
              { id: 'svc', type: 'component', name: 'Auth Service', tags: ['Element', 'Component'], properties: {}, status: 'Removed' },
            ],
          }],
        }],
        relationships: [],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const svc = parsed.model.softwareSystems[0].containers[0].components.find(c => c.name === 'Auth Service') as Component | undefined
    expect(svc?.status).toBe('Removed')
  })
})

describe('owner roundtrip', () => {
  it('person owner survives serialize → parse', () => {
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {}, owner: 'UX Team' }],
        softwareSystems: [],
        relationships: [],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const alice = parsed.model.people.find(p => p.name === 'Alice') as Person | undefined
    expect(alice?.owner).toBe('UX Team')
  })

  it('softwareSystem owner survives serialize → parse', () => {
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [],
        softwareSystems: [{ id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'], properties: {}, containers: [], owner: 'Platform Team' }],
        relationships: [],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const app = parsed.model.softwareSystems.find(s => s.name === 'App') as SoftwareSystem | undefined
    expect(app?.owner).toBe('Platform Team')
  })

  it('status and owner coexist on the same element', () => {
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [],
        softwareSystems: [{ id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'], properties: {}, containers: [], status: 'Live', owner: 'Backend Team' }],
        relationships: [],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const app = parsed.model.softwareSystems[0]
    expect(app.status).toBe('Live')
    expect(app.owner).toBe('Backend Team')
  })
})

// ─── Collision handling (reserved keys) ─────────────────────────────────────────

describe('reserved property key collisions', () => {
  it('idempotence: user property `owner` does not break serialization', () => {
    // Confirmed repro 1: a softwareSystem with properties: { owner: 'UserValue' }
    // (no element.owner field) should serialize idempotently.
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [],
        softwareSystems: [{
          id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'],
          properties: { owner: 'UserValue', z: '2' },
          containers: [],
        }],
        relationships: [],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }

    const dsl1 = serializeDSL(ws)
    const { workspace: parsed1 } = parseDSL(dsl1)
    const dsl2 = serializeDSL(parsed1)

    // Idempotence: second serialization must be identical to first
    expect(dsl2).toBe(dsl1)
  })

  it('idempotence: user property `c4hero.status` does not break serialization', () => {
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [],
        softwareSystems: [{
          id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'],
          properties: { 'c4hero.status': 'UserValue' },
          containers: [],
        }],
        relationships: [],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }

    const dsl1 = serializeDSL(ws)
    const { workspace: parsed1 } = parseDSL(dsl1)
    const dsl2 = serializeDSL(parsed1)

    expect(dsl2).toBe(dsl1)
  })

  it('derived `owner` field wins when both element.owner and user property `owner` exist', () => {
    // Confirmed repro 2: when both element.owner='RealOwner' and
    // properties: { owner: 'UserProp' } exist, the derived value must win
    // and the user value must not silently vanish.
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [],
        softwareSystems: [{
          id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'],
          properties: { owner: 'UserProp' },
          containers: [],
          owner: 'RealOwner',
        }],
        relationships: [],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }

    const dsl = serializeDSL(ws)

    // The derived owner field value should win
    expect(dsl).toContain('"owner" "RealOwner"')

    // After round-trip, the element.owner must be preserved
    const { workspace: parsed } = parseDSL(dsl)
    const app = parsed.model.softwareSystems[0]
    expect(app.owner).toBe('RealOwner')
  })

  it('derived `c4hero.status` field wins when both element.status and user property `c4hero.status` exist', () => {
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [],
        softwareSystems: [{
          id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'],
          properties: { 'c4hero.status': 'UserValue' },
          containers: [],
          status: 'Live',
        }],
        relationships: [],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }

    const dsl = serializeDSL(ws)

    // The derived status field value should win
    expect(dsl).toContain('"c4hero.status" "Live"')

    // After round-trip, the element.status must be preserved
    const { workspace: parsed } = parseDSL(dsl)
    const app = parsed.model.softwareSystems[0]
    expect(app.status).toBe('Live')
  })

  it('idempotence: user property `c4hero.lineStyle` does not break relationship serialization', () => {
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
        softwareSystems: [{
          id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'],
          properties: {},
          containers: [],
        }],
        relationships: [{
          id: 'rel1',
          sourceId: 'alice',
          destinationId: 'sys',
          description: 'Uses',
          tags: ['Relationship'],
          properties: { 'c4hero.lineStyle': 'UserValue' },
        }],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }

    const dsl1 = serializeDSL(ws)
    const { workspace: parsed1 } = parseDSL(dsl1)
    const dsl2 = serializeDSL(parsed1)

    expect(dsl2).toBe(dsl1)
  })

  it('idempotence: user property `c4hero.interactionStyle` does not break relationship serialization', () => {
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
        softwareSystems: [{
          id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'],
          properties: {},
          containers: [],
        }],
        relationships: [{
          id: 'rel1',
          sourceId: 'alice',
          destinationId: 'sys',
          description: 'Uses',
          tags: ['Relationship'],
          properties: { 'c4hero.interactionStyle': 'UserValue' },
        }],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }

    const dsl1 = serializeDSL(ws)
    const { workspace: parsed1 } = parseDSL(dsl1)
    const dsl2 = serializeDSL(parsed1)

    expect(dsl2).toBe(dsl1)
  })

  it('derived `c4hero.lineStyle` field wins when both relationship.lineStyle and user property exist', () => {
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
        softwareSystems: [{
          id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'],
          properties: {},
          containers: [],
        }],
        relationships: [{
          id: 'rel1',
          sourceId: 'alice',
          destinationId: 'sys',
          description: 'Uses',
          tags: ['Relationship'],
          properties: { 'c4hero.lineStyle': 'UserValue' },
          lineStyle: 'Dashed',
        }],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }

    const dsl = serializeDSL(ws)

    // The derived lineStyle field value should win
    expect(dsl).toContain('"c4hero.lineStyle" "Dashed"')
  })

  it('derived `c4hero.interactionStyle` field wins when both relationship.interactionStyle and user property exist', () => {
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
        softwareSystems: [{
          id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'],
          properties: {},
          containers: [],
        }],
        relationships: [{
          id: 'rel1',
          sourceId: 'alice',
          destinationId: 'sys',
          description: 'Uses',
          tags: ['Relationship'],
          properties: { 'c4hero.interactionStyle': 'UserValue' },
          interactionStyle: 'Synchronous',
        }],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }

    const dsl = serializeDSL(ws)

    // The derived interactionStyle field value should win
    expect(dsl).toContain('"c4hero.interactionStyle" "Synchronous"')
  })
})
