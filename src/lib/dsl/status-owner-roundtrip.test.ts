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

  it('emits status keyword without quotes', () => {
    const dsl = serializeDSL(makeWs({ status: 'Live' }))
    expect(dsl).toContain('status Live')
    // Must be a block form (has braces)
    expect(dsl).toContain('{')
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

  it('emits owner as quoted string', () => {
    const dsl = serializeDSL(makeWs({ owner: 'Platform Team' }))
    expect(dsl).toContain('owner "Platform Team"')
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
