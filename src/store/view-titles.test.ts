import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { allViewsOf } from './workspace-helpers'
import type { Workspace } from '@/types/model'

function makeWorkspace(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
      softwareSystems: [{
        id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {},
        containers: [{ id: 'web', type: 'container', name: 'Web', tags: ['Element', 'Container'], properties: {}, components: [] }],
      }],
      relationships: [],
      groups: [],
      deploymentEnvironments: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      dynamicViews: [],
      deploymentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

const store = () => useWorkspaceStore.getState()
const titleOf = (key: string) => allViewsOf(store().workspace!).find(v => v.key === key)?.title

describe('titles of views created without a name', () => {
  beforeEach(() => {
    store().loadWorkspace(makeWorkspace())
  })

  it('names a view after its type, numbering repeats instead of reusing one label', () => {
    const first = store().addView('systemLandscape')
    const second = store().addView('systemLandscape')
    const third = store().addView('systemLandscape')
    expect([titleOf(first), titleOf(second), titleOf(third)])
      .toEqual(['System Landscape', 'System Landscape 2', 'System Landscape 3'])
  })

  it('puts the element the view is scoped to first', () => {
    expect(titleOf(store().addView('systemContext', 'api'))).toBe('API — System Context')
    expect(titleOf(store().addView('container', 'api'))).toBe('API — Containers')
    expect(titleOf(store().addView('component', 'web'))).toBe('Web — Components')
    expect(titleOf(store().addView('container', 'api'))).toBe('API — Containers 2')
  })

  it('names an unscoped deployment view after its environment', () => {
    store().addDeploymentEnvironment('Live')
    expect(titleOf(store().addView('deployment', undefined, undefined, { environment: 'Live' }))).toBe('Live — Deployment')
    expect(titleOf(store().addView('deployment', 'api', undefined, { environment: 'Live' }))).toBe('API — Deployment')
  })

  it('never spells the internal type id', () => {
    const key = store().addView('systemLandscape')
    expect(titleOf(key)).not.toMatch(/systemLandscape|New /)
  })

  it('keeps a title the user typed, even one another view already has', () => {
    const a = store().addView('systemLandscape', undefined, 'Overview')
    const b = store().addView('systemLandscape', undefined, 'Overview')
    expect([titleOf(a), titleOf(b)]).toEqual(['Overview', 'Overview'])
  })

  it('numbers the copy when a view is duplicated twice', () => {
    const key = store().addView('systemLandscape', undefined, 'Overview')
    const copy1 = store().duplicateView(key)
    store().setActiveView(key)
    const copy2 = store().duplicateView(key)
    expect([titleOf(copy1), titleOf(copy2)]).toEqual(['Overview copy', 'Overview copy 2'])
  })
})
