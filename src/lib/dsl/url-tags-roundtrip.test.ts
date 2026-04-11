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
})
