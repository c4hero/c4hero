import { describe, it, expect } from 'vitest'
import { serializeDSL, parseDSL } from './index'
import type { Workspace } from '@/types/model'

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
    console.log('DSL output:\n' + dsl)
    const { workspace: parsed, errors } = parseDSL(dsl)
    console.log('Errors:', errors)
    console.log('People IDs:', parsed.model.people.map(p => p.id))
    console.log('System IDs:', parsed.model.softwareSystems.map(s => s.id))
    console.log('Rels:', JSON.stringify(parsed.model.relationships))
    expect(errors).toHaveLength(0)
    expect(parsed.model.relationships).toHaveLength(1)
    const rel = parsed.model.relationships[0]
    expect(rel.sourceId).toBe(parsed.model.people[0].id)
    expect(rel.destinationId).toBe(parsed.model.softwareSystems[0].id)
  })
})

  it('view element IDs are consistent with model element IDs after parse', () => {
    const ws = makeWs()
    ws.views.systemLandscapeViews.push({
      key: 'landscape', title: 'Landscape', type: 'systemLandscape',
      elements: [{ id: 'abc-123' }, { id: 'xyz-456' }],
      relationships: [], autoLayout: null
    } as any)
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
    } as any)
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
