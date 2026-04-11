import { describe, it, expect } from 'vitest'
import { serializeDSL, parseDSL } from '@/lib/dsl'
import type { Workspace } from '@/types/model'

function makeWs(): Workspace {
  return {
    name: 'test',
    model: {
      people: [
        { id: 'alice', type: 'person', name: 'Alice', tags: ['Person'], properties: {}, url: 'https://example.com/alice' },
      ],
      softwareSystems: [
        {
          id: 'api', type: 'softwareSystem', name: 'API', tags: ['Software System'], properties: {},
          url: 'https://example.com/api',
          containers: [
            {
              id: 'web', type: 'container', name: 'Web', tags: ['Container'], properties: {},
              url: 'https://example.com/web',
              components: [
                { id: 'ctrl', type: 'component', name: 'Controller', tags: ['Component'], properties: {}, url: 'https://example.com/ctrl' },
              ],
            },
          ],
        },
      ],
      relationships: [
        {
          id: 'rel-1', sourceId: 'alice', destinationId: 'api',
          description: 'Uses', technology: 'HTTPS',
          tags: ['Relationship', 'Primary'],
          properties: {},
        },
        {
          id: 'rel-2', sourceId: 'alice', destinationId: 'api',
          tags: ['Relationship', 'Secondary'],
          properties: {},
          interactionStyle: 'Asynchronous',
        },
      ],
      groups: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

describe('element URL roundtrip', () => {
  it('person url survives serialize → parse', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('url "https://example.com/alice"')
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const alice = workspace.model.people.find(p => p.name === 'Alice')
    expect(alice?.url).toBe('https://example.com/alice')
  })

  it('softwareSystem url survives serialize → parse', () => {
    const ws = makeWs()
    const { workspace, errors } = parseDSL(serializeDSL(ws))
    expect(errors).toEqual([])
    const api = workspace.model.softwareSystems.find(s => s.name === 'API')
    expect(api?.url).toBe('https://example.com/api')
  })

  it('container url survives serialize → parse', () => {
    const ws = makeWs()
    const { workspace, errors } = parseDSL(serializeDSL(ws))
    expect(errors).toEqual([])
    const web = workspace.model.softwareSystems[0].containers.find(c => c.name === 'Web')
    expect(web?.url).toBe('https://example.com/web')
  })

  it('component url survives serialize → parse', () => {
    const ws = makeWs()
    const { workspace, errors } = parseDSL(serializeDSL(ws))
    expect(errors).toEqual([])
    const ctrl = workspace.model.softwareSystems[0].containers[0].components.find(c => c.name === 'Controller')
    expect(ctrl?.url).toBe('https://example.com/ctrl')
  })
})

describe('relationship tag roundtrip', () => {
  it('inline extra tags survive serialize → parse (no interactionStyle)', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    // rel-1 has tag 'Primary' (beyond default 'Relationship') and no interactionStyle → inline
    expect(dsl).toMatch(/alice -> api.*"Primary"/)
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships.find(r => r.tags.includes('Primary'))
    expect(rel).toBeDefined()
    expect(rel?.tags).toContain('Primary')
  })

  it('block extra tags survive serialize → parse (with interactionStyle)', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    // rel-2 has tag 'Secondary' and interactionStyle Asynchronous → block form
    expect(dsl).toContain('interactionStyle Asynchronous')
    expect(dsl).toContain('tags "Secondary"')
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships.find(r => r.tags.includes('Secondary'))
    expect(rel).toBeDefined()
    expect(rel?.tags).toContain('Secondary')
    expect(rel?.interactionStyle).toBe('Asynchronous')
  })

  it('built-in Relationship tag is always present after parse', () => {
    // The serializer strips 'Relationship' (built-in) before emitting, so the parser
    // must always add it back. Without this, style lookups for tag 'Relationship' fail
    // after a DSL reload.
    const dsl = `
workspace "test" {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
    alice -> api "Uses"
  }
  views { }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0]
    expect(rel?.tags).toContain('Relationship')
  })

  it('Relationship tag appears exactly once even if explicitly listed in DSL', () => {
    // Guard against double-adding if someone writes 'Relationship' in the inline tags arg
    const dsl = `
workspace "test" {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
    alice -> api "Uses" "" "Relationship,Custom"
  }
  views { }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0]
    const relTagCount = rel?.tags.filter(t => t === 'Relationship').length ?? 0
    expect(relTagCount).toBe(1)
    expect(rel?.tags).toContain('Custom')
  })
})

describe('element custom tag roundtrip', () => {
  it('person custom tag survives serialize → parse', () => {
    const ws: Workspace = {
      name: 'test',
      model: {
        people: [
          { id: 'p1', type: 'person', name: 'Staff', tags: ['Element', 'Person', 'Employee'], properties: {} },
        ],
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
    }
    const { workspace, errors } = parseDSL(serializeDSL(ws))
    expect(errors).toEqual([])
    const person = workspace.model.people.find(p => p.name === 'Staff')
    expect(person?.tags).toContain('Employee')
    expect(person?.tags).toContain('Person')
  })

  it('softwareSystem custom tag survives serialize → parse', () => {
    const ws: Workspace = {
      name: 'test',
      model: {
        people: [],
        softwareSystems: [
          { id: 'sys', type: 'softwareSystem', name: 'Payments', tags: ['Element', 'Software System', 'External'], properties: {}, containers: [] },
        ],
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
    }
    const { workspace, errors } = parseDSL(serializeDSL(ws))
    expect(errors).toEqual([])
    const sys = workspace.model.softwareSystems.find(s => s.name === 'Payments')
    expect(sys?.tags).toContain('External')
    expect(sys?.tags).toContain('Software System')
  })

  it('container custom tag survives serialize → parse', () => {
    const ws: Workspace = {
      name: 'test',
      model: {
        people: [],
        softwareSystems: [
          {
            id: 'sys', type: 'softwareSystem', name: 'System', tags: ['Element', 'Software System'], properties: {},
            containers: [
              { id: 'db', type: 'container', name: 'DB', tags: ['Element', 'Container', 'Database'], properties: {}, components: [] },
            ],
          },
        ],
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
    }
    const { workspace, errors } = parseDSL(serializeDSL(ws))
    expect(errors).toEqual([])
    const db = workspace.model.softwareSystems[0].containers.find(c => c.name === 'DB')
    expect(db?.tags).toContain('Database')
    expect(db?.tags).toContain('Container')
  })

  it('component custom tag survives serialize → parse', () => {
    const ws: Workspace = {
      name: 'test',
      model: {
        people: [],
        softwareSystems: [
          {
            id: 'sys', type: 'softwareSystem', name: 'System', tags: ['Element', 'Software System'], properties: {},
            containers: [
              {
                id: 'api', type: 'container', name: 'API', tags: ['Element', 'Container'], properties: {},
                components: [
                  { id: 'ctrl', type: 'component', name: 'Controller', tags: ['Element', 'Component', 'Spring MVC'], properties: {} },
                ],
              },
            ],
          },
        ],
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
    }
    const { workspace, errors } = parseDSL(serializeDSL(ws))
    expect(errors).toEqual([])
    const ctrl = workspace.model.softwareSystems[0].containers[0].components.find(c => c.name === 'Controller')
    expect(ctrl?.tags).toContain('Spring MVC')
    expect(ctrl?.tags).toContain('Component')
  })

  it('multiple custom tags on a single element all survive serialize → parse', () => {
    const ws: Workspace = {
      name: 'test',
      model: {
        people: [],
        softwareSystems: [
          {
            id: 'sys', type: 'softwareSystem', name: 'System', tags: ['Element', 'Software System'], properties: {},
            containers: [
              { id: 'q', type: 'container', name: 'Queue', tags: ['Element', 'Container', 'MessageBus', 'Async'], properties: {}, components: [] },
            ],
          },
        ],
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
    }
    const { workspace, errors } = parseDSL(serializeDSL(ws))
    expect(errors).toEqual([])
    const q = workspace.model.softwareSystems[0].containers.find(c => c.name === 'Queue')
    expect(q?.tags).toContain('MessageBus')
    expect(q?.tags).toContain('Async')
  })
})
