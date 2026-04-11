import { describe, it, expect } from 'vitest'
import { serializeDSL, parseDSL } from '@/lib/dsl'
import type { Workspace, Relationship } from '@/types/model'

function makeWs(overrides: Partial<Relationship> = {}): Workspace {
  return {
    name: 'test',
    model: {
      people: [
        { id: 'user', type: 'person', name: 'User', tags: ['Person'], properties: {} },
      ],
      softwareSystems: [
        { id: 'api', type: 'softwareSystem', name: 'API', tags: ['Software System'], properties: {}, containers: [] },
      ],
      relationships: [
        {
          id: 'rel-1',
          sourceId: 'user',
          destinationId: 'api',
          description: 'Uses',
          technology: 'REST',
          tags: [],
          properties: {},
          ...overrides,
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

describe('interactionStyle roundtrip', () => {
  it('Asynchronous survives serialize → parse', () => {
    const ws = makeWs({ interactionStyle: 'Asynchronous' })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('interactionStyle Asynchronous')
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0] as Relationship | undefined
    expect(rel?.interactionStyle).toBe('Asynchronous')
  })

  it('Synchronous survives serialize → parse', () => {
    const ws = makeWs({ interactionStyle: 'Synchronous' })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('interactionStyle Synchronous')
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0] as Relationship | undefined
    expect(rel?.interactionStyle).toBe('Synchronous')
  })

  it('undefined interactionStyle emits no block', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    expect(dsl).not.toContain('interactionStyle')
    // Inline form: no braces around the relationship
    expect(dsl).toMatch(/user -> api "Uses" "REST"/)
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0] as Relationship | undefined
    expect(rel?.interactionStyle).toBeUndefined()
  })
})

describe('relationship url roundtrip', () => {
  it('url serializes into a block and parses back', () => {
    const ws = makeWs({ url: 'https://docs.example.com/api' })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('url "https://docs.example.com/api"')
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0] as Relationship | undefined
    expect(rel?.url).toBe('https://docs.example.com/api')
  })

  it('url and interactionStyle both survive roundtrip', () => {
    const ws = makeWs({ url: 'https://example.com', interactionStyle: 'Asynchronous' })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('url "https://example.com"')
    expect(dsl).toContain('interactionStyle Asynchronous')
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0] as Relationship | undefined
    expect(rel?.url).toBe('https://example.com')
    expect(rel?.interactionStyle).toBe('Asynchronous')
  })

  it('no url — no block emitted (inline form stays compact)', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    expect(dsl).not.toContain('url')
    // Inline form: no braces, no url block
    expect(dsl).toMatch(/user -> api "Uses" "REST"/)
  })
})
