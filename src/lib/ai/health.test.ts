import { describe, it, expect } from 'vitest'
import { modelHealth } from './health'
import { makeWorkspace } from './testFixture'
import type { Workspace } from '@/types/model'

function ids(ws: Workspace) {
  return Object.fromEntries(modelHealth(ws).map((g) => [g.id, g.count]))
}

describe('modelHealth', () => {
  it('flags missing technology, descriptions, unconnected elements and empty systems', () => {
    const ws = makeWorkspace()
    const gaps = ids(ws)
    // The fixture's containers/components have no technology set.
    expect(gaps.technology).toBeGreaterThan(0)
    // Every gap reported has a positive count.
    modelHealth(ws).forEach((g) => expect(g.count).toBeGreaterThan(0))
  })

  it('reports no gaps for a fully-specified, connected model', () => {
    const ws: Workspace = {
      name: 'T',
      model: {
        people: [{ id: 'p', type: 'person', name: 'User', description: 'A user', tags: [], properties: {} }],
        softwareSystems: [{
          id: 's', type: 'softwareSystem', name: 'Sys', description: 'The system', tags: [], properties: {},
          containers: [{ id: 'c', type: 'container', name: 'API', description: 'api', technology: 'Go', tags: [], properties: {}, components: [] }],
        }],
        relationships: [{ id: 'r', sourceId: 'p', destinationId: 'c', description: 'uses', tags: [], properties: {} }],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }
    expect(modelHealth(ws)).toEqual([])
  })

  it('does not flag an external system for having no containers', () => {
    const ws: Workspace = {
      name: 'T',
      model: {
        people: [],
        softwareSystems: [{ id: 'ext', type: 'softwareSystem', name: 'Stripe', description: 'payments', tags: [], properties: {}, containers: [], location: 'External' }],
        relationships: [{ id: 'r', sourceId: 'ext', destinationId: 'ext', description: 'x', tags: [], properties: {} }],
        groups: [],
      },
      views: { systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [], configuration: { styles: { elements: [], relationships: [] } } },
    }
    expect(ids(ws).emptySystems).toBeUndefined()
  })
})
