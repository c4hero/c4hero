import { describe, it, expect } from 'vitest'
import { serializeDSL, parseDSL } from './index'
import type { Workspace, View } from '@/types/model'

function makeWs(): Workspace {
  return {
    name: 'Test', description: '',
    model: {
      people: [{ id: 'abc-123', name: 'User', type: 'person', tags: ['Element','Person'], properties: {} }],
      softwareSystems: [{ id: 'xyz-456', name: 'My App', description: '', tags: ['Element','Software System'], properties: {}, containers: [] }],
      relationships: [{
        id: 'rel-1', sourceId: 'abc-123', destinationId: 'xyz-456',
        description: 'uses', technology: '', tags: ['Relationship'], properties: {}
      }],
      groups: [], deploymentEnvironments: []
    },
    views: {
      systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } }
    }
  }
}

describe('DSL relationship round-trip', () => {
  it('preserves relationships through serialize → parse', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(parsed.model.relationships).toHaveLength(1)
    const rel = parsed.model.relationships[0]
    expect(rel.sourceId).toBe(parsed.model.people[0].id)
    expect(rel.destinationId).toBe(parsed.model.softwareSystems[0].id)
  })

  it('view element IDs are consistent with model element IDs after parse', () => {
    const ws = makeWs()
    ws.views.systemLandscapeViews.push({
      key: 'landscape', title: 'Landscape', type: 'systemLandscape',
      elements: [{ id: 'abc-123' }, { id: 'xyz-456' }],
      relationships: [], autoLayout: null
    } as View)
    const dsl = serializeDSL(ws)
    const { workspace: parsed } = parseDSL(dsl)
    const view = parsed.views.systemLandscapeViews[0]
    const personId = parsed.model.people[0].id
    const sysId = parsed.model.softwareSystems[0].id
    // After round-trip, element IDs in view must match model IDs (both are var-name based)
    expect(view.elements.map(e => e.id)).toContain(personId)
    expect(view.elements.map(e => e.id)).toContain(sysId)
  })

  it('view relationships are populated after parse', () => {
    const ws = makeWs()
    ws.views.systemLandscapeViews.push({
      key: 'sl1', title: 'Landscape', type: 'systemLandscape',
      elements: [{ id: 'abc-123' }, { id: 'xyz-456' }],
      relationships: [],
      autoLayout: null
    } as View)
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = parsed.views.systemLandscapeViews[0]
    expect(view).toBeDefined()
    expect(view.relationships.length).toBe(1)
    // rel sourceId/destinationId must match parsed element IDs
    const rel = view.relationships[0]
    const modelRel = parsed.model.relationships.find(r => r.id === rel.id)
    expect(modelRel).toBeDefined()
    const personId = parsed.model.people[0].id
    const sysId = parsed.model.softwareSystems[0].id
    expect(modelRel!.sourceId).toBe(personId)
    expect(modelRel!.destinationId).toBe(sysId)
  })

  it('preserves messy relationship metadata through serialize → parse', () => {
    const ws = makeWs()
    ws.model.people[0].tags.push('Ops Reviewer')
    ws.model.softwareSystems[0].description = 'Charges cards, retries jobs, and owns awkward whitespace'
    ws.model.relationships[0] = {
      ...ws.model.relationships[0],
      description: 'retries_failed_jobs_after_manual_review',
      technology: 'KafkaProtocolBufferEnvelopeWithVersionNegotiation',
      interactionStyle: 'Asynchronous',
      lineStyle: 'Orthogonal',
      url: 'https://example.com/runbooks/retries',
      tags: ['Relationship', 'Critical Path'],
    }
    ws.views.systemLandscapeViews.push({
      key: 'sl1', title: 'Messy Landscape', type: 'systemLandscape',
      elements: [{ id: 'abc-123' }, { id: 'xyz-456' }],
      relationships: [{ id: 'rel-1' }],
      autoLayout: { direction: 'LR' }
    } as View)

    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)

    expect(parsed.model.people[0].tags).toContain('Ops Reviewer')
    expect(parsed.model.softwareSystems[0].description).toBe('Charges cards, retries jobs, and owns awkward whitespace')
    expect(parsed.model.relationships[0]).toMatchObject({
      description: 'retries_failed_jobs_after_manual_review',
      technology: 'KafkaProtocolBufferEnvelopeWithVersionNegotiation',
      interactionStyle: 'Asynchronous',
      lineStyle: 'Orthogonal',
      url: 'https://example.com/runbooks/retries',
    })
    expect(parsed.model.relationships[0].tags).toEqual(expect.arrayContaining(['Relationship', 'Critical Path']))
    expect(parsed.views.systemLandscapeViews[0].autoLayout?.direction).toBe('LR')
  })

})

// ─── Big Bank Round-trip ──────────────────────────────────────────────

describe('Big Bank round-trip', () => {
  function makeBigBankWorkspace(): Workspace {
    return {
      name: 'Big Bank plc',
      description: 'Banking system architecture',
      model: {
        people: [
          {
            id: 'customer',
            type: 'person',
            name: 'Personal Banking Customer',
            description: 'A customer of the bank',
            tags: ['Element', 'Person'],
            properties: {},
          },
        ],
        softwareSystems: [
          {
            id: 'internetBanking',
            type: 'softwareSystem',
            name: 'Internet Banking System',
            description: 'Allows customers to view bank accounts',
            tags: ['Element', 'Software System'],
            properties: {},
            containers: [
              {
                id: 'webApp',
                type: 'container',
                name: 'Web Application',
                description: 'Frontend',
                technology: 'React',
                tags: ['Element', 'Container'],
                properties: {},
                components: [],
              },
              {
                id: 'apiApp',
                type: 'container',
                name: 'API Application',
                description: 'Backend API',
                technology: 'Java',
                tags: ['Element', 'Container'],
                properties: {},
                components: [],
              },
            ],
          },
          {
            id: 'emailSystem',
            type: 'softwareSystem',
            name: 'E-mail System',
            description: 'Microsoft Exchange',
            tags: ['Element', 'Software System'],
            properties: {},
            containers: [],
          },
          {
            id: 'smsSystem',
            type: 'softwareSystem',
            name: 'SMS System',
            description: 'External SMS provider',
            tags: ['Element', 'Software System'],
            properties: {},
            containers: [],
          },
          {
            id: 'mainframe',
            type: 'softwareSystem',
            name: 'Mainframe Banking System',
            description: 'Core banking system',
            tags: ['Element', 'Software System'],
            properties: {},
            containers: [],
          },
        ],
        relationships: [
          {
            id: 'rel-1',
            sourceId: 'customer',
            destinationId: 'internetBanking',
            description: 'Views account balances using',
            technology: 'HTTPS',
            tags: ['Relationship'],
            properties: {},
          },
          {
            id: 'rel-2',
            sourceId: 'internetBanking',
            destinationId: 'emailSystem',
            description: 'Sends email using',
            tags: ['Relationship'],
            properties: {},
          },
          {
            id: 'rel-3',
            sourceId: 'internetBanking',
            destinationId: 'smsSystem',
            description: 'Sends SMS using',
            tags: ['Relationship'],
            properties: {},
          },
          {
            id: 'rel-4',
            sourceId: 'internetBanking',
            destinationId: 'mainframe',
            description: 'Gets account info from',
            tags: ['Relationship'],
            properties: {},
          },
          {
            id: 'rel-5',
            sourceId: 'emailSystem',
            destinationId: 'customer',
            description: 'Sends email to',
            tags: ['Relationship'],
            properties: {},
          },
          {
            id: 'rel-6',
            sourceId: 'webApp',
            destinationId: 'apiApp',
            description: 'Calls API via',
            technology: 'JSON/HTTPS',
            tags: ['Relationship'],
            properties: {},
          },
        ],
        groups: [],
      },
      views: {
        systemContextViews: [
          {
            type: 'systemContext',
            key: 'SystemContext',
            title: 'System Context',
            softwareSystemId: 'internetBanking',
            elements: [{ id: '*' }],
            relationships: [],
          },
        ],
        containerViews: [
          {
            type: 'container',
            key: 'Containers',
            title: 'Container View',
            softwareSystemId: 'internetBanking',
            elements: [{ id: 'webApp' }, { id: 'apiApp' }],
            relationships: [{ id: 'rel-6' }],
          },
        ],
        systemLandscapeViews: [],
        componentViews: [],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
  }

  it('serialize → parse produces no errors', () => {
    const ws = makeBigBankWorkspace()
    const dsl = serializeDSL(ws)
    const { errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
  })

  it('preserves people count after round-trip', () => {
    const ws = makeBigBankWorkspace()
    const dsl = serializeDSL(ws)
    const { workspace: parsed } = parseDSL(dsl)
    expect(parsed.model.people).toHaveLength(ws.model.people.length)
  })

  it('preserves software system count after round-trip', () => {
    const ws = makeBigBankWorkspace()
    const dsl = serializeDSL(ws)
    const { workspace: parsed } = parseDSL(dsl)
    expect(parsed.model.softwareSystems).toHaveLength(ws.model.softwareSystems.length)
  })

  it('preserves relationship count after round-trip', () => {
    const ws = makeBigBankWorkspace()
    const dsl = serializeDSL(ws)
    const { workspace: parsed } = parseDSL(dsl)
    expect(parsed.model.relationships).toHaveLength(ws.model.relationships.length)
  })

  it('produces no duplicate element IDs after round-trip', () => {
    const ws = makeBigBankWorkspace()
    const dsl = serializeDSL(ws)
    const { workspace: parsed } = parseDSL(dsl)

    const ids: string[] = []
    for (const p of parsed.model.people) ids.push(p.id)
    for (const sys of parsed.model.softwareSystems) {
      ids.push(sys.id)
      for (const c of sys.containers) ids.push(c.id)
    }
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('container view elements are populated after round-trip', () => {
    const ws = makeBigBankWorkspace()
    const dsl = serializeDSL(ws)
    const { workspace: parsed } = parseDSL(dsl)
    const containerView = parsed.views.containerViews[0]
    expect(containerView).toBeDefined()
    expect(containerView.elements.length).toBeGreaterThan(0)
  })
})

// ─── Workspace with groups round-trip ─────────────────────────────────

describe('Workspace with groups round-trip', () => {
  it('preserves groups through serialize → parse', () => {
    const ws: Workspace = {
      name: 'Groups Test',
      model: {
        people: [
          { id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} },
          { id: 'bob', type: 'person', name: 'Bob', tags: ['Element', 'Person'], properties: {} },
        ],
        softwareSystems: [
          { id: 'sys', type: 'softwareSystem', name: 'System', tags: ['Element', 'Software System'], properties: {}, containers: [] },
        ],
        relationships: [],
        groups: [
          { id: 'g1', name: 'Team Alpha', elementIds: ['alice', 'sys'] },
          { id: 'g2', name: 'Team Beta', elementIds: ['bob'] },
        ],
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
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(parsed.model.groups).toHaveLength(2)
    expect(parsed.model.groups.find(g => g.name === 'Team Alpha')).toBeDefined()
    expect(parsed.model.groups.find(g => g.name === 'Team Beta')).toBeDefined()
    const alpha = parsed.model.groups.find(g => g.name === 'Team Alpha')!
    expect(alpha.elementIds).toContain('alice')
    expect(alpha.elementIds).toContain('sys')
  })

  it('preserves all elements even when some are not grouped', () => {
    const ws: Workspace = {
      name: 'Partial Groups',
      model: {
        people: [
          { id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} },
          { id: 'bob', type: 'person', name: 'Bob', tags: ['Element', 'Person'], properties: {} },
        ],
        softwareSystems: [],
        relationships: [],
        groups: [
          { id: 'g1', name: 'Grouped', elementIds: ['alice'] },
        ],
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
    const { workspace: parsed } = parseDSL(dsl)
    expect(parsed.model.people).toHaveLength(2)
    expect(parsed.model.groups).toHaveLength(1)
  })
})

// ─── Workspace with custom element styles round-trip ──────────────────

describe('Workspace with custom element styles round-trip', () => {
  it('preserves element styles through serialize → parse', () => {
    const ws: Workspace = {
      name: 'Styles Test',
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
        configuration: {
          styles: {
            elements: [
              { tag: 'Database', background: '#336791', color: '#ffffff', shape: 'Cylinder' },
              { tag: 'Queue', background: '#ff9900', shape: 'Pipe' },
            ],
            relationships: [
              { tag: 'Async', color: '#aabbcc', dashed: true },
            ],
          },
        },
      },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const elemStyles = parsed.views.configuration.styles.elements
    expect(elemStyles.length).toBeGreaterThanOrEqual(2)
    const dbStyle = elemStyles.find(s => s.tag === 'Database')
    expect(dbStyle).toBeDefined()
    expect(dbStyle!.background).toBe('#336791')
    expect(dbStyle!.shape).toBe('Cylinder')

    const queueStyle = elemStyles.find(s => s.tag === 'Queue')
    expect(queueStyle).toBeDefined()
    expect(queueStyle!.background).toBe('#ff9900')
  })

  it('preserves relationship styles through round-trip', () => {
    const ws: Workspace = {
      name: 'Rel Styles',
      model: { people: [], softwareSystems: [], relationships: [], groups: [] },
      views: {
        systemLandscapeViews: [],
        systemContextViews: [],
        containerViews: [],
        componentViews: [],
        configuration: {
          styles: {
            elements: [],
            relationships: [
              { tag: 'Sync', color: '#00ff00' },
            ],
          },
        },
      },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const relStyles = parsed.views.configuration.styles.relationships
    expect(relStyles.some(s => s.tag === 'Sync' && s.color === '#00ff00')).toBe(true)
  })
})

// ─── Workspace with autoLayout BT direction round-trip ────────────────

describe('Workspace with autoLayout BT direction round-trip', () => {
  it('preserves autoLayout BT through serialize → parse', () => {
    const ws: Workspace = {
      name: 'AutoLayout BT',
      model: {
        people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
        softwareSystems: [],
        relationships: [],
        groups: [],
      },
      views: {
        systemLandscapeViews: [{
          type: 'systemLandscape',
          key: 'sl1',
          title: 'Landscape BT',
          elements: [{ id: 'alice' }],
          relationships: [],
          autoLayout: { direction: 'BT', rankSeparation: 300, nodeSeparation: 100 },
        }],
        systemContextViews: [],
        containerViews: [],
        componentViews: [],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = parsed.views.systemLandscapeViews[0]
    expect(view.autoLayout).toBeDefined()
    expect(view.autoLayout!.direction).toBe('BT')
    expect(view.autoLayout!.rankSeparation).toBe(300)
    expect(view.autoLayout!.nodeSeparation).toBe(100)
  })

  it('preserves autoLayout LR through serialize → parse', () => {
    const ws: Workspace = {
      name: 'AutoLayout LR',
      model: {
        people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
        softwareSystems: [],
        relationships: [],
        groups: [],
      },
      views: {
        systemLandscapeViews: [{
          type: 'systemLandscape',
          key: 'sl1',
          title: 'Landscape LR',
          elements: [{ id: 'alice' }],
          relationships: [],
          autoLayout: { direction: 'LR' },
        }],
        systemContextViews: [],
        containerViews: [],
        componentViews: [],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(parsed.views.systemLandscapeViews[0].autoLayout!.direction).toBe('LR')
  })

  it('preserves autoLayout RL through serialize → parse', () => {
    const ws: Workspace = {
      name: 'AutoLayout RL',
      model: {
        people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
        softwareSystems: [],
        relationships: [],
        groups: [],
      },
      views: {
        systemLandscapeViews: [{
          type: 'systemLandscape',
          key: 'sl1',
          title: 'Landscape RL',
          elements: [{ id: 'alice' }],
          relationships: [],
          autoLayout: { direction: 'RL' },
        }],
        systemContextViews: [],
        containerViews: [],
        componentViews: [],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(parsed.views.systemLandscapeViews[0].autoLayout!.direction).toBe('RL')
  })

  it('preserves autoLayout TB (default) through serialize → parse', () => {
    const ws: Workspace = {
      name: 'AutoLayout TB',
      model: {
        people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
        softwareSystems: [],
        relationships: [],
        groups: [],
      },
      views: {
        systemLandscapeViews: [{
          type: 'systemLandscape',
          key: 'sl1',
          title: 'Landscape TB',
          elements: [{ id: 'alice' }],
          relationships: [],
          autoLayout: { direction: 'TB' },
        }],
        systemContextViews: [],
        containerViews: [],
        componentViews: [],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(parsed.views.systemLandscapeViews[0].autoLayout!.direction).toBe('TB')
  })
})

// ─── Complex workspace round-trip ────────────────────────────────────

describe('Complex workspace round-trip', () => {
  it('full workspace with people, systems, containers, relationships, views, and styles round-trips', () => {
    const ws: Workspace = {
      name: 'Full Workspace',
      model: {
        people: [
          { id: 'user', type: 'person', name: 'End User', tags: ['Element', 'Person'], properties: {} },
        ],
        softwareSystems: [
          {
            id: 'webapp', type: 'softwareSystem', name: 'Web App', tags: ['Element', 'Software System'], properties: {},
            containers: [
              { id: 'frontend', type: 'container', name: 'Frontend', technology: 'React', tags: ['Element', 'Container'], properties: {}, components: [] },
              { id: 'backend', type: 'container', name: 'Backend', technology: 'Node.js', tags: ['Element', 'Container'], properties: {}, components: [] },
            ],
          },
        ],
        relationships: [
          { id: 'r1', sourceId: 'user', destinationId: 'webapp', description: 'uses', technology: 'HTTPS', tags: ['Relationship'], properties: {} },
          { id: 'r2', sourceId: 'frontend', destinationId: 'backend', description: 'calls', technology: 'REST', tags: ['Relationship'], properties: {} },
        ],
        groups: [
          { id: 'g1', name: 'Core Team', elementIds: ['user', 'webapp'] },
        ],
      },
      views: {
        systemLandscapeViews: [{
          type: 'systemLandscape', key: 'landscape', title: 'Overview',
          elements: [{ id: '*' }], relationships: [], autoLayout: { direction: 'TB' },
        }],
        systemContextViews: [],
        containerViews: [{
          type: 'container', key: 'containers', title: 'Containers',
          softwareSystemId: 'webapp',
          elements: [{ id: 'frontend' }, { id: 'backend' }],
          relationships: [{ id: 'r2' }],
        }],
        componentViews: [],
        configuration: {
          styles: {
            elements: [{ tag: 'Person', background: '#08427B', color: '#ffffff' }],
            relationships: [],
          },
        },
      },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)

    // People
    expect(parsed.model.people).toHaveLength(1)
    expect(parsed.model.people[0].name).toBe('End User')

    // Systems + containers
    expect(parsed.model.softwareSystems).toHaveLength(1)
    expect(parsed.model.softwareSystems[0].containers).toHaveLength(2)

    // Relationships
    expect(parsed.model.relationships).toHaveLength(2)

    // Groups
    expect(parsed.model.groups).toHaveLength(1)
    expect(parsed.model.groups[0].name).toBe('Core Team')

    // Views
    expect(parsed.views.systemLandscapeViews).toHaveLength(1)
    expect(parsed.views.containerViews).toHaveLength(1)

    // Styles
    const personStyle = parsed.views.configuration.styles.elements.find(s => s.tag === 'Person')
    expect(personStyle).toBeDefined()
    expect(personStyle!.background).toBe('#08427B')
  })
})
