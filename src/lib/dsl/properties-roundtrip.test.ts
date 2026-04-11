import { describe, it, expect } from 'vitest'
import { serializeDSL, parseDSL } from '@/lib/dsl'
import type { Workspace } from '@/types/model'

function makeWsWithProperties(): Workspace {
  return {
    name: 'PropTest',
    model: {
      people: [
        {
          id: 'alice', type: 'person', name: 'Alice', tags: ['Person'], properties: {
            'team': 'Platform',
            'slack': '#platform',
          },
        },
      ],
      softwareSystems: [
        {
          id: 'api', type: 'softwareSystem', name: 'API', tags: ['Software System'],
          properties: { 'domain': 'payments' },
          containers: [
            {
              id: 'web', type: 'container', name: 'Web App', tags: ['Container'],
              properties: { 'language': 'TypeScript' },
              components: [
                {
                  id: 'auth', type: 'component', name: 'Auth', tags: ['Component'],
                  properties: { 'layer': 'service' },
                },
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
}

describe('relationship properties roundtrip', () => {
  it('relationship properties survive serialize → parse', () => {
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Person'], properties: {} }],
        softwareSystems: [{ id: 'api', type: 'softwareSystem', name: 'API', tags: ['Software System'], properties: {}, containers: [] }],
        relationships: [
          {
            id: 'rel1', sourceId: 'alice', destinationId: 'api',
            description: 'calls', tags: ['Relationship'],
            properties: { 'protocol': 'HTTPS', 'sla': '99.9%' },
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
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('"protocol" "HTTPS"')
    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    const rel = parsed.workspace?.model.relationships[0]
    expect(rel?.properties['protocol']).toBe('HTTPS')
    expect(rel?.properties['sla']).toBe('99.9%')
  })
})

describe('element properties roundtrip', () => {
  it('person properties survive serialize → parse', () => {
    const ws = makeWsWithProperties()
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('"team" "Platform"')
    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    const alice = parsed.workspace?.model.people[0]
    expect(alice?.properties['team']).toBe('Platform')
    expect(alice?.properties['slack']).toBe('#platform')
  })

  it('softwareSystem properties survive serialize → parse', () => {
    const ws = makeWsWithProperties()
    const dsl = serializeDSL(ws)
    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    const api = parsed.workspace?.model.softwareSystems[0]
    expect(api?.properties['domain']).toBe('payments')
  })

  it('container properties survive serialize → parse', () => {
    const ws = makeWsWithProperties()
    const dsl = serializeDSL(ws)
    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    const container = parsed.workspace?.model.softwareSystems[0].containers[0]
    expect(container?.properties['language']).toBe('TypeScript')
  })

  it('component properties survive serialize → parse', () => {
    const ws = makeWsWithProperties()
    const dsl = serializeDSL(ws)
    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    const comp = parsed.workspace?.model.softwareSystems[0].containers[0].components[0]
    expect(comp?.properties['layer']).toBe('service')
  })

  it('elements without properties emit no properties block', () => {
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [{ id: 'bob', type: 'person', name: 'Bob', tags: ['Person'], properties: {} }],
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
    const dsl = serializeDSL(ws)
    expect(dsl).not.toContain('properties {')
  })
})
