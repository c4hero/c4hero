/**
 * Tests verifying that `status` and `owner` element fields survive the
 * serialize → parse roundtrip. These fields were previously silently dropped
 * because neither the serializer emitted them nor the parser read them.
 */
import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import type { Workspace, Person, SoftwareSystem, Container, Component, Relationship } from '@/types/model'

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
    // Real Structurizr rejects a bare `status` keyword inside an element
    // block, so it travels as a "c4hero.status" property instead.
    const dsl = serializeDSL(makeWs({ status: 'Live' }))
    expect(dsl).not.toMatch(/^\s*status\s/m)
    expect(dsl).toContain('properties {')
    expect(dsl).toContain('"c4hero.status" "Live"')
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

  // `owner` is not a Structurizr keyword — a bare `owner "..."` line is a
  // parse error there. It travels as a property instead, and the parser
  // hoists it back onto the field.
  it('emits owner inside a properties block, not as a bare keyword', () => {
    const dsl = serializeDSL(makeWs({ owner: 'Platform Team' }))
    expect(dsl).toContain('properties {')
    expect(dsl).toContain('"owner" "Platform Team"')
    expect(dsl).not.toMatch(/^\s*owner "/m)
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

// ─── Reserved property key collisions ─────────────────────────────────────────

describe('reserved property key collisions', () => {
  function sysWs(sys: Partial<SoftwareSystem>): Workspace {
    return {
      name: 'Test',
      model: {
        people: [],
        softwareSystems: [{ id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'], properties: {}, containers: [], ...sys }],
        relationships: [],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }
  }

  function relWs(rel: Partial<Relationship>): Workspace {
    return {
      name: 'Test',
      model: {
        people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
        softwareSystems: [{ id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'], properties: {}, containers: [] }],
        relationships: [{ id: 'rel-1', sourceId: 'alice', destinationId: 'sys', description: 'Uses', tags: ['Relationship'], properties: {}, ...rel }],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }
  }

  it('idempotence: a user property `owner` with no owner field round-trips byte-identical', () => {
    const dsl1 = serializeDSL(sysWs({ properties: { owner: 'UserValue', z: '2' } }))
    const { workspace: parsed, errors } = parseDSL(dsl1)
    expect(errors).toHaveLength(0)
    expect(serializeDSL(parsed)).toBe(dsl1)
  })

  it('idempotence: a user property `c4hero.status` with no status field round-trips byte-identical', () => {
    // 'UserValue' is not a valid status enum member, so the parser must leave
    // it as a plain property rather than hoist (and then drop) it.
    const dsl1 = serializeDSL(sysWs({ properties: { 'c4hero.status': 'UserValue' } }))
    expect(dsl1).toContain('"c4hero.status" "UserValue"')
    const { workspace: parsed, errors } = parseDSL(dsl1)
    expect(errors).toHaveLength(0)
    expect(parsed.model.softwareSystems[0].status).toBeUndefined()
    expect(serializeDSL(parsed)).toBe(dsl1)
  })

  it('derived owner field wins over a colliding user property, byte-identically', () => {
    const dsl1 = serializeDSL(sysWs({ owner: 'RealOwner', properties: { owner: 'UserProp', z: '2' } }))
    expect(dsl1).toContain('"owner" "RealOwner"')
    expect(dsl1).not.toContain('UserProp')
    const { workspace: parsed, errors } = parseDSL(dsl1)
    expect(errors).toHaveLength(0)
    expect(parsed.model.softwareSystems[0].owner).toBe('RealOwner')
    expect(serializeDSL(parsed)).toBe(dsl1)
  })

  it('derived status field wins over a colliding user property, byte-identically', () => {
    const dsl1 = serializeDSL(sysWs({ status: 'Live', properties: { 'c4hero.status': 'UserValue' } }))
    expect(dsl1).toContain('"c4hero.status" "Live"')
    expect(dsl1).not.toContain('UserValue')
    const { workspace: parsed, errors } = parseDSL(dsl1)
    expect(errors).toHaveLength(0)
    expect(parsed.model.softwareSystems[0].status).toBe('Live')
    expect(serializeDSL(parsed)).toBe(dsl1)
  })

  it('idempotence: a user property `c4hero.lineStyle` with no lineStyle field round-trips byte-identical', () => {
    const dsl1 = serializeDSL(relWs({ properties: { 'c4hero.lineStyle': 'UserValue' } }))
    expect(dsl1).toContain('"c4hero.lineStyle" "UserValue"')
    const { workspace: parsed, errors } = parseDSL(dsl1)
    expect(errors).toHaveLength(0)
    expect(parsed.model.relationships[0].lineStyle).toBeUndefined()
    expect(serializeDSL(parsed)).toBe(dsl1)
  })

  it('derived lineStyle field wins over a colliding user property, byte-identically', () => {
    const dsl1 = serializeDSL(relWs({ lineStyle: 'Orthogonal', properties: { 'c4hero.lineStyle': 'UserValue' } }))
    expect(dsl1).toContain('"c4hero.lineStyle" "Orthogonal"')
    expect(dsl1).not.toContain('UserValue')
    const { workspace: parsed, errors } = parseDSL(dsl1)
    expect(errors).toHaveLength(0)
    expect(parsed.model.relationships[0].lineStyle).toBe('Orthogonal')
    expect(serializeDSL(parsed)).toBe(dsl1)
  })

  it('derived interactionStyle field wins over a colliding user property, byte-identically', () => {
    const dsl1 = serializeDSL(relWs({ interactionStyle: 'Synchronous', properties: { 'c4hero.interactionStyle': 'UserValue' } }))
    expect(dsl1).toContain('"c4hero.interactionStyle" "Synchronous"')
    expect(dsl1).not.toContain('UserValue')
    const { workspace: parsed, errors } = parseDSL(dsl1)
    expect(errors).toHaveLength(0)
    expect(parsed.model.relationships[0].interactionStyle).toBe('Synchronous')
    expect(serializeDSL(parsed)).toBe(dsl1)
  })

  it('round-trips byte-identical when a hoistable user property is not first in its block', () => {
    // The reserved key claims its leading slot even when supplied as a user
    // property: parsing hoists it onto the field and forgets its position,
    // so a positional emission would reorder the block on the second save.
    const dsl1 = serializeDSL(sysWs({ properties: { z: '2', owner: 'UserValue' } }))
    const { workspace: parsed, errors } = parseDSL(dsl1)
    expect(errors).toHaveLength(0)
    expect(parsed.model.softwareSystems[0].owner).toBe('UserValue')
    expect(serializeDSL(parsed)).toBe(dsl1)
  })

  it('round-trips byte-identical when a hoistable relationship property is not first', () => {
    const dsl1 = serializeDSL(relWs({ properties: { other: 'x', 'c4hero.lineStyle': 'Curved' } }))
    const { workspace: parsed, errors } = parseDSL(dsl1)
    expect(errors).toHaveLength(0)
    expect(parsed.model.relationships[0].lineStyle).toBe('Curved')
    expect(serializeDSL(parsed)).toBe(dsl1)
  })

  it('legacy bare status keyword wins over the property form when both appear', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "App" {
      status Planned
      properties {
        "c4hero.status" "Live"
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.softwareSystems[0].status).toBe('Planned')
  })

  it('hoists a valid c4hero.status property onto the status field', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "App" {
      properties {
        "c4hero.status" "Deprecated"
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const app = workspace.model.softwareSystems[0]
    expect(app.status).toBe('Deprecated')
    expect(app.properties['c4hero.status']).toBeUndefined()
  })
})
