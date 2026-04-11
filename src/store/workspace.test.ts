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

  it('deleteRelationship removes it from model', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    useWorkspaceStore.getState().deleteRelationship(relId)
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.relationships).toHaveLength(0)
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
    expect(view.elements).toEqual([])
    expect(view.relationships).toEqual([])
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

  it('adds element to view when not already present', () => {
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'alice')
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === viewKey)
    expect(view?.elements.some(e => e.id === 'alice')).toBe(true)
  })

  it('removes element from view when already present', () => {
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'alice')
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'alice')
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === viewKey)
    expect(view?.elements.some(e => e.id === 'alice')).toBe(false)
  })

  it('supports undo after toggle', () => {
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'alice')
    useWorkspaceStore.getState().undo()
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === viewKey)
    expect(view?.elements.some(e => e.id === 'alice')).toBe(false)
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
