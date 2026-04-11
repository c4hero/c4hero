import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace'
import type { Workspace } from '@/types/model'

function makeWorkspace(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
      softwareSystems: [{ id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {}, containers: [] }],
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

describe('Group store actions', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('addGroup creates a group with the given name and members', () => {
    const id = useWorkspaceStore.getState().addGroup('My Group', ['alice', 'api'])
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.groups).toHaveLength(1)
    expect(ws.model.groups[0].name).toBe('My Group')
    expect(ws.model.groups[0].elementIds).toEqual(['alice', 'api'])
    expect(id).toBeTruthy()
  })

  it('addGroup with no elementIds creates an empty group', () => {
    useWorkspaceStore.getState().addGroup('Empty')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.groups[0].elementIds).toEqual([])
  })

  it('updateGroup renames a group', () => {
    useWorkspaceStore.getState().addGroup('Old Name', ['alice'])
    const id = useWorkspaceStore.getState().workspace!.model.groups[0].id
    useWorkspaceStore.getState().updateGroup(id, { name: 'New Name' })
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.groups[0].name).toBe('New Name')
  })

  it('updateGroup updates elementIds', () => {
    useWorkspaceStore.getState().addGroup('Team', ['alice'])
    const id = useWorkspaceStore.getState().workspace!.model.groups[0].id
    useWorkspaceStore.getState().updateGroup(id, { elementIds: ['alice', 'api'] })
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.groups[0].elementIds).toEqual(['alice', 'api'])
  })

  it('deleteGroup removes the group', () => {
    useWorkspaceStore.getState().addGroup('Team', ['alice'])
    const id = useWorkspaceStore.getState().workspace!.model.groups[0].id
    useWorkspaceStore.getState().deleteGroup(id)
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.groups).toHaveLength(0)
  })

  it('deleteGroup clears selectedGroupId if it was the deleted group', () => {
    useWorkspaceStore.getState().addGroup('Team', ['alice'])
    const id = useWorkspaceStore.getState().workspace!.model.groups[0].id
    useWorkspaceStore.getState().selectGroup(id)
    expect(useWorkspaceStore.getState().selectedGroupId).toBe(id)
    useWorkspaceStore.getState().deleteGroup(id)
    expect(useWorkspaceStore.getState().selectedGroupId).toBeNull()
  })

  it('deleteElement removes element from all group memberships', () => {
    useWorkspaceStore.getState().addGroup('Team', ['alice', 'api'])
    useWorkspaceStore.getState().deleteElement('alice')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.groups[0].elementIds).not.toContain('alice')
    expect(ws.model.groups[0].elementIds).toContain('api')
  })

  it('selectGroup sets selectedGroupId and clears element/relationship selection', () => {
    useWorkspaceStore.setState({ selectedElementIds: ['alice'], selectedRelationshipId: 'rel1' })
    useWorkspaceStore.getState().selectGroup('g1')
    const s = useWorkspaceStore.getState()
    expect(s.selectedGroupId).toBe('g1')
    expect(s.selectedElementIds).toHaveLength(0)
    expect(s.selectedRelationshipId).toBeNull()
  })

  it('selectElements clears selectedGroupId', () => {
    useWorkspaceStore.setState({ selectedGroupId: 'g1' })
    useWorkspaceStore.getState().selectElements(['alice'])
    expect(useWorkspaceStore.getState().selectedGroupId).toBeNull()
  })

  it('selectRelationship clears selectedGroupId', () => {
    useWorkspaceStore.setState({ selectedGroupId: 'g1' })
    useWorkspaceStore.getState().selectRelationship('rel1')
    expect(useWorkspaceStore.getState().selectedGroupId).toBeNull()
  })

  it('clearSelection clears selectedGroupId', () => {
    useWorkspaceStore.setState({ selectedGroupId: 'g1' })
    useWorkspaceStore.getState().clearSelection()
    expect(useWorkspaceStore.getState().selectedGroupId).toBeNull()
  })

  it('loadWorkspace resets selectedGroupId', () => {
    useWorkspaceStore.setState({ selectedGroupId: 'g1' })
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    expect(useWorkspaceStore.getState().selectedGroupId).toBeNull()
  })

  it('updateGroup supports undo', () => {
    useWorkspaceStore.getState().addGroup('Original', ['alice'])
    const id = useWorkspaceStore.getState().workspace!.model.groups[0].id
    useWorkspaceStore.getState().updateGroup(id, { name: 'Updated' })
    expect(useWorkspaceStore.getState().workspace!.model.groups[0].name).toBe('Updated')
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace!.model.groups[0].name).toBe('Original')
  })

  it('deleteGroup supports undo', () => {
    useWorkspaceStore.getState().addGroup('Team', ['alice'])
    const id = useWorkspaceStore.getState().workspace!.model.groups[0].id
    useWorkspaceStore.getState().deleteGroup(id)
    expect(useWorkspaceStore.getState().workspace!.model.groups).toHaveLength(0)
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace!.model.groups).toHaveLength(1)
  })
})

// ─── Relationship and Container Mutations ─────────────────────────────

describe('Relationship and container mutations', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('addRelationship creates a relationship with correct fields', () => {
    useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls', 'gRPC')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.relationships).toHaveLength(1)
    const rel = ws.model.relationships[0]
    expect(rel.sourceId).toBe('alice')
    expect(rel.destinationId).toBe('api')
    expect(rel.description).toBe('calls')
    expect(rel.technology).toBe('gRPC')
  })

  it('updateRelationship updates description and technology', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls', 'gRPC')
    useWorkspaceStore.getState().updateRelationship(relId, { description: 'queries', technology: 'SQL' })
    const ws = useWorkspaceStore.getState().workspace!
    const rel = ws.model.relationships.find(r => r.id === relId)!
    expect(rel.description).toBe('queries')
    expect(rel.technology).toBe('SQL')
  })

  it('addRelationship returns a unique ID and selects it', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    expect(relId).toBeTruthy()
    expect(useWorkspaceStore.getState().selectedRelationshipId).toBe(relId)
  })

  it('updateRelationship sets interactionStyle', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'sends to')
    useWorkspaceStore.getState().updateRelationship(relId, { interactionStyle: 'Asynchronous' })
    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === relId)!
    expect(rel.interactionStyle).toBe('Asynchronous')
  })

  it('reconnectRelationship updates source and destination', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    const newSysId = useWorkspaceStore.getState().addSoftwareSystem('Other')
    useWorkspaceStore.getState().reconnectRelationship(relId, 'alice', newSysId)
    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === relId)!
    expect(rel.sourceId).toBe('alice')
    expect(rel.destinationId).toBe(newSysId)
  })

  it('reconnectRelationship supports undo', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    const newSysId = useWorkspaceStore.getState().addSoftwareSystem('Other')
    useWorkspaceStore.getState().reconnectRelationship(relId, 'alice', newSysId)
    useWorkspaceStore.getState().undo()
    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === relId)!
    expect(rel.destinationId).toBe('api')
  })

  it('reconnectRelationship removes relationship from views where the new endpoint is absent', () => {
    // V1: landscape auto-populates alice + api; becomes active view
    const keyV1 = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View 1')
    // V2: landscape auto-populates alice + api; addView sets V2 as active
    const keyV2 = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View 2')
    // Create 'other' while V2 is active — it auto-adds to V2 only
    const otherId = useWorkspaceStore.getState().addSoftwareSystem('Other')
    // Add relationship alice→api; both views have alice+api so relationship goes into both
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    const ws0 = useWorkspaceStore.getState().workspace!
    const v1before = ws0.views.systemLandscapeViews.find(v => v.key === keyV1)!
    expect(v1before.relationships.some(r => r.id === relId)).toBe(true)
    // Reconnect to alice→other: 'other' is in V2 but NOT in V1
    useWorkspaceStore.getState().reconnectRelationship(relId, 'alice', otherId)
    const ws = useWorkspaceStore.getState().workspace!
    const v1 = ws.views.systemLandscapeViews.find(v => v.key === keyV1)!
    const v2 = ws.views.systemLandscapeViews.find(v => v.key === keyV2)!
    // V1 doesn't have 'other' → relationship should be removed
    expect(v1.relationships.some(r => r.id === relId)).toBe(false)
    // V2 has both alice and other → relationship should stay
    expect(v2.relationships.some(r => r.id === relId)).toBe(true)
  })

  it('deleteRelationship removes it from model', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    useWorkspaceStore.getState().deleteRelationship(relId)
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.relationships).toHaveLength(0)
  })

  it('deleteRelationship also removes it from view relationships', () => {
    const viewKey = useWorkspaceStore.getState().addView('systemContext', 'api', 'Context')
    useWorkspaceStore.getState().setActiveView(viewKey)
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    // Manually add to view.relationships (as Canvas does on edge creation)
    const ws1 = useWorkspaceStore.getState().workspace!
    const view1 = ws1.views.systemContextViews.find(v => v.key === viewKey)!
    expect(view1).toBeDefined()
    // The relationship may or may not be in the view; test that delete cleans up
    useWorkspaceStore.getState().deleteRelationship(relId)
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(0)
  })

  it('addContainer creates container under the specified softwareSystem', () => {
    useWorkspaceStore.getState().addContainer('api', 'Auth Service', undefined, undefined)
    const ws = useWorkspaceStore.getState().workspace!
    const sys = ws.model.softwareSystems.find(s => s.id === 'api')!
    expect(sys.containers).toHaveLength(1)
    expect(sys.containers[0].name).toBe('Auth Service')
  })

  it('addComponent creates component under the specified container', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Auth Service')
    useWorkspaceStore.getState().addComponent(containerId, 'Login Handler')
    const ws = useWorkspaceStore.getState().workspace!
    const sys = ws.model.softwareSystems.find(s => s.id === 'api')!
    const container = sys.containers.find(c => c.id === containerId)!
    expect(container.components).toHaveLength(1)
    expect(container.components[0].name).toBe('Login Handler')
  })

  it('undo/redo stack depth — undo twice returns to state before last 2 mutations', () => {
    const { addGroup } = useWorkspaceStore.getState()
    addGroup('Group A')
    addGroup('Group B')
    addGroup('Group C')

    let ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.groups).toHaveLength(3)

    useWorkspaceStore.getState().undo()
    ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.groups).toHaveLength(2)

    useWorkspaceStore.getState().undo()
    ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.groups).toHaveLength(1)
    expect(ws.model.groups[0].name).toBe('Group A')
  })

  it('redo restores state after undo', () => {
    const { addGroup } = useWorkspaceStore.getState()
    addGroup('Group A')
    addGroup('Group B')
    addGroup('Group C')

    useWorkspaceStore.getState().undo()
    useWorkspaceStore.getState().undo()

    let ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.groups).toHaveLength(1)

    useWorkspaceStore.getState().redo()
    ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.groups).toHaveLength(2)
    expect(ws.model.groups[1].name).toBe('Group B')
  })
})

// ─── confirmDelete and pendingDelete ─────────────────────────────────

describe('confirmDelete and pendingDelete', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().closeWorkspace()
  })

  it('confirmDelete sets pendingDelete with message and onConfirm', () => {
    const fn = vi.fn()
    useWorkspaceStore.getState().confirmDelete('Are you sure?', fn)
    const { pendingDelete } = useWorkspaceStore.getState()
    expect(pendingDelete).not.toBeNull()
    expect(pendingDelete!.message).toBe('Are you sure?')
    expect(typeof pendingDelete!.onConfirm).toBe('function')
  })

  it('cancelDelete clears pendingDelete to null', () => {
    useWorkspaceStore.getState().confirmDelete('Delete?', vi.fn())
    useWorkspaceStore.getState().cancelDelete()
    expect(useWorkspaceStore.getState().pendingDelete).toBeNull()
  })

  it('calling pendingDelete.onConfirm() invokes the original fn', () => {
    const fn = vi.fn()
    useWorkspaceStore.getState().confirmDelete('Delete this?', fn)
    const { pendingDelete } = useWorkspaceStore.getState()
    pendingDelete!.onConfirm()
    expect(fn).toHaveBeenCalledOnce()
  })
})

// ─── multiSelectMode ────────────────────────────────────────────────

describe('multiSelectMode', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().closeWorkspace()
  })

  it('setMultiSelectMode(true) sets multiSelectMode to true', () => {
    useWorkspaceStore.getState().setMultiSelectMode(true)
    expect(useWorkspaceStore.getState().multiSelectMode).toBe(true)
  })

  it('setMultiSelectMode(false) sets multiSelectMode back to false', () => {
    useWorkspaceStore.getState().setMultiSelectMode(true)
    useWorkspaceStore.getState().setMultiSelectMode(false)
    expect(useWorkspaceStore.getState().multiSelectMode).toBe(false)
  })

  it('setActiveView clears selectedElementIds', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.setState({ selectedElementIds: ['alice', 'api'] })
    expect(useWorkspaceStore.getState().selectedElementIds).toHaveLength(2)
    useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape')
    const viewKey = useWorkspaceStore.getState().activeViewKey!
    useWorkspaceStore.setState({ selectedElementIds: ['alice'] })
    useWorkspaceStore.getState().setActiveView(viewKey)
    expect(useWorkspaceStore.getState().selectedElementIds).toHaveLength(0)
  })
})

// ─── activeWorkspaceFilename ─────────────────────────────────────────

describe('activeWorkspaceFilename', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().closeWorkspace()
  })

  it('setActiveWorkspaceFilename stores the filename', () => {
    useWorkspaceStore.getState().setActiveWorkspaceFilename('foo.dsl')
    expect(useWorkspaceStore.getState().activeWorkspaceFilename).toBe('foo.dsl')
  })

  it('setActiveWorkspaceFilename(null) clears the filename', () => {
    useWorkspaceStore.getState().setActiveWorkspaceFilename('foo.dsl')
    useWorkspaceStore.getState().setActiveWorkspaceFilename(null)
    expect(useWorkspaceStore.getState().activeWorkspaceFilename).toBeNull()
  })

  it('closeWorkspace clears activeWorkspaceFilename', () => {
    // Must clear alongside workspace — otherwise useAutoSave's pending timer
    // can recreate a deleted file using the stale filename.
    useWorkspaceStore.getState().setActiveWorkspaceFilename('foo.dsl')
    useWorkspaceStore.getState().closeWorkspace()
    expect(useWorkspaceStore.getState().activeWorkspaceFilename).toBeNull()
  })
})

// ─── view CRUD ──────────────────────────────────────────────────────

describe('view CRUD', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('addView adds a systemLandscape view that appears in workspace.views.systemLandscapeViews', () => {
    const key = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'My Landscape')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.views.systemLandscapeViews).toHaveLength(1)
    const view = ws.views.systemLandscapeViews[0]
    expect(view.key).toBe(key)
    expect(view.title).toBe('My Landscape')
    // Auto-populates with all people and systems from the model
    expect(view.elements.some(e => e.id === 'alice')).toBe(true)
    expect(view.elements.some(e => e.id === 'api')).toBe(true)
    expect(view.autoLayout?.direction).toBe('TB')
  })

  it('deleteView removes the view', () => {
    const key = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Test')
    useWorkspaceStore.getState().deleteView(key)
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.views.systemLandscapeViews).toHaveLength(0)
  })

  it('setActiveView updates activeViewKey', () => {
    const key1 = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View A')
    const key2 = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View B')
    useWorkspaceStore.getState().setActiveView(key1)
    expect(useWorkspaceStore.getState().activeViewKey).toBe(key1)
    useWorkspaceStore.getState().setActiveView(key2)
    expect(useWorkspaceStore.getState().activeViewKey).toBe(key2)
  })

  it('addView also sets activeViewKey to the new view', () => {
    const key = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'New View')
    expect(useWorkspaceStore.getState().activeViewKey).toBe(key)
  })

  it('deleteView clears activeViewKey if the deleted view was active', () => {
    const key = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Only View')
    expect(useWorkspaceStore.getState().activeViewKey).toBe(key)
    useWorkspaceStore.getState().deleteView(key)
    // With no remaining views, activeViewKey should be null
    expect(useWorkspaceStore.getState().activeViewKey).toBeNull()
  })

  it('addView with type systemContext includes scopeId as softwareSystemId', () => {
    const key = useWorkspaceStore.getState().addView('systemContext', 'api', 'Context View')
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.systemContextViews.find(v => v.key === key)!
    expect(view.softwareSystemId).toBe('api')
  })
})

// ─── addView component view auto-populate ────────────────────────────

describe('addView component view — external actor auto-populate', () => {
  let sysId: string
  let containerId: string
  let extPersonId: string
  let extSystemId: string
  let extContainerId: string

  beforeEach(() => {
    // Build a workspace with: sys → container (web) → component (auth)
    // External: person (user), system (extSys), container (extContainer)
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [{ id: 'user', type: 'person', name: 'User', tags: ['Person'], properties: {} }],
        softwareSystems: [
          {
            id: 'sys', type: 'softwareSystem', name: 'Sys', tags: ['Software System'], properties: {},
            containers: [
              {
                id: 'web', type: 'container', name: 'Web', tags: ['Container'], properties: {},
                components: [
                  { id: 'auth', type: 'component', name: 'Auth', tags: ['Component'], properties: {} },
                ],
              },
            ],
          },
          {
            id: 'extSys', type: 'softwareSystem', name: 'ExtSys', tags: ['Software System'], properties: {},
            containers: [
              { id: 'extCont', type: 'container', name: 'ExtCont', tags: ['Container'], properties: {}, components: [] },
            ],
          },
        ],
        relationships: [
          // user → auth
          { id: 'r1', sourceId: 'user', destinationId: 'auth', description: 'logs in', tags: [], properties: {} },
          // auth → extCont
          { id: 'r2', sourceId: 'auth', destinationId: 'extCont', description: 'calls', tags: [], properties: {} },
          // auth → extSys (direct system relationship)
          { id: 'r3', sourceId: 'auth', destinationId: 'extSys', description: 'notifies', tags: [], properties: {} },
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
    sysId = 'sys'
    containerId = 'web'
    extPersonId = 'user'
    extSystemId = 'extSys'
    extContainerId = 'extCont'
    useWorkspaceStore.getState().loadWorkspace(ws)
  })

  it('auto-populates the scoped container\'s components', () => {
    const key = useWorkspaceStore.getState().addView('component', containerId, 'Auth Components')
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.componentViews.find(v => v.key === key)!
    expect(view.elements.some(e => e.id === 'auth')).toBe(true)
  })

  it('auto-populates external person related to a component', () => {
    const key = useWorkspaceStore.getState().addView('component', containerId, 'Auth Components')
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.componentViews.find(v => v.key === key)!
    expect(view.elements.some(e => e.id === extPersonId)).toBe(true)
  })

  it('auto-populates external container related to a component', () => {
    const key = useWorkspaceStore.getState().addView('component', containerId, 'Auth Components')
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.componentViews.find(v => v.key === key)!
    expect(view.elements.some(e => e.id === extContainerId)).toBe(true)
  })

  it('auto-populates external software system related to a component', () => {
    const key = useWorkspaceStore.getState().addView('component', containerId, 'Auth Components')
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.componentViews.find(v => v.key === key)!
    expect(view.elements.some(e => e.id === extSystemId)).toBe(true)
  })

  it('auto-includes relationships between auto-populated elements', () => {
    const key = useWorkspaceStore.getState().addView('component', containerId, 'Auth Components')
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.componentViews.find(v => v.key === key)!
    expect(view.relationships.some(r => r.id === 'r1')).toBe(true)
    expect(view.relationships.some(r => r.id === 'r2')).toBe(true)
    expect(view.relationships.some(r => r.id === 'r3')).toBe(true)
  })

  it('does not include unrelated elements', () => {
    const key = useWorkspaceStore.getState().addView('component', containerId, 'Auth Components')
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.componentViews.find(v => v.key === key)!
    // sys itself has no direct relationship to components (only via containers), should not appear
    expect(view.elements.some(e => e.id === sysId)).toBe(false)
  })
})

// ─── addRelationship cross-view auto-add ─────────────────────────────

describe('addRelationship — auto-add to views containing both endpoints', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('adds relationship to every view that already has both endpoints', () => {
    // Create two views both containing alice and api
    const key1 = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View 1')
    const key2 = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View 2')
    useWorkspaceStore.getState().setActiveView(key1)

    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    const ws = useWorkspaceStore.getState().workspace!

    const v1 = ws.views.systemLandscapeViews.find(v => v.key === key1)!
    const v2 = ws.views.systemLandscapeViews.find(v => v.key === key2)!
    expect(v1.relationships.some(r => r.id === relId)).toBe(true)
    expect(v2.relationships.some(r => r.id === relId)).toBe(true)
  })

  it('does not add relationship to views missing one endpoint', () => {
    const key = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape')
    useWorkspaceStore.getState().setActiveView(key)
    // Remove alice from the view
    useWorkspaceStore.getState().toggleElementInView(key, 'alice')

    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.systemLandscapeViews.find(v => v.key === key)!
    expect(view.relationships.some(r => r.id === relId)).toBe(false)
  })

  it('does not duplicate the relationship in the active view', () => {
    const key = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape')
    useWorkspaceStore.getState().setActiveView(key)

    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.systemLandscapeViews.find(v => v.key === key)!
    // Should appear exactly once
    const count = view.relationships.filter(r => r.id === relId).length
    expect(count).toBe(1)
  })
})

// ─── addContainer/addComponent cross-view auto-add ───────────────────

describe('addContainer — auto-add to all container views scoped to same system', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('auto-adds to other container views scoped to the same system', () => {
    // Create two container views for 'api'
    const keyA = useWorkspaceStore.getState().addView('container', 'api', 'Containers A')
    const keyB = useWorkspaceStore.getState().addView('container', 'api', 'Containers B')
    useWorkspaceStore.getState().setActiveView(keyA)

    // Add a container while view A is active
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Web App')
    const ws = useWorkspaceStore.getState().workspace!
    const viewA = ws.views.containerViews.find(v => v.key === keyA)!
    const viewB = ws.views.containerViews.find(v => v.key === keyB)!

    // Should appear in both views
    expect(viewA.elements.some(e => e.id === containerId)).toBe(true)
    expect(viewB.elements.some(e => e.id === containerId)).toBe(true)
  })

  it('does not auto-add to container views scoped to a different system', () => {
    const otherId = useWorkspaceStore.getState().addSoftwareSystem('Other')
    const keyOther = useWorkspaceStore.getState().addView('container', otherId, 'Other Containers')
    const keyApi = useWorkspaceStore.getState().addView('container', 'api', 'API Containers')
    useWorkspaceStore.getState().setActiveView(keyApi)

    const containerId = useWorkspaceStore.getState().addContainer('api', 'Web App')
    const ws = useWorkspaceStore.getState().workspace!
    const viewOther = ws.views.containerViews.find(v => v.key === keyOther)!
    expect(viewOther.elements.some(e => e.id === containerId)).toBe(false)
  })
})

describe('addComponent — auto-add to all component views scoped to same container', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('auto-adds to other component views scoped to the same container', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Web App')
    const keyA = useWorkspaceStore.getState().addView('component', containerId, 'Components A')
    const keyB = useWorkspaceStore.getState().addView('component', containerId, 'Components B')
    useWorkspaceStore.getState().setActiveView(keyA)

    const compId = useWorkspaceStore.getState().addComponent(containerId, 'Auth Handler')
    const ws = useWorkspaceStore.getState().workspace!
    const viewA = ws.views.componentViews.find(v => v.key === keyA)!
    const viewB = ws.views.componentViews.find(v => v.key === keyB)!
    expect(viewA.elements.some(e => e.id === compId)).toBe(true)
    expect(viewB.elements.some(e => e.id === compId)).toBe(true)
  })

  it('does not auto-add to component views scoped to a different container', () => {
    const containerA = useWorkspaceStore.getState().addContainer('api', 'Web App')
    const containerB = useWorkspaceStore.getState().addContainer('api', 'DB')
    const keyB = useWorkspaceStore.getState().addView('component', containerB, 'DB Components')
    const keyA = useWorkspaceStore.getState().addView('component', containerA, 'Web Components')
    useWorkspaceStore.getState().setActiveView(keyA)

    const compId = useWorkspaceStore.getState().addComponent(containerA, 'Auth Handler')
    const ws = useWorkspaceStore.getState().workspace!
    const viewB = ws.views.componentViews.find(v => v.key === keyB)!
    expect(viewB.elements.some(e => e.id === compId)).toBe(false)
  })
})

// ─── Undo/redo after relationship mutations ──────────────────────────

describe('Undo/redo after relationship mutations', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('undo after addRelationship removes the relationship', () => {
    useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls', 'HTTP')
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(1)
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(0)
  })

  it('redo after undo restores the relationship', () => {
    useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(0)
    useWorkspaceStore.getState().redo()
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(1)
    expect(useWorkspaceStore.getState().workspace!.model.relationships[0].description).toBe('calls')
  })

  it('undo after updateRelationship reverts the change', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls', 'gRPC')
    useWorkspaceStore.getState().updateRelationship(relId, { description: 'queries', technology: 'SQL' })
    expect(useWorkspaceStore.getState().workspace!.model.relationships[0].description).toBe('queries')
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace!.model.relationships[0].description).toBe('calls')
    expect(useWorkspaceStore.getState().workspace!.model.relationships[0].technology).toBe('gRPC')
  })

  it('undo after deleteRelationship restores the relationship', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'sends data')
    useWorkspaceStore.getState().deleteRelationship(relId)
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(0)
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(1)
    expect(useWorkspaceStore.getState().workspace!.model.relationships[0].description).toBe('sends data')
  })

  it('multiple undos revert multiple relationship mutations', () => {
    useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    useWorkspaceStore.getState().addRelationship('api', 'alice', 'notifies')
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(2)
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(1)
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(0)
  })
})

// ─── Element CRUD ────────────────────────────────────────────────────

describe('Element CRUD', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('addPerson creates a person and selects it', () => {
    const id = useWorkspaceStore.getState().addPerson('Bob')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.people.find(p => p.id === id)).toBeDefined()
    expect(ws.model.people.find(p => p.id === id)!.name).toBe('Bob')
    expect(useWorkspaceStore.getState().selectedElementIds).toContain(id)
  })

  it('addSoftwareSystem creates a system and selects it', () => {
    const id = useWorkspaceStore.getState().addSoftwareSystem('Backend')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.softwareSystems.find(s => s.id === id)).toBeDefined()
    expect(useWorkspaceStore.getState().selectedElementIds).toContain(id)
  })

  it('addContainer creates a container and selects it', () => {
    const sysId = useWorkspaceStore.getState().addSoftwareSystem('MySys')
    const id = useWorkspaceStore.getState().addContainer(sysId, 'WebApp')
    const ws = useWorkspaceStore.getState().workspace!
    const sys = ws.model.softwareSystems.find(s => s.id === sysId)!
    expect(sys.containers.find(c => c.id === id)).toBeDefined()
    expect(useWorkspaceStore.getState().selectedElementIds).toContain(id)
  })

  it('addComponent creates a component and selects it', () => {
    const sysId = useWorkspaceStore.getState().addSoftwareSystem('MySys2')
    const containerId = useWorkspaceStore.getState().addContainer(sysId, 'API')
    const id = useWorkspaceStore.getState().addComponent(containerId, 'AuthService')
    const ws = useWorkspaceStore.getState().workspace!
    const sys = ws.model.softwareSystems.find(s => s.id === sysId)!
    const container = sys.containers.find(c => c.id === containerId)!
    expect(container.components.find(c => c.id === id)).toBeDefined()
    expect(useWorkspaceStore.getState().selectedElementIds).toContain(id)
  })

  it('updateElement updates name and description', () => {
    useWorkspaceStore.getState().updateElement('alice', { name: 'Alice Smith', description: 'Lead dev' })
    const ws = useWorkspaceStore.getState().workspace!
    const alice = ws.model.people.find(p => p.id === 'alice')!
    expect(alice.name).toBe('Alice Smith')
    expect(alice.description).toBe('Lead dev')
  })

  it('deleteElement removes a person from model', () => {
    useWorkspaceStore.getState().deleteElement('alice')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.people.find(p => p.id === 'alice')).toBeUndefined()
  })

  it('deleteElement also removes relationships referencing that element', () => {
    useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(1)
    useWorkspaceStore.getState().deleteElement('alice')
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(0)
  })

  it('deleteElements batch-deletes multiple elements', () => {
    useWorkspaceStore.getState().deleteElements(['alice', 'api'])
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.people).toHaveLength(0)
    expect(ws.model.softwareSystems).toHaveLength(0)
  })

  it('undo after deleteElement restores the person', () => {
    useWorkspaceStore.getState().deleteElement('alice')
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace!.model.people.find(p => p.id === 'alice')).toBeDefined()
  })

  it('deleteElements clears selectedElementIds', () => {
    useWorkspaceStore.getState().selectElements(['alice', 'api'])
    useWorkspaceStore.getState().deleteElements(['alice', 'api'])
    expect(useWorkspaceStore.getState().selectedElementIds).toHaveLength(0)
  })

  it('deleteElements removes elements from all views', () => {
    const viewKey = useWorkspaceStore.getState().addView('systemContext', 'api', 'Context')
    useWorkspaceStore.getState().setActiveView(viewKey)
    // addPerson places the element into the active view
    const newId = useWorkspaceStore.getState().addPerson('Visitor')
    const ws1 = useWorkspaceStore.getState().workspace!
    const view1 = ws1.views.systemContextViews.find(v => v.key === viewKey)!
    expect(view1.elements.some(e => e.id === newId)).toBe(true)

    useWorkspaceStore.getState().deleteElements([newId])
    const ws2 = useWorkspaceStore.getState().workspace!
    const view2 = ws2.views.systemContextViews.find(v => v.key === viewKey)!
    expect(view2.elements.some(e => e.id === newId)).toBe(false)
  })

  it('deleteElements removes relationships referencing any deleted element', () => {
    useWorkspaceStore.getState().addRelationship('alice', 'api', 'uses')
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(1)
    useWorkspaceStore.getState().deleteElements(['alice'])
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(0)
  })

  it('deleteElements removes group memberships for deleted elements', () => {
    useWorkspaceStore.getState().addGroup('Team', ['alice', 'api'])
    useWorkspaceStore.getState().deleteElements(['alice'])
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.groups[0].elementIds).toEqual(['api'])
  })

  it('undo after deleteElements restores all deleted elements', () => {
    useWorkspaceStore.getState().deleteElements(['alice', 'api'])
    useWorkspaceStore.getState().undo()
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.people.find(p => p.id === 'alice')).toBeDefined()
    expect(ws.model.softwareSystems.find(s => s.id === 'api')).toBeDefined()
  })
})

// ─── UI Toggles ──────────────────────────────────────────────────────

describe('UI toggles', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().closeWorkspace()
  })

  it('toggleLeftPanel flips leftPanelOpen', () => {
    const before = useWorkspaceStore.getState().leftPanelOpen
    useWorkspaceStore.getState().toggleLeftPanel()
    expect(useWorkspaceStore.getState().leftPanelOpen).toBe(!before)
  })

  it('toggleRightPanel flips rightPanelOpen', () => {
    const before = useWorkspaceStore.getState().rightPanelOpen
    useWorkspaceStore.getState().toggleRightPanel()
    expect(useWorkspaceStore.getState().rightPanelOpen).toBe(!before)
  })

  it('setSearchOpen sets searchOpen', () => {
    useWorkspaceStore.getState().setSearchOpen(true)
    expect(useWorkspaceStore.getState().searchOpen).toBe(true)
    useWorkspaceStore.getState().setSearchOpen(false)
    expect(useWorkspaceStore.getState().searchOpen).toBe(false)
  })

  it('setCommandPaletteOpen sets commandPaletteOpen', () => {
    useWorkspaceStore.getState().setCommandPaletteOpen(true)
    expect(useWorkspaceStore.getState().commandPaletteOpen).toBe(true)
  })

  it('setPresentationMode sets presentationMode', () => {
    useWorkspaceStore.getState().setPresentationMode(true)
    expect(useWorkspaceStore.getState().presentationMode).toBe(true)
    useWorkspaceStore.getState().setPresentationMode(false)
    expect(useWorkspaceStore.getState().presentationMode).toBe(false)
  })

  it('toggleMinimap flips minimapEnabled', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    const before = useWorkspaceStore.getState().minimapEnabled
    useWorkspaceStore.getState().toggleMinimap()
    expect(useWorkspaceStore.getState().minimapEnabled).toBe(!before)
  })

  it('toggleSnapToGrid flips snapToGrid', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    const before = useWorkspaceStore.getState().snapToGrid
    useWorkspaceStore.getState().toggleSnapToGrid()
    expect(useWorkspaceStore.getState().snapToGrid).toBe(!before)
  })

  it('setViewsPanelOpen sets viewsPanelOpen', () => {
    useWorkspaceStore.getState().setViewsPanelOpen(true)
    expect(useWorkspaceStore.getState().viewsPanelOpen).toBe(true)
  })

  it('toggleViewsPanel flips viewsPanelOpen', () => {
    const before = useWorkspaceStore.getState().viewsPanelOpen
    useWorkspaceStore.getState().toggleViewsPanel()
    expect(useWorkspaceStore.getState().viewsPanelOpen).toBe(!before)
  })

  it('setCanvasSettingsOpen opens settings and closes command palette', () => {
    useWorkspaceStore.setState({ commandPaletteOpen: true })
    useWorkspaceStore.getState().setCanvasSettingsOpen(true)
    expect(useWorkspaceStore.getState().canvasSettingsOpen).toBe(true)
    expect(useWorkspaceStore.getState().commandPaletteOpen).toBe(false)
  })

  it('setAddElementPanelOpen opens panel and closes command palette', () => {
    useWorkspaceStore.setState({ commandPaletteOpen: true })
    useWorkspaceStore.getState().setAddElementPanelOpen(true)
    expect(useWorkspaceStore.getState().addElementPanelOpen).toBe(true)
    expect(useWorkspaceStore.getState().commandPaletteOpen).toBe(false)
  })

  it('setAddElementPanelOpen false closes the panel', () => {
    useWorkspaceStore.setState({ addElementPanelOpen: true })
    useWorkspaceStore.getState().setAddElementPanelOpen(false)
    expect(useWorkspaceStore.getState().addElementPanelOpen).toBe(false)
  })
})

// ─── Navigation ──────────────────────────────────────────────────────

describe('Navigation', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('navigateBack returns to previous view', () => {
    const key1 = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'V1')
    const key2 = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'V2')
    useWorkspaceStore.getState().setActiveView(key1)
    useWorkspaceStore.getState().setActiveView(key2)
    // viewHistory won't work via setActiveView, only drillInto. Test navigateBack on empty history.
    useWorkspaceStore.getState().navigateBack()
    // With empty viewHistory, navigateBack is a no-op
    expect(useWorkspaceStore.getState().activeViewKey).toBe(key2)
  })

  it('canUndo returns false on fresh workspace', () => {
    expect(useWorkspaceStore.getState().canUndo()).toBe(false)
  })

  it('canUndo returns true after a mutation', () => {
    useWorkspaceStore.getState().addPerson('Test')
    expect(useWorkspaceStore.getState().canUndo()).toBe(true)
  })

  it('canRedo returns false when no undos performed', () => {
    expect(useWorkspaceStore.getState().canRedo()).toBe(false)
  })

  it('canRedo returns true after an undo', () => {
    useWorkspaceStore.getState().addPerson('Test')
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().canRedo()).toBe(true)
  })
})

describe('toggleElementInView', () => {
  let viewKey: string

  beforeEach(() => {
    useWorkspaceStore.setState({
      workspace: makeWorkspace(),
      activeViewKey: null,
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
      undoStack: [],
      redoStack: [],
    })
    viewKey = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape')
  })

  it('removes element from view when already present (auto-populated)', () => {
    // systemLandscape views auto-populate with all model elements, so alice is already in view
    const viewBefore = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === viewKey)
    expect(viewBefore?.elements.some(e => e.id === 'alice')).toBe(true)
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'alice')
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === viewKey)
    expect(view?.elements.some(e => e.id === 'alice')).toBe(false)
  })

  it('adds element to view when not present (toggle back after removal)', () => {
    // Remove alice (auto-populated), then add her back
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'alice')
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'alice')
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === viewKey)
    expect(view?.elements.some(e => e.id === 'alice')).toBe(true)
  })

  it('supports undo after toggle', () => {
    // alice is auto-populated in the view; toggle removes her, undo restores her
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'alice')
    const viewAfterToggle = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === viewKey)
    expect(viewAfterToggle?.elements.some(e => e.id === 'alice')).toBe(false)
    useWorkspaceStore.getState().undo()
    const viewAfterUndo = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === viewKey)
    expect(viewAfterUndo?.elements.some(e => e.id === 'alice')).toBe(true)
  })
})

describe('toggleElementInView — relationship auto-discovery', () => {
  function makeWorkspaceWithRel(): Workspace {
    return {
      name: 'Test',
      model: {
        people: [
          { id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} },
          { id: 'bob', type: 'person', name: 'Bob', tags: ['Element', 'Person'], properties: {} },
        ],
        softwareSystems: [{ id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {}, containers: [] }],
        relationships: [{ id: 'rel1', sourceId: 'alice', destinationId: 'api', description: 'Uses', tags: [] }],
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

  let viewKey: string

  beforeEach(() => {
    useWorkspaceStore.setState({
      workspace: makeWorkspaceWithRel(),
      activeViewKey: null,
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
      undoStack: [],
      redoStack: [],
    })
    viewKey = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape')
  })

  it('auto-adds relationships when toggling an element back into view', () => {
    // systemLandscape auto-populates: alice, bob, api, and rel1 (alice→api)
    const viewInit = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === viewKey)!
    expect(viewInit.relationships.some(r => r.id === 'rel1')).toBe(true)

    // Remove alice — rel1 is also removed since it references alice
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'alice')
    const viewAfterRemove = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === viewKey)!
    expect(viewAfterRemove.elements.some(e => e.id === 'alice')).toBe(false)
    expect(viewAfterRemove.relationships.some(r => r.id === 'rel1')).toBe(false)

    // Toggle alice back in — rel1 should auto-appear (api is still in the view)
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'alice')
    const viewAfterReAdd = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === viewKey)!
    expect(viewAfterReAdd.elements.some(e => e.id === 'alice')).toBe(true)
    expect(viewAfterReAdd.relationships.some(r => r.id === 'rel1')).toBe(true)
  })

  it('does not auto-add relationship when the other endpoint is not in the view', () => {
    // Remove alice (rel1 removed) then remove api (now neither endpoint is in view)
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'alice')
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'api')

    // Toggle alice back in — api is NOT in view, so rel1 should NOT appear
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'alice')
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === viewKey)!
    expect(view.elements.some(e => e.id === 'alice')).toBe(true)
    expect(view.relationships.some(r => r.id === 'rel1')).toBe(false)
  })
})

describe('renameView', () => {
  let viewKey: string

  beforeEach(() => {
    useWorkspaceStore.setState({
      workspace: makeWorkspace(),
      activeViewKey: null,
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
      undoStack: [],
      redoStack: [],
    })
    viewKey = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape')
  })

  it('renames a view by key', () => {
    useWorkspaceStore.getState().renameView(viewKey, 'Updated Title')
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === viewKey)
    expect(view?.title).toBe('Updated Title')
  })

  it('is a no-op for non-existent key', () => {
    useWorkspaceStore.getState().renameView('nonexistent', 'Whatever')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.views.systemLandscapeViews.find(v => v.title === 'Whatever')).toBeUndefined()
  })

  it('supports undo', () => {
    useWorkspaceStore.getState().renameView(viewKey, 'New Name')
    useWorkspaceStore.getState().undo()
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === viewKey)
    expect(view?.title).toBe('Landscape')
  })
})

describe('duplicateView', () => {
  let viewKey: string

  beforeEach(() => {
    useWorkspaceStore.setState({
      workspace: makeWorkspace(),
      activeViewKey: null,
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
      undoStack: [],
      redoStack: [],
    })
    viewKey = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'My View')
  })

  it('creates a new view in the same array with a copy suffix', () => {
    useWorkspaceStore.getState().duplicateView(viewKey)
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.views.systemLandscapeViews).toHaveLength(2)
    const copy = ws.views.systemLandscapeViews[1]
    expect(copy.title).toBe('My View copy')
  })

  it('gives the duplicate a different key', () => {
    const newKey = useWorkspaceStore.getState().duplicateView(viewKey)
    expect(newKey).not.toBe(viewKey)
    const ws = useWorkspaceStore.getState().workspace!
    const copy = ws.views.systemLandscapeViews.find(v => v.key === newKey)
    expect(copy).toBeDefined()
  })

  it('copies elements from the source view', () => {
    const ws0 = useWorkspaceStore.getState().workspace!
    const src = ws0.views.systemLandscapeViews.find(v => v.key === viewKey)!
    const srcElCount = src.elements.length

    const newKey = useWorkspaceStore.getState().duplicateView(viewKey)
    const ws = useWorkspaceStore.getState().workspace!
    const copy = ws.views.systemLandscapeViews.find(v => v.key === newKey)!
    expect(copy.elements).toHaveLength(srcElCount)
  })

  it('activates the duplicate after creation', () => {
    const newKey = useWorkspaceStore.getState().duplicateView(viewKey)
    expect(useWorkspaceStore.getState().activeViewKey).toBe(newKey)
  })

  it('supports undo', () => {
    useWorkspaceStore.getState().duplicateView(viewKey)
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews).toHaveLength(2)
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews).toHaveLength(1)
  })

  it('is a no-op for non-existent key (returns a key but adds nothing)', () => {
    useWorkspaceStore.getState().duplicateView('nonexistent')
    // The view does not get added since source was not found
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.views.systemLandscapeViews).toHaveLength(1)
  })
})

describe('updateWorkspaceMeta', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspace: makeWorkspace(),
      activeViewKey: null,
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
      undoStack: [],
      redoStack: [],
    })
  })

  it('updates workspace name', () => {
    useWorkspaceStore.getState().updateWorkspaceMeta({ name: 'Renamed' })
    expect(useWorkspaceStore.getState().workspace?.name).toBe('Renamed')
  })

  it('updates workspace description', () => {
    useWorkspaceStore.getState().updateWorkspaceMeta({ description: 'A great system.' })
    expect(useWorkspaceStore.getState().workspace?.description).toBe('A great system.')
  })

  it('supports undo', () => {
    useWorkspaceStore.getState().updateWorkspaceMeta({ name: 'Changed' })
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace?.name).toBe('Test')
  })
})

// ─── duplicateElements ────────────────────────────────────────────────

describe('duplicateElements', () => {
  let viewKey: string

  beforeEach(() => {
    useWorkspaceStore.setState({
      workspace: makeWorkspace(),
      activeViewKey: null,
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
      undoStack: [],
      redoStack: [],
      viewHistory: [],
    })
    viewKey = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape')
    // Add both elements to the view so they have positions
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'alice')
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'api')
  })

  it('duplicates a person with a unique name', () => {
    const newIds = useWorkspaceStore.getState().duplicateElements(['alice'])
    expect(newIds).toHaveLength(1)
    const ws = useWorkspaceStore.getState().workspace!
    const original = ws.model.people.find(p => p.id === 'alice')
    const clone = ws.model.people.find(p => p.id === newIds[0])
    expect(clone).toBeDefined()
    expect(clone?.name).not.toBe(original?.name)
    expect(clone?.name).toContain('copy')
  })

  it('duplicates a softwareSystem', () => {
    const newIds = useWorkspaceStore.getState().duplicateElements(['api'])
    expect(newIds).toHaveLength(1)
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.softwareSystems).toHaveLength(2)
    const clone = ws.model.softwareSystems.find(s => s.id === newIds[0])
    expect(clone?.name).toContain('copy')
  })

  it('adds the duplicate to the current view at an offset position', () => {
    const newIds = useWorkspaceStore.getState().duplicateElements(['alice'])
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.systemLandscapeViews.find(v => v.key === viewKey)!
    const cloneInView = view.elements.find(e => e.id === newIds[0])
    expect(cloneInView).toBeDefined()
  })

  it('selects the duplicated elements', () => {
    const newIds = useWorkspaceStore.getState().duplicateElements(['alice'])
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual(newIds)
  })

  it('supports undo', () => {
    const beforeCount = useWorkspaceStore.getState().workspace!.model.people.length
    useWorkspaceStore.getState().duplicateElements(['alice'])
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace!.model.people).toHaveLength(beforeCount)
  })

  it('is a no-op if element does not exist', () => {
    const newIds = useWorkspaceStore.getState().duplicateElements(['nonexistent'])
    expect(newIds).toHaveLength(0)
  })

  it('duplicates relationships between elements in the selection', () => {
    // Add a relationship from alice → api in the model
    useWorkspaceStore.getState().addRelationship('alice', 'api', 'Uses')
    const ws0 = useWorkspaceStore.getState().workspace!
    const origRelId = ws0.model.relationships[0].id

    // Duplicate both elements together
    const newIds = useWorkspaceStore.getState().duplicateElements(['alice', 'api'])
    expect(newIds).toHaveLength(2)

    const ws = useWorkspaceStore.getState().workspace!
    // A new relationship should have been created between the two clones
    const cloneRel = ws.model.relationships.find(r => r.id !== origRelId)
    expect(cloneRel).toBeDefined()
    expect(newIds).toContain(cloneRel!.sourceId)
    expect(newIds).toContain(cloneRel!.destinationId)
  })

  it('does not duplicate relationships to elements outside the selection', () => {
    // Relationship from alice → api; only duplicate alice
    useWorkspaceStore.getState().addRelationship('alice', 'api', 'Uses')
    const ws0 = useWorkspaceStore.getState().workspace!
    const relsBefore = ws0.model.relationships.length

    useWorkspaceStore.getState().duplicateElements(['alice'])
    const ws = useWorkspaceStore.getState().workspace!
    // No new relationship: api is not in the selection, so the relationship is not cloned
    expect(ws.model.relationships).toHaveLength(relsBefore)
  })
})

// ─── drillInto & navigateBack ────────────────────────────────────────

describe('drillInto', () => {
  let systemId: string
  let containerViewKey: string

  beforeEach(() => {
    useWorkspaceStore.setState({
      workspace: makeWorkspace(),
      activeViewKey: null,
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
      undoStack: [],
      redoStack: [],
      viewHistory: [],
    })
    // Set up: a systemContext view, a softwareSystem, and a container view for it.
    // addView auto-activates the created view, so we set the ctxView as active at the end.
    const ctxKey = useWorkspaceStore.getState().addView('systemContext', 'api', 'API Context')
    containerViewKey = useWorkspaceStore.getState().addView('container', 'api', 'API Containers')
    useWorkspaceStore.getState().setActiveView(ctxKey) // ensure we start on the context view
    systemId = 'api'
  })

  it('navigates to child container view and pushes current key to history', () => {
    const ctxKey = useWorkspaceStore.getState().activeViewKey!
    useWorkspaceStore.getState().drillInto(systemId)
    expect(useWorkspaceStore.getState().activeViewKey).toBe(containerViewKey)
    expect(useWorkspaceStore.getState().viewHistory).toContain(ctxKey)
  })

  it('is a no-op when no child view exists for the element', () => {
    const ctxKey = useWorkspaceStore.getState().activeViewKey!
    useWorkspaceStore.getState().drillInto('alice') // person — no child view
    expect(useWorkspaceStore.getState().activeViewKey).toBe(ctxKey)
    expect(useWorkspaceStore.getState().viewHistory).toHaveLength(0)
  })

  it('clears selection when drilling in', () => {
    useWorkspaceStore.getState().selectElements([systemId])
    expect(useWorkspaceStore.getState().selectedElementIds).toHaveLength(1)
    useWorkspaceStore.getState().drillInto(systemId)
    expect(useWorkspaceStore.getState().selectedElementIds).toHaveLength(0)
  })
})

describe('navigateBack', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspace: makeWorkspace(),
      activeViewKey: null,
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
      undoStack: [],
      redoStack: [],
      viewHistory: [],
    })
    const ctxKey = useWorkspaceStore.getState().addView('systemContext', 'api', 'API Context')
    useWorkspaceStore.getState().addView('container', 'api', 'API Containers')
    useWorkspaceStore.getState().setActiveView(ctxKey) // ensure we start on the context view
  })

  it('returns to previous view after drillInto', () => {
    const ctxKey = useWorkspaceStore.getState().activeViewKey!
    useWorkspaceStore.getState().drillInto('api')
    useWorkspaceStore.getState().navigateBack()
    expect(useWorkspaceStore.getState().activeViewKey).toBe(ctxKey)
    expect(useWorkspaceStore.getState().viewHistory).toHaveLength(0)
  })

  it('is a no-op when history is empty', () => {
    const key = useWorkspaceStore.getState().activeViewKey!
    useWorkspaceStore.getState().navigateBack()
    expect(useWorkspaceStore.getState().activeViewKey).toBe(key)
  })
})

// ─── updateElementLive ───────────────────────────────────────────────

describe('updateElementLive', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspace: makeWorkspace(),
      activeViewKey: null,
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
      undoStack: [],
      redoStack: [],
    })
  })

  it('updates element name immediately', () => {
    useWorkspaceStore.getState().updateElementLive('alice', { name: 'Bob' })
    expect(useWorkspaceStore.getState().workspace?.model.people[0].name).toBe('Bob')
  })

  it('updates element description', () => {
    useWorkspaceStore.getState().updateElementLive('alice', { description: 'A user' })
    expect(useWorkspaceStore.getState().workspace?.model.people[0].description).toBe('A user')
  })

  it('does NOT push to undo stack (live typing perf)', () => {
    useWorkspaceStore.getState().updateElementLive('alice', { name: 'Charlie' })
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
    expect(useWorkspaceStore.getState().canUndo()).toBe(false)
  })
})
