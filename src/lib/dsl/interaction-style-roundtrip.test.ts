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

describe('relationship technology-only roundtrip', () => {
  it('technology without description roundtrips correctly', () => {
    // Bug guard: if technology is serialized without an explicit empty description,
    // the parser reads it as description instead. The serializer must emit "" first.
    const ws = makeWs({ description: undefined, technology: 'HTTPS' })
    const dsl = serializeDSL(ws)
    // Should emit empty description slot so technology lands in the right position
    expect(dsl).toMatch(/user -> api "" "HTTPS"/)
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0] as Relationship | undefined
    expect(rel?.technology).toBe('HTTPS')
    expect(rel?.description ?? '').toBe('')
  })

  it('description and technology both roundtrip intact', () => {
    const ws = makeWs({ description: 'Calls', technology: 'gRPC' })
    const dsl = serializeDSL(ws)
    expect(dsl).toMatch(/user -> api "Calls" "gRPC"/)
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0] as Relationship | undefined
    expect(rel?.description).toBe('Calls')
    expect(rel?.technology).toBe('gRPC')
  })
})

describe('relationship lineStyle roundtrip', () => {
  it('Curved serializes and parses back', () => {
    const ws = makeWs({ lineStyle: 'Curved' })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('lineStyle Curved')
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0] as Relationship | undefined
    expect(rel?.lineStyle).toBe('Curved')
  })

  it('Orthogonal serializes and parses back', () => {
    const ws = makeWs({ lineStyle: 'Orthogonal' })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('lineStyle Orthogonal')
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0] as Relationship | undefined
    expect(rel?.lineStyle).toBe('Orthogonal')
  })

  it('Straight serializes and parses back', () => {
    const ws = makeWs({ lineStyle: 'Straight' })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('lineStyle Straight')
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0] as Relationship | undefined
    expect(rel?.lineStyle).toBe('Straight')
  })

  it('undefined lineStyle emits no block (stays inline)', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    expect(dsl).not.toContain('lineStyle')
    expect(dsl).toMatch(/user -> api "Uses" "REST"/)
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0] as Relationship | undefined
    expect(rel?.lineStyle).toBeUndefined()
  })

  it('lineStyle and interactionStyle both survive roundtrip', () => {
    const ws = makeWs({ lineStyle: 'Curved', interactionStyle: 'Asynchronous' })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('lineStyle Curved')
    expect(dsl).toContain('interactionStyle Asynchronous')
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0] as Relationship | undefined
    expect(rel?.lineStyle).toBe('Curved')
    expect(rel?.interactionStyle).toBe('Asynchronous')
  })
})

describe('relationship description and technology as block keywords', () => {
  it('description keyword inside block overrides inline positional description', () => {
    // Some Structurizr DSL files use keyword form inside blocks instead of positional form.
    // c4hero's serializer always uses positional, but the parser must handle both for compat.
    const dsl = `
workspace {
  model {
    user = person "User"
    api = softwareSystem "API"
    user -> api "Calls" {
      description "Detailed description"
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0]
    expect(rel?.description).toBe('Detailed description')
  })

  it('technology keyword inside block is parsed', () => {
    const dsl = `
workspace {
  model {
    user = person "User"
    api = softwareSystem "API"
    user -> api {
      technology "REST/HTTPS"
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0]
    expect(rel?.technology).toBe('REST/HTTPS')
  })

  it('description and technology both as block keywords', () => {
    const dsl = `
workspace {
  model {
    user = person "User"
    api = softwareSystem "API"
    user -> api {
      description "Sends requests"
      technology "gRPC"
      interactionStyle Asynchronous
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0]
    expect(rel?.description).toBe('Sends requests')
    expect(rel?.technology).toBe('gRPC')
    expect(rel?.interactionStyle).toBe('Asynchronous')
  })
})
