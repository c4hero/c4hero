import { describe, it, expect } from 'vitest'
import { serializeDSL, parseDSL } from '@/lib/dsl'
import { createBlankWorkspace } from '@/lib/templates'
import type { Workspace } from '@/types/model'

describe('scope roundtrip', () => {
  it('softwaresystem scope survives createBlankWorkspace → serialize → parse', () => {
    const ws = createBlankWorkspace('softwaresystem')
    expect(ws.scope).toBe('softwaresystem')
    expect(ws.model.softwareSystems).toHaveLength(1)
    expect(ws.views.systemContextViews).toHaveLength(1)
    const dsl = serializeDSL(ws)
    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    expect(parsed.workspace?.scope).toBe('softwaresystem')
    // Placeholder system + systemContext view survive roundtrip
    expect(parsed.workspace?.model.softwareSystems).toHaveLength(1)
    expect(parsed.workspace?.views.systemContextViews).toHaveLength(1)
    const view = parsed.workspace?.views.systemContextViews[0]
    const systemId = parsed.workspace?.model.softwareSystems[0].id
    expect(view?.softwareSystemId).toBe(systemId)
  })

  it('landscape scope survives createBlankWorkspace → serialize → parse', () => {
    const ws = createBlankWorkspace('landscape')
    expect(ws.scope).toBe('landscape')
    const dsl = serializeDSL(ws)
    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    expect(parsed.workspace?.scope).toBe('landscape')
  })

  it('no scope (unscoped) roundtrips as undefined', () => {
    const ws = createBlankWorkspace()
    expect(ws.scope).toBeUndefined()
    const dsl = serializeDSL(ws)
    const parsed = parseDSL(dsl)
    expect(parsed.workspace?.scope).toBeUndefined()
  })

  it('explicit none scope parses as unscoped without an error', () => {
    const dsl = `workspace {\n  model {}\n  views {}\n  configuration { scope none }\n}`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.scope).toBe('none')
  })

  it('unknown scope value produces a parse error and defaults to none', () => {
    const dsl = `workspace {\n  model {}\n  views {}\n  configuration { scope badvalue }\n}`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toMatch(/unknown scope value/i)
    expect(workspace.scope).toBe('none')
  })
})

// ─── View-level scope IDs ─────────────────────────────────────────────────────
// These verify that a view's scope reference (the system/container it is "about")
// survives a full serialize → parse roundtrip so sidecar data stays coherent.

describe('container view softwareSystemId survives serialize → parse', () => {
  it('preserves the exact softwareSystemId on a container view', () => {
    const ws: Workspace = {
      name: 'test',
      description: '',
      model: {
        people: [],
        softwareSystems: [
          {
            id: 'mySystem',
            type: 'softwareSystem',
            name: 'My System',
            tags: ['Element', 'Software System'],
            properties: {},
            containers: [
              { id: 'db', type: 'container', name: 'Database', tags: ['Element', 'Container'], properties: {}, components: [] },
              { id: 'api', type: 'container', name: 'API', tags: ['Element', 'Container'], properties: {}, components: [] },
            ],
          },
        ],
        relationships: [],
        groups: [],
      },
      views: {
        systemLandscapeViews: [],
        systemContextViews: [],
        containerViews: [
          {
            type: 'container',
            key: 'myContainers',
            title: 'My Containers',
            softwareSystemId: 'mySystem',
            elements: [{ id: 'db' }, { id: 'api' }],
            relationships: [],
          },
        ],
        componentViews: [],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(parsed.views.containerViews).toHaveLength(1)
    const view = parsed.views.containerViews[0]
    const systemId = parsed.model.softwareSystems[0].id
    // The view's scope must point to the same system as it did before roundtrip
    expect(view.softwareSystemId).toBe(systemId)
    // Elements should still be scoped correctly
    expect(view.elements.length).toBeGreaterThan(0)
  })

  it('container view scope correctly identifies the right system when multiple systems exist', () => {
    const ws: Workspace = {
      name: 'multi',
      description: '',
      model: {
        people: [],
        softwareSystems: [
          {
            id: 'sys1',
            type: 'softwareSystem',
            name: 'System One',
            tags: ['Element', 'Software System'],
            properties: {},
            containers: [
              { id: 'c1', type: 'container', name: 'Container A', tags: ['Element', 'Container'], properties: {}, components: [] },
            ],
          },
          {
            id: 'sys2',
            type: 'softwareSystem',
            name: 'System Two',
            tags: ['Element', 'Software System'],
            properties: {},
            containers: [
              { id: 'c2', type: 'container', name: 'Container B', tags: ['Element', 'Container'], properties: {}, components: [] },
            ],
          },
        ],
        relationships: [],
        groups: [],
      },
      views: {
        systemLandscapeViews: [],
        systemContextViews: [],
        containerViews: [
          {
            type: 'container',
            key: 'view1',
            title: 'Containers 1',
            softwareSystemId: 'sys1',
            elements: [{ id: 'c1' }],
            relationships: [],
          },
          {
            type: 'container',
            key: 'view2',
            title: 'Containers 2',
            softwareSystemId: 'sys2',
            elements: [{ id: 'c2' }],
            relationships: [],
          },
        ],
        componentViews: [],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const sys1Id = parsed.model.softwareSystems.find(s => s.name === 'System One')!.id
    const sys2Id = parsed.model.softwareSystems.find(s => s.name === 'System Two')!.id
    const v1 = parsed.views.containerViews.find(v => v.key === 'view1')!
    const v2 = parsed.views.containerViews.find(v => v.key === 'view2')!
    expect(v1.softwareSystemId).toBe(sys1Id)
    expect(v2.softwareSystemId).toBe(sys2Id)
    // Scopes must not be swapped
    expect(v1.softwareSystemId).not.toBe(sys2Id)
    expect(v2.softwareSystemId).not.toBe(sys1Id)
  })
})

describe('component view containerId survives serialize → parse', () => {
  it('preserves the exact containerId on a component view', () => {
    const ws: Workspace = {
      name: 'test',
      description: '',
      model: {
        people: [],
        softwareSystems: [
          {
            id: 'sys',
            type: 'softwareSystem',
            name: 'System',
            tags: ['Element', 'Software System'],
            properties: {},
            containers: [
              {
                id: 'api',
                type: 'container',
                name: 'API',
                tags: ['Element', 'Container'],
                properties: {},
                components: [
                  { id: 'auth', type: 'component', name: 'Auth Service', tags: ['Element', 'Component'], properties: {} },
                  { id: 'order', type: 'component', name: 'Order Service', tags: ['Element', 'Component'], properties: {} },
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
        componentViews: [
          {
            type: 'component',
            key: 'apiComponents',
            title: 'API Components',
            containerId: 'api',
            elements: [{ id: 'auth' }, { id: 'order' }],
            relationships: [],
          },
        ],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(parsed.views.componentViews).toHaveLength(1)
    const view = parsed.views.componentViews[0]
    const apiId = parsed.model.softwareSystems[0].containers.find(c => c.name === 'API')!.id
    // The view's scope must point to the same container as it did before roundtrip
    expect(view.containerId).toBe(apiId)
  })

  it('component view scope correctly identifies the right container when multiple containers exist', () => {
    const ws: Workspace = {
      name: 'multi-container',
      description: '',
      model: {
        people: [],
        softwareSystems: [
          {
            id: 'sys',
            type: 'softwareSystem',
            name: 'System',
            tags: ['Element', 'Software System'],
            properties: {},
            containers: [
              {
                id: 'frontend',
                type: 'container',
                name: 'Frontend',
                tags: ['Element', 'Container'],
                properties: {},
                components: [
                  { id: 'login', type: 'component', name: 'Login', tags: ['Element', 'Component'], properties: {} },
                ],
              },
              {
                id: 'backend',
                type: 'container',
                name: 'Backend',
                tags: ['Element', 'Container'],
                properties: {},
                components: [
                  { id: 'payment', type: 'component', name: 'Payment', tags: ['Element', 'Component'], properties: {} },
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
        componentViews: [
          {
            type: 'component',
            key: 'frontendComps',
            title: 'Frontend Components',
            containerId: 'frontend',
            elements: [{ id: 'login' }],
            relationships: [],
          },
          {
            type: 'component',
            key: 'backendComps',
            title: 'Backend Components',
            containerId: 'backend',
            elements: [{ id: 'payment' }],
            relationships: [],
          },
        ],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const frontendId = parsed.model.softwareSystems[0].containers.find(c => c.name === 'Frontend')!.id
    const backendId = parsed.model.softwareSystems[0].containers.find(c => c.name === 'Backend')!.id
    const vFront = parsed.views.componentViews.find(v => v.key === 'frontendComps')!
    const vBack = parsed.views.componentViews.find(v => v.key === 'backendComps')!
    expect(vFront.containerId).toBe(frontendId)
    expect(vBack.containerId).toBe(backendId)
    // Scopes must not be swapped
    expect(vFront.containerId).not.toBe(backendId)
    expect(vBack.containerId).not.toBe(frontendId)
  })
})
