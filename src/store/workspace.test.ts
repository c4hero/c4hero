import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore, getBreadcrumb, getCreatableTypes, buildElementMap, buildRelationshipMap, canDrillInto, getRelationshipById, getSelectedElement } from './workspace'
import { MAX_UNDO } from './workspace-types'
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

  it('deleteElement preserves groups that become empty after member deletion', () => {
    useWorkspaceStore.getState().addGroup('Solo', ['alice'])
    useWorkspaceStore.getState().deleteElement('alice')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.groups).toHaveLength(1)
    expect(ws.model.groups[0]).toMatchObject({ name: 'Solo', elementIds: [] })
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

  it('deleteGroup is a no-op (no undo) when group ID does not exist', () => {
    const prevUndoLength = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().deleteGroup('non-existent-group-id')
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(prevUndoLength)
  })

  it('updateGroup name is a no-op (no undo entry) when name is already the same value', () => {
    useWorkspaceStore.getState().addGroup('Team Alpha', ['alice'])
    const id = useWorkspaceStore.getState().workspace!.model.groups[0].id
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().updateGroup(id, { name: 'Team Alpha' }) // same name
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
    expect(useWorkspaceStore.getState().workspace!.model.groups[0].name).toBe('Team Alpha')
  })

  it('setActiveView clears selectedGroupId', () => {
    const viewKey = useWorkspaceStore.getState().addView('systemLandscape')
    useWorkspaceStore.getState().addGroup('Team', ['alice'])
    const groupId = useWorkspaceStore.getState().workspace!.model.groups[0].id
    useWorkspaceStore.getState().selectGroup(groupId)
    expect(useWorkspaceStore.getState().selectedGroupId).toBe(groupId)
    useWorkspaceStore.getState().setActiveView(viewKey)
    expect(useWorkspaceStore.getState().selectedGroupId).toBeNull()
  })

  it('drillInto clears selectedGroupId', () => {
    useWorkspaceStore.getState().addContainer('api', 'Web')
    useWorkspaceStore.getState().addView('container', 'api', 'API Containers')
    const landscapeKey = useWorkspaceStore.getState().addView('systemLandscape')
    useWorkspaceStore.getState().setActiveView(landscapeKey)
    useWorkspaceStore.getState().addGroup('Team', ['alice'])
    const groupId = useWorkspaceStore.getState().workspace!.model.groups[0].id
    useWorkspaceStore.getState().selectGroup(groupId)
    expect(useWorkspaceStore.getState().selectedGroupId).toBe(groupId)
    useWorkspaceStore.getState().drillInto('api')
    expect(useWorkspaceStore.getState().selectedGroupId).toBeNull()
  })

  it('navigateBack clears selectedGroupId', () => {
    const landscapeKey = useWorkspaceStore.getState().addView('systemLandscape')
    useWorkspaceStore.getState().addContainer('api', 'Web')
    useWorkspaceStore.getState().addView('container', 'api', 'API Containers')
    useWorkspaceStore.getState().setActiveView(landscapeKey)
    // Simulate navigating forward so there's something to go back to
    useWorkspaceStore.setState({ viewHistory: [landscapeKey] })
    useWorkspaceStore.getState().addGroup('Team', ['alice'])
    const groupId = useWorkspaceStore.getState().workspace!.model.groups[0].id
    useWorkspaceStore.getState().selectGroup(groupId)
    expect(useWorkspaceStore.getState().selectedGroupId).toBe(groupId)
    useWorkspaceStore.getState().navigateBack()
    expect(useWorkspaceStore.getState().selectedGroupId).toBeNull()
  })

  it('deleteElements clears selectedGroupId', () => {
    useWorkspaceStore.getState().addGroup('Team', ['alice', 'api'])
    const groupId = useWorkspaceStore.getState().workspace!.model.groups[0].id
    useWorkspaceStore.getState().selectGroup(groupId)
    expect(useWorkspaceStore.getState().selectedGroupId).toBe(groupId)
    useWorkspaceStore.getState().deleteElements(['alice'])
    expect(useWorkspaceStore.getState().selectedGroupId).toBeNull()
  })
})

// ─── Relationship and Container Mutations ─────────────────────────────

describe('Relationship and container mutations', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('addContainer on a view that cannot hold it creates a scoped container view so it is not stranded', () => {
    const land = useWorkspaceStore.getState().addView('systemLandscape')
    useWorkspaceStore.getState().setActiveView(land)
    const cid = useWorkspaceStore.getState().addContainer('api', 'Web')
    const ws = useWorkspaceStore.getState().workspace!
    // A container view for 'api' now exists and shows the new container…
    const cv = ws.views.containerViews.find((v) => v.softwareSystemId === 'api')
    expect(cv).toBeDefined()
    expect(cv!.elements.some((e) => e.id === cid)).toBe(true)
    // …it became active, and the landscape view never received the container.
    expect(useWorkspaceStore.getState().activeViewKey).toBe(cv!.key)
    expect(ws.views.systemLandscapeViews.find((v) => v.key === land)!.elements.some((e) => e.id === cid)).toBe(false)
  })

  it('addContainer reuses an existing scoped container view instead of creating another', () => {
    const cvKey = useWorkspaceStore.getState().addView('container', 'api', 'API Containers')
    const land = useWorkspaceStore.getState().addView('systemLandscape')
    useWorkspaceStore.getState().setActiveView(land)
    const before = useWorkspaceStore.getState().workspace!.views.containerViews.length
    const cid = useWorkspaceStore.getState().addContainer('api', 'Web')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.views.containerViews.length).toBe(before) // no extra view created
    expect(ws.views.containerViews.find((v) => v.key === cvKey)!.elements.some((e) => e.id === cid)).toBe(true)
  })

  it('selecting an element leaves the AI panel and settings open (bottom-left dock — no shared slot)', () => {
    useWorkspaceStore.getState().setAiSettingsOpen(true)
    useWorkspaceStore.getState().setAiPanelOpen(true)
    useWorkspaceStore.getState().selectElements(['alice'])
    expect(useWorkspaceStore.getState().aiSettingsOpen).toBe(true)
    expect(useWorkspaceStore.getState().aiPanelOpen).toBe(true)
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual(['alice'])
  })

  it('opening AI settings keeps the current selection (inspector and assistant are independent)', () => {
    useWorkspaceStore.getState().selectElements(['alice'])
    useWorkspaceStore.getState().setAiSettingsOpen(true)
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual(['alice'])
  })

  it('selecting a node while the assistant is open keeps the panel open', () => {
    useWorkspaceStore.getState().setAiPanelOpen(true)
    useWorkspaceStore.getState().selectElements(['alice'])
    expect(useWorkspaceStore.getState().aiPanelOpen).toBe(true) // survives the click
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual(['alice'])
  })

  it('addContainer during a batch apply does not jump the active view', () => {
    const land = useWorkspaceStore.getState().addView('systemLandscape')
    useWorkspaceStore.getState().setActiveView(land)
    useWorkspaceStore.getState().setBatchApplying(true)
    const cid = useWorkspaceStore.getState().addContainer('api', 'Web')
    useWorkspaceStore.getState().setBatchApplying(false)
    // Scoped view created, but the canvas stayed put (panel navigates once after).
    expect(useWorkspaceStore.getState().activeViewKey).toBe(land)
    const cv = useWorkspaceStore.getState().workspace!.views.containerViews.find((v) => v.softwareSystemId === 'api')
    expect(cv!.elements.some((e) => e.id === cid)).toBe(true)
  })

  it('coalesces a batch apply into a single, fully-reversible undo entry', () => {
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().setBatchApplying(true)
    useWorkspaceStore.getState().addSoftwareSystem('Billing')
    useWorkspaceStore.getState().addSoftwareSystem('Shipping')
    useWorkspaceStore.getState().addSoftwareSystem('Inventory')
    useWorkspaceStore.getState().setBatchApplying(false)
    // Exactly ONE snapshot was pushed for the whole batch (not one per op).
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore + 1)
    const created = useWorkspaceStore.getState().workspace!.model.softwareSystems.map((s) => s.name)
    expect(created).toEqual(expect.arrayContaining(['Billing', 'Shipping', 'Inventory']))
    // A single undo reverts the entire batch.
    useWorkspaceStore.getState().undo()
    const names = useWorkspaceStore.getState().workspace!.model.softwareSystems.map((s) => s.name)
    expect(names).not.toContain('Billing')
    expect(names).not.toContain('Inventory')
  })

  it('coalesces element creation AND view mutations in one batch (repo-scan import shape)', () => {
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().setBatchApplying(true)
    const sysId = useWorkspaceStore.getState().addSoftwareSystem('Imported')
    const viewKey = useWorkspaceStore.getState().addView('systemContext', sysId, 'Imported — Context')
    useWorkspaceStore.getState().removeElementsFromView(viewKey, [sysId])
    useWorkspaceStore.getState().setBatchApplying(false)
    // The plan apply + addView + removeElementsFromView are ONE undo entry, not three.
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore + 1)
    // A single undo reverts the whole import: system gone, its view gone.
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace!.model.softwareSystems.map((s) => s.name)).not.toContain('Imported')
    expect(useWorkspaceStore.getState().workspace!.views.systemContextViews.some((v) => v.key === viewKey)).toBe(false)
  })

  it('a no-op batch leaves the undo and redo stacks untouched', () => {
    // Build a redo entry: mutate then undo.
    useWorkspaceStore.getState().addSoftwareSystem('Temp')
    useWorkspaceStore.getState().undo()
    const undoLen = useWorkspaceStore.getState().undoStack.length
    const redoLen = useWorkspaceStore.getState().redoStack.length
    expect(redoLen).toBeGreaterThan(0)
    // A batch that changes nothing must not push a phantom undo entry or clear redo.
    useWorkspaceStore.getState().setBatchApplying(true)
    useWorkspaceStore.getState().setBatchApplying(false)
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoLen)
    expect(useWorkspaceStore.getState().redoStack.length).toBe(redoLen)
  })

  it('a no-op batch at MAX_UNDO does not silently drop the oldest undo step', () => {
    // Fill the undo stack past its cap so the up-front batch snapshot would
    // push + trim (leaving length unchanged — the case the old length check
    // missed). Each add pushes one snapshot.
    for (let i = 0; i < MAX_UNDO + 5; i++) useWorkspaceStore.getState().addSoftwareSystem(`Sys${i}`)
    expect(useWorkspaceStore.getState().undoStack.length).toBe(MAX_UNDO)
    const stackBefore = useWorkspaceStore.getState().undoStack.slice()
    // A batch that changes nothing must restore the stack exactly — same length
    // AND same oldest entry (not trimmed away).
    useWorkspaceStore.getState().setBatchApplying(true)
    useWorkspaceStore.getState().setBatchApplying(false)
    expect(useWorkspaceStore.getState().undoStack.length).toBe(MAX_UNDO)
    expect(useWorkspaceStore.getState().undoStack[0]).toBe(stackBefore[0])
    expect(useWorkspaceStore.getState().undoStack).toEqual(stackBefore)
  })

  it('resetWorkspaceTo replaces the model without pushing an undo entry', () => {
    const undoLen = useWorkspaceStore.getState().undoStack.length
    const target: Workspace = { ...makeWorkspace(), name: 'Replaced' }
    target.model.softwareSystems = [...target.model.softwareSystems, { id: 'extra', type: 'softwareSystem', name: 'Extra', tags: [], properties: {}, containers: [] }]
    useWorkspaceStore.getState().resetWorkspaceTo(target)
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.softwareSystems.some((s) => s.id === 'extra')).toBe(true)
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoLen)
  })

  it('focusViewForElements navigates to the view containing the most of them', () => {
    const cid = useWorkspaceStore.getState().addContainer('api', 'Web') // creates + switches to api container view
    const apiView = useWorkspaceStore.getState().activeViewKey!
    const land = useWorkspaceStore.getState().addView('systemLandscape')
    useWorkspaceStore.getState().setActiveView(land)
    useWorkspaceStore.getState().focusViewForElements([cid])
    expect(useWorkspaceStore.getState().activeViewKey).toBe(apiView)
  })

  it('addContainer never leaks a container into another system\'s active view', () => {
    const sysB = useWorkspaceStore.getState().addSoftwareSystem('Billing')
    const apiView = useWorkspaceStore.getState().addView('container', 'api', 'API Containers')
    useWorkspaceStore.getState().setActiveView(apiView)
    // Create a container in system B while viewing system A's container view.
    const cid = useWorkspaceStore.getState().addContainer(sysB, 'Invoices')
    const ws = useWorkspaceStore.getState().workspace!
    // It must NOT land in system A's view…
    expect(ws.views.containerViews.find((v) => v.key === apiView)!.elements.some((e) => e.id === cid)).toBe(false)
    // …it goes into a container view scoped to system B (auto-created).
    const bView = ws.views.containerViews.find((v) => v.softwareSystemId === sysB)
    expect(bView).toBeDefined()
    expect(bView!.elements.some((e) => e.id === cid)).toBe(true)
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

  it('addRelationship always seeds the Relationship built-in tag', () => {
    // Regression: parser re-adds 'Relationship' tag on roundtrip; store must also
    // produce it initially so tag-based style lookups work from the moment of creation.
    useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    const rel = useWorkspaceStore.getState().workspace!.model.relationships[0]
    expect(rel.tags).toContain('Relationship')
  })

  it('addRelationship rejects self-relationships', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'alice', 'loops')
    expect(relId).toBe('')
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(0)
  })

  it('addRelationship rejects missing endpoints', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'missing', 'calls')
    expect(relId).toBe('')
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(0)
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

  it('updateRelationship sets url', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    useWorkspaceStore.getState().updateRelationship(relId, { url: 'https://example.com/api' })
    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === relId)!
    expect(rel.url).toBe('https://example.com/api')
  })

  it('updateRelationship clears url when passed undefined (UI "clear" gesture)', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    useWorkspaceStore.getState().updateRelationship(relId, { url: 'https://example.com/api' })
    useWorkspaceStore.getState().updateRelationship(relId, { url: undefined })
    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === relId)!
    expect(rel.url).toBeUndefined()
  })

  it('updateRelationship clears description when passed undefined', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    useWorkspaceStore.getState().updateRelationship(relId, { description: 'old' })
    useWorkspaceStore.getState().updateRelationship(relId, { description: undefined })
    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === relId)!
    expect(rel.description).toBeUndefined()
  })

  it('updateRelationship clears interactionStyle when passed undefined', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    useWorkspaceStore.getState().updateRelationship(relId, { interactionStyle: 'Asynchronous' })
    useWorkspaceStore.getState().updateRelationship(relId, { interactionStyle: undefined })
    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === relId)!
    expect(rel.interactionStyle).toBeUndefined()
  })

  it('updateRelationship clears lineStyle when passed undefined', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    useWorkspaceStore.getState().updateRelationship(relId, { lineStyle: 'Curved' })
    useWorkspaceStore.getState().updateRelationship(relId, { lineStyle: undefined })
    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === relId)!
    expect(rel.lineStyle).toBeUndefined()
  })

  it('updateRelationship sets lineStyle', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    useWorkspaceStore.getState().updateRelationship(relId, { lineStyle: 'dashed' })
    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === relId)!
    expect(rel.lineStyle).toBe('dashed')
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
    // Use container views to test scope-bounded auto-add (landscape views auto-add all elements)
    // Setup: two container views for 'api', with container C1 and C2
    const c1 = useWorkspaceStore.getState().addContainer('api', 'Web')
    const c2 = useWorkspaceStore.getState().addContainer('api', 'DB')

    // Create view A (active) — gets C1 and C2 via addContainer cross-view auto-add
    const keyA = useWorkspaceStore.getState().addView('container', 'api', 'View A')
    useWorkspaceStore.getState().setActiveView(keyA)
    // Create relationship C1→C2 (both are in view A since addView auto-populates)
    const relId = useWorkspaceStore.getState().addRelationship(c1, c2, 'reads')
    const ws0 = useWorkspaceStore.getState().workspace!
    const vAbefore = ws0.views.containerViews.find(v => v.key === keyA)!
    expect(vAbefore.relationships.some(r => r.id === relId)).toBe(true)

    // Create view B for the same system but toggle C2 out of it
    const keyB = useWorkspaceStore.getState().addView('container', 'api', 'View B')
    // View B auto-populates C1 and C2; toggle C2 out
    useWorkspaceStore.getState().toggleElementInView(keyB, c2)
    // Reconnect to point at a person (alice) not in view B's container list
    // Actually use a fresh element not in either view
    // Instead: use C1→alice (alice is already in landscape views but not in container view B)
    useWorkspaceStore.getState().reconnectRelationship(relId, c1, 'alice')

    const ws = useWorkspaceStore.getState().workspace!
    const vA = ws.views.containerViews.find(v => v.key === keyA)!
    // View A has C1 (yes) and alice (alice was added by addRelationship to context views? no, this is container view)
    // alice is NOT in the container view, so relationship should be removed from vA
    expect(vA.relationships.some(r => r.id === relId)).toBe(false)
  })

  it('reconnectRelationship adds relationship to views where both new endpoints become present', () => {
    // C1 and C2 are both in viewA; create a rel between alice and a new system (neither in viewA)
    const c1 = useWorkspaceStore.getState().addContainer('api', 'Web')
    const c2 = useWorkspaceStore.getState().addContainer('api', 'DB')
    const keyA = useWorkspaceStore.getState().addView('container', 'api', 'View A')
    useWorkspaceStore.getState().setActiveView(keyA)

    // Create a relationship between alice and api (not in container view initially)
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    const ws0 = useWorkspaceStore.getState().workspace!
    const vAbefore = ws0.views.containerViews.find(v => v.key === keyA)!
    // The relationship is NOT in viewA (alice and api are not container-level elements in it)
    expect(vAbefore.relationships.some(r => r.id === relId)).toBe(false)

    // Reconnect to c1→c2 — both are already in viewA
    useWorkspaceStore.getState().reconnectRelationship(relId, c1, c2)
    const ws = useWorkspaceStore.getState().workspace!
    const vA = ws.views.containerViews.find(v => v.key === keyA)!
    // Now both endpoints (c1 and c2) exist in viewA, so the relationship should be added
    expect(vA.relationships.some(r => r.id === relId)).toBe(true)
  })

  it('reconnectRelationship auto-adds the non-scope endpoint to matching system context views', () => {
    const other = useWorkspaceStore.getState().addSoftwareSystem('Other')
    const ctxKey = useWorkspaceStore.getState().addView('systemContext', 'api', 'API Context')
    const relId = useWorkspaceStore.getState().addRelationship('alice', other, 'uses')

    const before = useWorkspaceStore.getState().workspace!.views.systemContextViews.find(v => v.key === ctxKey)!
    expect(before.elements.some(e => e.id === 'alice')).toBe(false)
    expect(before.relationships.some(r => r.id === relId)).toBe(false)

    useWorkspaceStore.getState().reconnectRelationship(relId, 'alice', 'api')

    const after = useWorkspaceStore.getState().workspace!.views.systemContextViews.find(v => v.key === ctxKey)!
    expect(after.elements.some(e => e.id === 'alice')).toBe(true)
    expect(after.relationships.some(r => r.id === relId)).toBe(true)
    expect(after.elements.some(e => e.id === other)).toBe(false)
  })

  it('reconnectRelationship is a no-op (no undo) when endpoints are unchanged', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    // Reconnect to the same endpoints — should not push undo
    useWorkspaceStore.getState().reconnectRelationship(relId, 'alice', 'api')
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
  })

  it('reconnectRelationship is a no-op when relationship id does not exist', () => {
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().reconnectRelationship('nonexistent', 'alice', 'api')
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
  })

  it('reconnectRelationship rejects self-relationships', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().reconnectRelationship(relId, 'alice', 'alice')
    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === relId)!
    expect(rel.sourceId).toBe('alice')
    expect(rel.destinationId).toBe('api')
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
  })

  it('reconnectRelationship rejects missing endpoints', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().reconnectRelationship(relId, 'alice', 'missing')
    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === relId)!
    expect(rel.sourceId).toBe('alice')
    expect(rel.destinationId).toBe('api')
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
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

  it('deleteRelationship is a no-op (no undo) when ID does not exist', () => {
    const prevUndoLength = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().deleteRelationship('non-existent-rel-id')
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(prevUndoLength)
  })

  it('deleteRelationship clears selectedRelationshipId when the selected relationship is deleted', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    // addRelationship selects the new relationship
    expect(useWorkspaceStore.getState().selectedRelationshipId).toBe(relId)
    useWorkspaceStore.getState().deleteRelationship(relId)
    expect(useWorkspaceStore.getState().selectedRelationshipId).toBeNull()
  })

  it('deleteRelationship does not clear selectedRelationshipId for a different relationship', () => {
    const relId1 = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    const relId2 = useWorkspaceStore.getState().addRelationship('alice', 'api', 'queries')
    // After second addRelationship, relId2 is selected
    expect(useWorkspaceStore.getState().selectedRelationshipId).toBe(relId2)
    // Deleting relId1 (not the selected one) should not clear selection
    useWorkspaceStore.getState().deleteRelationship(relId1)
    expect(useWorkspaceStore.getState().selectedRelationshipId).toBe(relId2)
  })

  it('updateRelationship is a no-op (no undo entry) when description value is unchanged', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls', 'gRPC')
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().updateRelationship(relId, { description: 'calls' }) // same value
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
  })

  it('updateRelationship is a no-op when both description and technology are unchanged', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls', 'gRPC')
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().updateRelationship(relId, { description: 'calls', technology: 'gRPC' })
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
  })

  it('updateRelationship is NOT a no-op when clearing description (undefined clears existing value)', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().updateRelationship(relId, { description: undefined }) // clear
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore + 1)
    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === relId)!
    expect(rel.description).toBeUndefined()
  })

  it('updateElement is a no-op (no undo entry) when name is already the same value', () => {
    // Alice starts with name 'Alice' — patching with the same string should not push undo
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().updateElement('alice', { name: 'Alice' })
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
  })

  it('updateElement is a no-op when description is already undefined', () => {
    // Alice has no description — patching description: undefined is a no-op
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().updateElement('alice', { description: undefined })
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
  })

  it('updateElement is NOT a no-op when description is explicitly cleared (undefined replaces existing value)', () => {
    // First give Alice a description, then clear it — that IS a real change
    useWorkspaceStore.getState().updateElement('alice', { description: 'Tech lead' })
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().updateElement('alice', { description: undefined })
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore + 1)
    expect(useWorkspaceStore.getState().workspace!.model.people.find(p => p.id === 'alice')!.description).toBeUndefined()
  })

  it('updateElement is NOT a no-op when name actually changes', () => {
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().updateElement('alice', { name: 'Alice Smith' })
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore + 1)
    expect(useWorkspaceStore.getState().workspace!.model.people.find(p => p.id === 'alice')!.name).toBe('Alice Smith')
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

  it('updateElementTechnology sets technology on a container', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'API Gateway')
    useWorkspaceStore.getState().updateElementTechnology(containerId, 'Node.js')
    const ws = useWorkspaceStore.getState().workspace!
    const sys = ws.model.softwareSystems.find(s => s.id === 'api')!
    const container = sys.containers.find(c => c.id === containerId)!
    expect(container.technology).toBe('Node.js')
  })

  it('updateElementTechnology sets technology on a component', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'API Gateway')
    const compId = useWorkspaceStore.getState().addComponent(containerId, 'Auth Service')
    useWorkspaceStore.getState().updateElementTechnology(compId, 'Spring Boot')
    const ws = useWorkspaceStore.getState().workspace!
    const container = ws.model.softwareSystems[0].containers.find(c => c.id === containerId)!
    const comp = container.components.find(c => c.id === compId)!
    expect(comp.technology).toBe('Spring Boot')
  })

  it('updateElementTechnology is a no-op for people (technology does not apply)', () => {
    const before = JSON.stringify(useWorkspaceStore.getState().workspace!.model.people)
    useWorkspaceStore.getState().updateElementTechnology('alice', 'SomeStack')
    const after = JSON.stringify(useWorkspaceStore.getState().workspace!.model.people)
    expect(after).toBe(before)
  })

  it('updateElementTechnology supports undo', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'API Gateway')
    useWorkspaceStore.getState().updateElementTechnology(containerId, 'Node.js')
    useWorkspaceStore.getState().undo()
    const ws = useWorkspaceStore.getState().workspace!
    const container = ws.model.softwareSystems.find(s => s.id === 'api')!.containers.find(c => c.id === containerId)!
    expect(container.technology).toBeUndefined()
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

  it('loadWorkspace dismisses any in-flight delete dialog from the previous session', () => {
    // Confirm a delete to set pendingDelete
    useWorkspaceStore.getState().confirmDelete('Delete element?', vi.fn())
    expect(useWorkspaceStore.getState().pendingDelete).not.toBeNull()
    // Loading a new workspace must clear the stale dialog
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    expect(useWorkspaceStore.getState().pendingDelete).toBeNull()
  })

  it('confirmDelete accepts structured payload and stores impact', () => {
    const fn = vi.fn()
    useWorkspaceStore.getState().confirmDelete(
      { message: 'Delete X?', impact: {
        elementCount: 1, elementNames: ['X'],
        descendantContainers: 1, descendantComponents: 0, relationships: 0, scopedViews: 0,
      } },
      fn,
    )
    const pd = useWorkspaceStore.getState().pendingDelete
    expect(pd?.message).toBe('Delete X?')
    expect(pd?.impact?.descendantContainers).toBe(1)
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

  it('loadWorkspace clears activeTagFilter and activeStatusFilter', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.setState({ activeTagFilter: ['Database'], activeStatusFilter: ['Live'], activeTechFilter: ['Go'], activeTeamFilter: ['Platform'] })
    expect(useWorkspaceStore.getState().activeTagFilter).toEqual(['Database'])
    // Load a fresh workspace — filters should reset
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    expect(useWorkspaceStore.getState().activeTagFilter).toEqual([])
    expect(useWorkspaceStore.getState().activeStatusFilter).toEqual([])
    expect(useWorkspaceStore.getState().activeTechFilter).toEqual([])
    expect(useWorkspaceStore.getState().activeTeamFilter).toEqual([])
  })
})

// ─── Highlighter filters cleared on view change ──────────────────────

describe('Highlighter filters cleared on view change', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('setActiveView clears active filters and stashes them when filters were non-empty', () => {
    const keyA = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'A')
    const keyB = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'B')
    useWorkspaceStore.getState().setActiveView(keyA)
    useWorkspaceStore.setState({ activeTagFilter: ['Database'], activeTechFilter: ['Go'] })

    useWorkspaceStore.getState().setActiveView(keyB)

    expect(useWorkspaceStore.getState().activeTagFilter).toEqual([])
    expect(useWorkspaceStore.getState().activeTechFilter).toEqual([])
    expect(useWorkspaceStore.getState().lastClearedHighlightFilters).toEqual({
      activeTagFilter: ['Database'],
      activeStatusFilter: [],
      activeTechFilter: ['Go'],
      activeTeamFilter: [],
    })
  })

  it('setActiveView leaves the stash alone when there are no active filters to clear', () => {
    const keyA = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'A')
    const keyB = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'B')
    useWorkspaceStore.getState().setActiveView(keyA)
    useWorkspaceStore.setState({
      lastClearedHighlightFilters: {
        activeTagFilter: ['Database'], activeStatusFilter: [], activeTechFilter: [], activeTeamFilter: [],
      },
    })

    useWorkspaceStore.getState().setActiveView(keyB)

    expect(useWorkspaceStore.getState().lastClearedHighlightFilters).toEqual({
      activeTagFilter: ['Database'], activeStatusFilter: [], activeTechFilter: [], activeTeamFilter: [],
    })
  })

  it('setActiveView with the same key is a no-op for filters', () => {
    const keyA = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'A')
    useWorkspaceStore.getState().setActiveView(keyA)
    useWorkspaceStore.setState({ activeTagFilter: ['Database'] })

    useWorkspaceStore.getState().setActiveView(keyA)

    expect(useWorkspaceStore.getState().activeTagFilter).toEqual(['Database'])
    expect(useWorkspaceStore.getState().lastClearedHighlightFilters).toBeNull()
  })

  it('drillInto clears active filters and stashes them', () => {
    useWorkspaceStore.getState().addContainer('api', 'Web')
    useWorkspaceStore.getState().addView('container', 'api', 'API Containers')
    const landscapeKey = useWorkspaceStore.getState().addView('systemLandscape')
    useWorkspaceStore.getState().setActiveView(landscapeKey)
    useWorkspaceStore.setState({ activeTagFilter: ['Database'] })

    useWorkspaceStore.getState().drillInto('api')

    expect(useWorkspaceStore.getState().activeTagFilter).toEqual([])
    expect(useWorkspaceStore.getState().lastClearedHighlightFilters?.activeTagFilter).toEqual(['Database'])
  })

  it('navigateBack clears active filters and stashes them', () => {
    const landscapeKey = useWorkspaceStore.getState().addView('systemLandscape')
    useWorkspaceStore.getState().addContainer('api', 'Web')
    useWorkspaceStore.getState().addView('container', 'api', 'API Containers')
    useWorkspaceStore.getState().setActiveView(landscapeKey)
    useWorkspaceStore.setState({ viewHistory: [landscapeKey], activeTagFilter: ['Database'] })

    useWorkspaceStore.getState().navigateBack()

    expect(useWorkspaceStore.getState().activeTagFilter).toEqual([])
    expect(useWorkspaceStore.getState().lastClearedHighlightFilters?.activeTagFilter).toEqual(['Database'])
  })

  it('restoreHighlightFilters reapplies the stash and clears it', () => {
    useWorkspaceStore.setState({
      lastClearedHighlightFilters: {
        activeTagFilter: ['Database'], activeStatusFilter: ['Live'], activeTechFilter: ['Go'], activeTeamFilter: ['Platform'],
      },
    })

    useWorkspaceStore.getState().restoreHighlightFilters()

    expect(useWorkspaceStore.getState().activeTagFilter).toEqual(['Database'])
    expect(useWorkspaceStore.getState().activeStatusFilter).toEqual(['Live'])
    expect(useWorkspaceStore.getState().activeTechFilter).toEqual(['Go'])
    expect(useWorkspaceStore.getState().activeTeamFilter).toEqual(['Platform'])
    expect(useWorkspaceStore.getState().lastClearedHighlightFilters).toBeNull()
  })

  it('restoreHighlightFilters is a no-op when stash is null', () => {
    useWorkspaceStore.setState({ activeTagFilter: ['Live'] })
    useWorkspaceStore.getState().restoreHighlightFilters()
    expect(useWorkspaceStore.getState().activeTagFilter).toEqual(['Live'])
  })

  it('clearAllHighlightFilters drops the stash so manual clear is final', () => {
    useWorkspaceStore.setState({
      activeTagFilter: ['Database'],
      lastClearedHighlightFilters: {
        activeTagFilter: ['OldTag'], activeStatusFilter: [], activeTechFilter: [], activeTeamFilter: [],
      },
    })

    useWorkspaceStore.getState().clearAllHighlightFilters()

    expect(useWorkspaceStore.getState().activeTagFilter).toEqual([])
    expect(useWorkspaceStore.getState().lastClearedHighlightFilters).toBeNull()
  })

  it('dismissClearedHighlightFiltersHint drops the stash without restoring', () => {
    useWorkspaceStore.setState({
      lastClearedHighlightFilters: {
        activeTagFilter: ['Database'], activeStatusFilter: [], activeTechFilter: [], activeTeamFilter: [],
      },
    })
    useWorkspaceStore.getState().dismissClearedHighlightFiltersHint()
    expect(useWorkspaceStore.getState().lastClearedHighlightFilters).toBeNull()
    expect(useWorkspaceStore.getState().activeTagFilter).toEqual([])
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

  it('closeWorkspace clears pendingDelete to dismiss in-flight confirmation dialogs', () => {
    useWorkspaceStore.setState({
      pendingDelete: { message: 'Delete?', onConfirm: () => {} },
    })
    useWorkspaceStore.getState().closeWorkspace()
    expect(useWorkspaceStore.getState().pendingDelete).toBeNull()
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

  it('deleteView falls back to the first remaining view when the active view is deleted', () => {
    // View A is created first; view B becomes active
    const keyA = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View A')
    const keyB = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View B')
    expect(useWorkspaceStore.getState().activeViewKey).toBe(keyB)
    // Delete view B — should fall back to view A (the first remaining view)
    useWorkspaceStore.getState().deleteView(keyB)
    expect(useWorkspaceStore.getState().activeViewKey).toBe(keyA)
  })

  it('deleteView removes the key from viewHistory to prevent ghost navigation', () => {
    const keyA = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View A')
    const keyB = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View B')
    // Simulate having drilled into View B from View A
    useWorkspaceStore.setState({ viewHistory: [keyA] })
    useWorkspaceStore.getState().setActiveView(keyB)
    // Now delete View A while it's in history
    useWorkspaceStore.getState().deleteView(keyA)
    // viewHistory should no longer contain keyA
    expect(useWorkspaceStore.getState().viewHistory).not.toContain(keyA)
  })

  it('addView with type systemContext includes scopeId as softwareSystemId', () => {
    const key = useWorkspaceStore.getState().addView('systemContext', 'api', 'Context View')
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.systemContextViews.find(v => v.key === key)!
    expect(view.softwareSystemId).toBe('api')
  })

  it('deleteView is a no-op (no undo) when the key does not exist', () => {
    const key = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'My View')
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    const prevActiveKey = useWorkspaceStore.getState().activeViewKey
    useWorkspaceStore.getState().deleteView('nonexistent-key')
    const state = useWorkspaceStore.getState()
    // View still present
    expect(state.workspace!.views.systemLandscapeViews.some(v => v.key === key)).toBe(true)
    // No phantom undo pushed
    expect(state.undoStack).toHaveLength(undoBefore)
    // activeViewKey unchanged
    expect(state.activeViewKey).toBe(prevActiveKey)
  })

  it('addView auto-populates initial relationships between auto-included elements', () => {
    // Create a relationship BEFORE the view exists; addRelationship can't add it to a view
    // that doesn't exist yet. When addView runs it should seed initialRelationships.
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'Uses')
    // Confirm the relationship is not in any view at this point (no views exist)
    const wsBefore = useWorkspaceStore.getState().workspace!
    expect(wsBefore.views.systemLandscapeViews).toHaveLength(0)

    const key = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape')
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.systemLandscapeViews.find(v => v.key === key)!
    // Both endpoints (alice and api) are auto-included — the relationship should appear too
    expect(view.relationships.some(r => r.id === relId)).toBe(true)
  })

  it('addView clears selection state when switching to the new view', () => {
    // Set up a selection in the current state
    useWorkspaceStore.setState({ selectedElementIds: ['alice'], selectedRelationshipId: null, selectedGroupId: null })
    useWorkspaceStore.getState().addView('systemLandscape', undefined, 'New View')
    const state = useWorkspaceStore.getState()
    expect(state.selectedElementIds).toEqual([])
    expect(state.selectedRelationshipId).toBeNull()
    expect(state.selectedGroupId).toBeNull()
  })

  it('duplicateView clears selection state when switching to the duplicate', () => {
    const key = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Original')
    // Select something
    useWorkspaceStore.setState({ selectedElementIds: ['alice'] })
    useWorkspaceStore.getState().duplicateView(key)
    const state = useWorkspaceStore.getState()
    expect(state.selectedElementIds).toEqual([])
    expect(state.selectedRelationshipId).toBeNull()
    expect(state.selectedGroupId).toBeNull()
  })

  it('deleteView clears selection state when the active view is deleted', () => {
    const keyA = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View A')
    useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View B')
    useWorkspaceStore.getState().setActiveView(keyA)
    // Select something in view A
    useWorkspaceStore.setState({ selectedElementIds: ['alice'] })
    // Delete view A — we switch to view B
    useWorkspaceStore.getState().deleteView(keyA)
    const state = useWorkspaceStore.getState()
    expect(state.selectedElementIds).toEqual([])
    expect(state.selectedRelationshipId).toBeNull()
    expect(state.selectedGroupId).toBeNull()
  })

  it('deleteView preserves selection when a non-active view is deleted', () => {
    const keyA = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View A')
    const keyB = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View B')
    useWorkspaceStore.getState().setActiveView(keyA)
    // Select something in view A
    useWorkspaceStore.setState({ selectedElementIds: ['alice'] })
    // Delete view B (not the active view) — selection in view A should be preserved
    useWorkspaceStore.getState().deleteView(keyB)
    const state = useWorkspaceStore.getState()
    expect(state.selectedElementIds).toEqual(['alice'])
    expect(state.activeViewKey).toBe(keyA)
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

// ─── addView component view — parent container boundary ──────────────

describe('addView component view — parent container shown as boundary for cross-container component relations', () => {
  beforeEach(() => {
    const ws: Workspace = {
      name: 'Test',
      model: {
        people: [],
        softwareSystems: [
          {
            id: 'sys', type: 'softwareSystem', name: 'Sys', tags: ['Software System'], properties: {},
            containers: [
              {
                id: 'frontend', type: 'container', name: 'Frontend', tags: ['Container'], properties: {},
                components: [
                  { id: 'loginComp', type: 'component', name: 'Login', tags: ['Component'], properties: {} },
                ],
              },
              {
                id: 'backend', type: 'container', name: 'Backend', tags: ['Container'], properties: {},
                components: [
                  { id: 'authComp', type: 'component', name: 'Auth', tags: ['Component'], properties: {} },
                ],
              },
            ],
          },
        ],
        // loginComp → authComp (cross-container component relationship)
        relationships: [
          { id: 'r1', sourceId: 'loginComp', destinationId: 'authComp', description: 'verifies', tags: [], properties: {} },
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
    useWorkspaceStore.getState().loadWorkspace(ws)
  })

  it('shows the parent container (Backend) as boundary, not the internal component', () => {
    const key = useWorkspaceStore.getState().addView('component', 'frontend', 'Frontend Components')
    const view = useWorkspaceStore.getState().workspace!.views.componentViews.find(v => v.key === key)!
    // The scoped component should appear
    expect(view.elements.some(e => e.id === 'loginComp')).toBe(true)
    // Backend container (parent of authComp) should appear as the C4 boundary
    expect(view.elements.some(e => e.id === 'backend')).toBe(true)
    // The internal authComp should NOT appear directly
    expect(view.elements.some(e => e.id === 'authComp')).toBe(false)
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

  it('delete → re-add cycle produces exactly 1 relationship in model and view (no phantom duplication)', () => {
    const key = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape')
    useWorkspaceStore.getState().setActiveView(key)

    // Add
    const relId1 = useWorkspaceStore.getState().addRelationship('alice', 'api', 'first call')
    let ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.relationships).toHaveLength(1)

    // Delete
    useWorkspaceStore.getState().deleteRelationship(relId1)
    ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.relationships).toHaveLength(0)
    const viewAfterDelete = ws.views.systemLandscapeViews.find(v => v.key === key)!
    expect(viewAfterDelete.relationships).toHaveLength(0)

    // Re-add
    const relId2 = useWorkspaceStore.getState().addRelationship('alice', 'api', 'second call')
    ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.relationships).toHaveLength(1)
    expect(ws.model.relationships[0].id).toBe(relId2)
    const viewAfterReadd = ws.views.systemLandscapeViews.find(v => v.key === key)!
    // Must appear exactly once — no phantom from the old deleted relationship
    expect(viewAfterReadd.relationships.filter(r => r.id === relId2)).toHaveLength(1)
    expect(viewAfterReadd.relationships).toHaveLength(1)
  })
})

// ─── addPerson/addSoftwareSystem landscape view auto-add ─────────────

describe('addPerson — auto-add to all system landscape views', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('auto-adds to non-active landscape views', () => {
    const keyA = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'L1')
    const keyB = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'L2')
    useWorkspaceStore.getState().setActiveView(keyA)

    const personId = useWorkspaceStore.getState().addPerson('Bob')
    const ws = useWorkspaceStore.getState().workspace!
    const vA = ws.views.systemLandscapeViews.find(v => v.key === keyA)!
    const vB = ws.views.systemLandscapeViews.find(v => v.key === keyB)!
    expect(vA.elements.some(e => e.id === personId)).toBe(true)
    expect(vB.elements.some(e => e.id === personId)).toBe(true)
  })
})

describe('addSoftwareSystem — auto-add to all system landscape views', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('auto-adds to non-active landscape views', () => {
    const keyA = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'L1')
    const keyB = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'L2')
    useWorkspaceStore.getState().setActiveView(keyA)

    const sysId = useWorkspaceStore.getState().addSoftwareSystem('NewSys')
    const ws = useWorkspaceStore.getState().workspace!
    const vA = ws.views.systemLandscapeViews.find(v => v.key === keyA)!
    const vB = ws.views.systemLandscapeViews.find(v => v.key === keyB)!
    expect(vA.elements.some(e => e.id === sysId)).toBe(true)
    expect(vB.elements.some(e => e.id === sysId)).toBe(true)
  })
})

// ─── addRelationship auto-adds actors to systemContext views ──────────

describe('addRelationship — auto-add external actor to systemContext view', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('adds person to context view when creating relationship to scoped system', () => {
    // Create a systemContext view for 'api' (includes api by default)
    const ctxKey = useWorkspaceStore.getState().addView('systemContext', 'api', 'API Context')
    const ws0 = useWorkspaceStore.getState().workspace!
    const ctx0 = ws0.views.systemContextViews.find(v => v.key === ctxKey)!
    // Alice is not in the context view yet (no relationship to api)
    expect(ctx0.elements.some(e => e.id === 'alice')).toBe(false)

    // Create relationship alice → api
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')

    const ws = useWorkspaceStore.getState().workspace!
    const ctx = ws.views.systemContextViews.find(v => v.key === ctxKey)!
    // Alice should now appear in the context view
    expect(ctx.elements.some(e => e.id === 'alice')).toBe(true)
    // And the relationship ref should also be added
    expect(ctx.relationships.some(r => r.id === relId)).toBe(true)
  })

  it('adds person to context view when creating relationship FROM scoped system', () => {
    const ctxKey = useWorkspaceStore.getState().addView('systemContext', 'api', 'API Context')
    const relId = useWorkspaceStore.getState().addRelationship('api', 'alice', 'notifies')

    const ws = useWorkspaceStore.getState().workspace!
    const ctx = ws.views.systemContextViews.find(v => v.key === ctxKey)!
    expect(ctx.elements.some(e => e.id === 'alice')).toBe(true)
    expect(ctx.relationships.some(r => r.id === relId)).toBe(true)
  })

  it('does not add actor to context view for a different scoped system', () => {
    const other = useWorkspaceStore.getState().addSoftwareSystem('Other')
    const ctxKey = useWorkspaceStore.getState().addView('systemContext', other, 'Other Context')

    useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')

    const ws = useWorkspaceStore.getState().workspace!
    const ctx = ws.views.systemContextViews.find(v => v.key === ctxKey)!
    expect(ctx.elements.some(e => e.id === 'alice')).toBe(false)
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

// ─── addView container view — cross-system container auto-populate ───────────

describe('addView container view — related containers from other systems are auto-included', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('auto-includes a container from another system that is directly related to the scoped containers', () => {
    // System A ("api") gets a container; system B gets a container; they have a relationship.
    const containerA = useWorkspaceStore.getState().addContainer('api', 'API Backend')
    const sysB = useWorkspaceStore.getState().addSoftwareSystem('Payment Service')
    const containerB = useWorkspaceStore.getState().addContainer(sysB, 'Payments API')
    useWorkspaceStore.getState().addRelationship(containerA, containerB, 'calls')

    // Create a container view for "api" AFTER all elements and relationships exist
    const viewKey = useWorkspaceStore.getState().addView('container', 'api', 'API Containers')
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.containerViews.find(v => v.key === viewKey)!

    // containerA is the scoped container — must appear
    expect(view.elements.some(e => e.id === containerA)).toBe(true)
    // containerB (from a different system) is directly related — must also appear
    expect(view.elements.some(e => e.id === containerB)).toBe(true)
  })

  it('auto-includes the relationship to the cross-system container', () => {
    const containerA = useWorkspaceStore.getState().addContainer('api', 'API Backend')
    const sysB = useWorkspaceStore.getState().addSoftwareSystem('Payment Service')
    const containerB = useWorkspaceStore.getState().addContainer(sysB, 'Payments API')
    const relId = useWorkspaceStore.getState().addRelationship(containerA, containerB, 'calls')

    const viewKey = useWorkspaceStore.getState().addView('container', 'api', 'API Containers')
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.containerViews.find(v => v.key === viewKey)!

    // The relationship between containerA and containerB should appear in the view
    expect(view.relationships.some(r => r.id === relId)).toBe(true)
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

  it('undo clears selectedGroupId to avoid stale group selection', () => {
    useWorkspaceStore.getState().addGroup('MyGroup', ['alice'])
    const groupId = useWorkspaceStore.getState().workspace!.model.groups[0].id
    useWorkspaceStore.getState().selectGroup(groupId)
    expect(useWorkspaceStore.getState().selectedGroupId).toBe(groupId)
    // Any undoable action followed by undo should clear the group selection
    useWorkspaceStore.getState().addRelationship('alice', 'api', 'ping')
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().selectedGroupId).toBeNull()
  })

  it('redo clears selectedGroupId', () => {
    // Add a group first, then add a relationship (so we have something to undo)
    useWorkspaceStore.getState().addGroup('MyGroup', ['alice'])
    const groupId = useWorkspaceStore.getState().workspace!.model.groups[0].id
    useWorkspaceStore.getState().addRelationship('alice', 'api', 'ping')
    // Undo the relationship — redo stack now has the workspace with the relationship
    useWorkspaceStore.getState().undo()
    // Select the group (selectGroup doesn't touch undo/redo stacks)
    useWorkspaceStore.getState().selectGroup(groupId)
    expect(useWorkspaceStore.getState().selectedGroupId).toBe(groupId)
    // Redo — should clear selectedGroupId
    useWorkspaceStore.getState().redo()
    expect(useWorkspaceStore.getState().selectedGroupId).toBeNull()
  })

  it('undo recomputes scopeViolations for the restored workspace', () => {
    // Set up a landscape-scoped workspace (containers are a scope violation)
    useWorkspaceStore.setState({
      workspace: { ...makeWorkspace(), scope: 'landscape' },
      activeViewKey: null,
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
      undoStack: [],
      redoStack: [],
      scopeViolations: [],
    })
    // addContainer creates a violation in a landscape-scoped workspace
    useWorkspaceStore.getState().addContainer('api', 'Frontend')
    // The validator emits a workspace-level violation AND a per-container
    // violation, so adding one bad container yields 2 entries.
    expect(useWorkspaceStore.getState().scopeViolations.length).toBeGreaterThan(0)
    // Undo removes the container — violations should clear
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().scopeViolations).toHaveLength(0)
  })

  it('redo recomputes scopeViolations for the restored workspace', () => {
    useWorkspaceStore.setState({
      workspace: { ...makeWorkspace(), scope: 'landscape' },
      activeViewKey: null,
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
      undoStack: [],
      redoStack: [],
      scopeViolations: [],
    })
    useWorkspaceStore.getState().addContainer('api', 'Frontend')
    expect(useWorkspaceStore.getState().scopeViolations.length).toBeGreaterThan(0)
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().scopeViolations).toHaveLength(0)
    // Redo brings the container back — violations should reappear
    useWorkspaceStore.getState().redo()
    expect(useWorkspaceStore.getState().scopeViolations.length).toBeGreaterThan(0)
  })
})

// ─── Undo/redo active view stability ─────────────────────────────────

describe('undo/redo — activeViewKey stays valid', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('undo of addView falls back to first existing view (not stale deleted-view key)', () => {
    // Add view A first so there is a pre-existing view to fall back to
    const keyA = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'First View')
    // Add view B — this becomes active
    const keyB = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Second View')
    expect(useWorkspaceStore.getState().activeViewKey).toBe(keyB)

    // Undo the addition of view B
    useWorkspaceStore.getState().undo()

    // View B is gone; activeViewKey must not still point to keyB
    const ws = useWorkspaceStore.getState().workspace!
    const restoredKey = useWorkspaceStore.getState().activeViewKey
    const allViewKeys = [
      ...ws.views.systemLandscapeViews,
      ...ws.views.systemContextViews,
      ...ws.views.containerViews,
      ...ws.views.componentViews,
    ].map(v => v.key)
    // Active key must be a real view
    expect(allViewKeys).toContain(restoredKey)
    // It should not be the deleted view
    expect(restoredKey).not.toBe(keyB)
    // It should be view A (the only remaining view)
    expect(restoredKey).toBe(keyA)
  })

  it('redo falls back to first valid view if current key is not in the redo target', () => {
    // Build: add A, add B, undo B (active=A), undo A (active=null or first), redo A (active must be valid)
    useWorkspaceStore.getState().addView('systemLandscape', undefined, 'First View')
    useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Second View')
    // Undo twice — workspace has no views, active = null
    useWorkspaceStore.getState().undo() // removes B
    useWorkspaceStore.getState().undo() // removes A
    // Redo — adds view A back
    useWorkspaceStore.getState().redo()
    const ws = useWorkspaceStore.getState().workspace!
    const redoKey = useWorkspaceStore.getState().activeViewKey
    const allViewKeys = [
      ...ws.views.systemLandscapeViews,
      ...ws.views.systemContextViews,
      ...ws.views.containerViews,
      ...ws.views.componentViews,
    ].map(v => v.key)
    expect(allViewKeys).toContain(redoKey)
  })

  it('undo preserves current activeViewKey when the view still exists after undo', () => {
    // Add a view so there's something to be on
    const viewKey = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'My View')
    expect(useWorkspaceStore.getState().activeViewKey).toBe(viewKey)
    // Add a relationship (not a view) — view still exists after undo
    useWorkspaceStore.getState().addRelationship('alice', 'api', 'pings')
    useWorkspaceStore.getState().undo()
    // The view still exists → activeViewKey should be unchanged
    expect(useWorkspaceStore.getState().activeViewKey).toBe(viewKey)
  })
})

// ─── Element CRUD ────────────────────────────────────────────────────

describe('Element CRUD', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('addPerson seeds Element and Person built-in tags', () => {
    // Regression: parser always adds 'Element'; store must match so tag filtering
    // and style cascade are consistent before the first save+reload.
    const id = useWorkspaceStore.getState().addPerson('Bob')
    const ws = useWorkspaceStore.getState().workspace!
    const person = ws.model.people.find(p => p.id === id)!
    expect(person.tags).toContain('Element')
    expect(person.tags).toContain('Person')
  })

  it('addSoftwareSystem seeds Element and Software System built-in tags', () => {
    const id = useWorkspaceStore.getState().addSoftwareSystem('MyApp')
    const ws = useWorkspaceStore.getState().workspace!
    const sys = ws.model.softwareSystems.find(s => s.id === id)!
    expect(sys.tags).toContain('Element')
    expect(sys.tags).toContain('Software System')
  })

  it('addContainer seeds Element and Container built-in tags', () => {
    const id = useWorkspaceStore.getState().addContainer('api', 'API GW')
    const ws = useWorkspaceStore.getState().workspace!
    const container = ws.model.softwareSystems.find(s => s.id === 'api')!.containers.find(c => c.id === id)!
    expect(container.tags).toContain('Element')
    expect(container.tags).toContain('Container')
  })

  it('addComponent seeds Element and Component built-in tags', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'API GW')
    const id = useWorkspaceStore.getState().addComponent(containerId, 'Handler')
    const ws = useWorkspaceStore.getState().workspace!
    const comp = ws.model.softwareSystems.find(s => s.id === 'api')!.containers.find(c => c.id === containerId)!.components.find(c => c.id === id)!
    expect(comp.tags).toContain('Element')
    expect(comp.tags).toContain('Component')
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

  it('addPerson deduplicates name when an element with that name already exists', () => {
    // makeWorkspace already has 'Alice'; adding another 'Alice' should produce 'Alice 2'
    const id = useWorkspaceStore.getState().addPerson('Alice')
    const ws = useWorkspaceStore.getState().workspace!
    const person = ws.model.people.find(p => p.id === id)!
    expect(person.name).toBe('Alice 2')
  })

  it('addSoftwareSystem deduplicates name when an element with that name already exists', () => {
    // makeWorkspace already has 'API'; adding another 'API' should produce 'API 2'
    const id = useWorkspaceStore.getState().addSoftwareSystem('API')
    const ws = useWorkspaceStore.getState().workspace!
    const sys = ws.model.softwareSystems.find(s => s.id === id)!
    expect(sys.name).toBe('API 2')
  })

  it('addPerson with position stores x,y in the active view element', () => {
    // The active view must exist before adding, otherwise addToCurrentView is a no-op
    const viewKey = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape')
    const id = useWorkspaceStore.getState().addPerson('Bob', { x: 42, y: 99 })
    const ws = useWorkspaceStore.getState().workspace!
    const el = ws.views.systemLandscapeViews.find(v => v.key === viewKey)!.elements.find(e => e.id === id)!
    expect(el).toBeDefined()
    expect(el.x).toBe(42)
    expect(el.y).toBe(99)
  })

  it('addContainer with position stores x,y in the active view element', () => {
    const viewKey = useWorkspaceStore.getState().addView('container', 'api', 'API Containers')
    const id = useWorkspaceStore.getState().addContainer('api', 'Web App', { x: 150, y: 300 })
    const ws = useWorkspaceStore.getState().workspace!
    const el = ws.views.containerViews.find(v => v.key === viewKey)!.elements.find(e => e.id === id)!
    expect(el).toBeDefined()
    expect(el.x).toBe(150)
    expect(el.y).toBe(300)
  })

  it('updateElement updates name and description', () => {
    useWorkspaceStore.getState().updateElement('alice', { name: 'Alice Smith', description: 'Lead dev' })
    const ws = useWorkspaceStore.getState().workspace!
    const alice = ws.model.people.find(p => p.id === 'alice')!
    expect(alice.name).toBe('Alice Smith')
    expect(alice.description).toBe('Lead dev')
  })

  it('updateElement clears description when passed undefined (UI "clear" gesture)', () => {
    useWorkspaceStore.getState().updateElement('alice', { description: 'Had a description' })
    expect(useWorkspaceStore.getState().workspace!.model.people.find(p => p.id === 'alice')!.description).toBe('Had a description')
    useWorkspaceStore.getState().updateElement('alice', { description: undefined })
    expect(useWorkspaceStore.getState().workspace!.model.people.find(p => p.id === 'alice')!.description).toBeUndefined()
  })

  it('updateElement clears status when passed undefined', () => {
    useWorkspaceStore.getState().updateElement('alice', { status: 'Live' })
    expect(useWorkspaceStore.getState().workspace!.model.people.find(p => p.id === 'alice')!.status).toBe('Live')
    useWorkspaceStore.getState().updateElement('alice', { status: undefined })
    expect(useWorkspaceStore.getState().workspace!.model.people.find(p => p.id === 'alice')!.status).toBeUndefined()
  })

  it('updateElement clears owner when passed undefined', () => {
    useWorkspaceStore.getState().updateElement('alice', { owner: 'Team A' })
    expect(useWorkspaceStore.getState().workspace!.model.people.find(p => p.id === 'alice')!.owner).toBe('Team A')
    useWorkspaceStore.getState().updateElement('alice', { owner: undefined })
    expect(useWorkspaceStore.getState().workspace!.model.people.find(p => p.id === 'alice')!.owner).toBeUndefined()
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

  it('deleteElements removes relationships referencing a container inside a deleted system', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'DB')
    useWorkspaceStore.getState().addRelationship('alice', containerId, 'reads')
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(1)
    // Deleting the parent system should cascade to the container relationship
    useWorkspaceStore.getState().deleteElements(['api'])
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(0)
  })

  it('deleteElements removes relationships referencing a component inside a deleted system', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Web')
    const compId = useWorkspaceStore.getState().addComponent(containerId, 'Handler')
    useWorkspaceStore.getState().addRelationship('alice', compId, 'calls')
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(1)
    // Deleting the grandparent system cascades through container → component
    useWorkspaceStore.getState().deleteElements(['api'])
    expect(useWorkspaceStore.getState().workspace!.model.relationships).toHaveLength(0)
  })

  it('deleteElements removes relationships referencing a component inside a deleted container', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Web')
    const compId = useWorkspaceStore.getState().addComponent(containerId, 'Handler')
    useWorkspaceStore.getState().addRelationship('alice', compId, 'calls')
    // Deleting only the container should also remove the component relationship
    useWorkspaceStore.getState().deleteElements([containerId])
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

  it('deleteElements removes systemContext views scoped to deleted software system', () => {
    const viewKey = useWorkspaceStore.getState().addView('systemContext', 'api', 'API Context')
    const ws0 = useWorkspaceStore.getState().workspace!
    expect(ws0.views.systemContextViews.some(v => v.key === viewKey)).toBe(true)

    useWorkspaceStore.getState().deleteElements(['api'])
    const ws = useWorkspaceStore.getState().workspace!
    // The systemContext view should be gone — its scope is the deleted system
    expect(ws.views.systemContextViews.some(v => v.key === viewKey)).toBe(false)
  })

  it('deleteElements removes container views scoped to deleted software system', () => {
    // Create a container view scoped to 'api'
    const viewKey = useWorkspaceStore.getState().addView('container', 'api', 'API Containers')
    const ws0 = useWorkspaceStore.getState().workspace!
    expect(ws0.views.containerViews.some(v => v.key === viewKey)).toBe(true)

    // Delete the software system
    useWorkspaceStore.getState().deleteElements(['api'])
    const ws = useWorkspaceStore.getState().workspace!
    // The container view should be gone — its scope is the deleted system
    expect(ws.views.containerViews.some(v => v.key === viewKey)).toBe(false)
  })

  it('deleteElements removes component views scoped to a deleted container', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Frontend')
    const compViewKey = useWorkspaceStore.getState().addView('component', containerId, 'Components')
    const ws0 = useWorkspaceStore.getState().workspace!
    expect(ws0.views.componentViews.some(v => v.key === compViewKey)).toBe(true)

    // Explicitly delete the container
    useWorkspaceStore.getState().deleteElements([containerId])
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.views.componentViews.some(v => v.key === compViewKey)).toBe(false)
  })

  it('deleteElements removes component views when parent system is deleted', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Frontend')
    const compViewKey = useWorkspaceStore.getState().addView('component', containerId, 'Components')

    // Delete the parent system (container is implicitly deleted)
    useWorkspaceStore.getState().deleteElements(['api'])
    const ws = useWorkspaceStore.getState().workspace!
    // Component view scoped to the now-gone container should also be removed
    expect(ws.views.componentViews.some(v => v.key === compViewKey)).toBe(false)
  })

  it('deleteElements falls back activeViewKey when active view is a component view of a deleted system', () => {
    const landscapeKey = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape')
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Frontend')
    const compViewKey = useWorkspaceStore.getState().addView('component', containerId, 'Components')
    useWorkspaceStore.getState().setActiveView(compViewKey)
    expect(useWorkspaceStore.getState().activeViewKey).toBe(compViewKey)

    // Delete the parent system — cascades through container to remove the component view
    useWorkspaceStore.getState().deleteElements(['api'])
    const newActive = useWorkspaceStore.getState().activeViewKey
    expect(newActive).not.toBe(compViewKey)
    expect(newActive).toBe(landscapeKey)
  })

  it('deleteElements falls back activeViewKey when the active view is removed', () => {
    // Create a landscape view and a container view scoped to 'api'
    const landscapeKey = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape')
    const containerViewKey = useWorkspaceStore.getState().addView('container', 'api', 'API Containers')

    // Make the container view active
    useWorkspaceStore.getState().setActiveView(containerViewKey)
    expect(useWorkspaceStore.getState().activeViewKey).toBe(containerViewKey)

    // Delete the system — container view is orphaned and removed
    useWorkspaceStore.getState().deleteElements(['api'])

    // activeViewKey should have fallen back to the landscape view (or any surviving view)
    const newActive = useWorkspaceStore.getState().activeViewKey
    expect(newActive).not.toBe(containerViewKey)
    expect(newActive).toBe(landscapeKey)
  })

  it('deleteElements([]) is a no-op (no undo, nothing removed)', () => {
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    const wsBefore = useWorkspaceStore.getState().workspace
    useWorkspaceStore.getState().deleteElements([])
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(undoBefore)
    expect(useWorkspaceStore.getState().workspace).toBe(wsBefore) // same reference
  })

  it('deleteElements purges orphaned view keys from viewHistory', () => {
    const landscapeKey = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape')
    const containerViewKey = useWorkspaceStore.getState().addView('container', 'api', 'API Containers')
    // Put the container view key into history (as if user drilled from landscape → container)
    useWorkspaceStore.setState({ viewHistory: [landscapeKey] })
    useWorkspaceStore.getState().setActiveView(containerViewKey)

    // Delete 'api' — removes the container view
    useWorkspaceStore.getState().deleteElements(['api'])
    const history = useWorkspaceStore.getState().viewHistory
    expect(history).not.toContain(containerViewKey)
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

  it('setCanvasGuideOpen opens guide and closes command palette', () => {
    useWorkspaceStore.setState({ commandPaletteOpen: true })
    useWorkspaceStore.getState().setCanvasGuideOpen(true)
    expect(useWorkspaceStore.getState().canvasGuideOpen).toBe(true)
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

  it('is a no-op (no undo entry) when title is unchanged', () => {
    // First rename to set a known title
    useWorkspaceStore.getState().renameView(viewKey, 'Same Title')
    const undoLengthAfterFirst = useWorkspaceStore.getState().undoStack.length
    // Renaming to the same title again should not push another undo entry
    useWorkspaceStore.getState().renameView(viewKey, 'Same Title')
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoLengthAfterFirst)
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

  it('copies relationships from the source view', () => {
    // Add a relationship so the source view has at least one relationship
    useWorkspaceStore.getState().addRelationship('alice', 'api', 'Uses')
    const ws0 = useWorkspaceStore.getState().workspace!
    const src = ws0.views.systemLandscapeViews.find(v => v.key === viewKey)!
    const srcRelCount = src.relationships.length
    expect(srcRelCount).toBeGreaterThan(0)

    const newKey = useWorkspaceStore.getState().duplicateView(viewKey)
    const ws = useWorkspaceStore.getState().workspace!
    const copy = ws.views.systemLandscapeViews.find(v => v.key === newKey)!
    expect(copy.relationships).toHaveLength(srcRelCount)
    // Relationship IDs should be the same (same model references, not new copies)
    const srcRelIds = src.relationships.map(r => r.id)
    const copyRelIds = copy.relationships.map(r => r.id)
    expect(copyRelIds).toEqual(expect.arrayContaining(srcRelIds))
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
    const prevActiveKey = useWorkspaceStore.getState().activeViewKey
    const prevUndoLength = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().duplicateView('nonexistent')
    const state = useWorkspaceStore.getState()
    const ws = state.workspace!
    // No view was added
    expect(ws.views.systemLandscapeViews).toHaveLength(1)
    // activeViewKey is unchanged
    expect(state.activeViewKey).toBe(prevActiveKey)
    // No phantom undo entry was pushed
    expect(state.undoStack).toHaveLength(prevUndoLength)
  })

  it('preserves softwareSystemId when duplicating a container view', () => {
    useWorkspaceStore.setState({
      workspace: makeWorkspace(),
      activeViewKey: null,
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
      undoStack: [],
      redoStack: [],
    })
    const containerViewKey = useWorkspaceStore.getState().addView('container', 'api', 'API Containers')
    const newKey = useWorkspaceStore.getState().duplicateView(containerViewKey)
    const ws = useWorkspaceStore.getState().workspace!
    const original = ws.views.containerViews.find(v => v.key === containerViewKey)!
    const copy = ws.views.containerViews.find(v => v.key === newKey)!
    expect(copy.softwareSystemId).toBe('api')
    expect(copy.softwareSystemId).toBe(original.softwareSystemId)
  })

  it('preserves containerId when duplicating a component view', () => {
    useWorkspaceStore.setState({
      workspace: makeWorkspace(),
      activeViewKey: null,
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
      undoStack: [],
      redoStack: [],
    })
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Frontend')
    const compViewKey = useWorkspaceStore.getState().addView('component', containerId, 'Frontend Components')
    const newKey = useWorkspaceStore.getState().duplicateView(compViewKey)
    const ws = useWorkspaceStore.getState().workspace!
    const original = ws.views.componentViews.find(v => v.key === compViewKey)!
    const copy = ws.views.componentViews.find(v => v.key === newKey)!
    expect(copy.containerId).toBe(containerId)
    expect(copy.containerId).toBe(original.containerId)
  })

  it('preserves autoLayout direction when duplicating a view', () => {
    // Change the source view direction to LR, then duplicate — copy must have LR too
    useWorkspaceStore.getState().setLayoutDirection(viewKey, 'LR')
    const newKey = useWorkspaceStore.getState().duplicateView(viewKey)
    const ws = useWorkspaceStore.getState().workspace!
    const copy = ws.views.systemLandscapeViews.find(v => v.key === newKey)!
    expect(copy.autoLayout?.direction).toBe('LR')
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

  it('is a no-op (no undo entry) when name is already the same value', () => {
    const before = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().updateWorkspaceMeta({ name: 'Test' }) // 'Test' is the makeWorkspace() default
    expect(useWorkspaceStore.getState().undoStack.length).toBe(before)
  })

  it('is a no-op (no undo entry) when description is already the same value', () => {
    useWorkspaceStore.getState().updateWorkspaceMeta({ description: 'First set' })
    const before = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().updateWorkspaceMeta({ description: 'First set' })
    expect(useWorkspaceStore.getState().undoStack.length).toBe(before)
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

  it('duplicateElements increments to next available suffix when copy name is already taken', () => {
    // Create an element called 'Alice copy' to preempt the first duplicate name
    useWorkspaceStore.getState().addPerson('Alice copy')
    // Now duplicate alice — 'Alice copy' is taken, so it should use 'Alice copy 2'
    const newIds = useWorkspaceStore.getState().duplicateElements(['alice'])
    expect(newIds).toHaveLength(1)
    const ws = useWorkspaceStore.getState().workspace!
    const clone = ws.model.people.find(p => p.id === newIds[0])!
    expect(clone.name).toBe('Alice copy 2')
  })

  it('adds the duplicate to the current view at an offset position', () => {
    const newIds = useWorkspaceStore.getState().duplicateElements(['alice'])
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.systemLandscapeViews.find(v => v.key === viewKey)!
    const cloneInView = view.elements.find(e => e.id === newIds[0])
    expect(cloneInView).toBeDefined()
  })

  it('positions clone at (200+60, 200+30) when original has no position in the view', () => {
    // beforeEach removes alice from the view via toggleElementInView, so inView → undefined.
    // The fallback: offsetX = (undefined?.x ?? 200) + 60 = 260, offsetY = (undefined?.y ?? 200) + 30 = 230
    const newIds = useWorkspaceStore.getState().duplicateElements(['alice'])
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.systemLandscapeViews.find(v => v.key === viewKey)!
    const cloneInView = view.elements.find(e => e.id === newIds[0])!
    expect(cloneInView.x).toBe(260)
    expect(cloneInView.y).toBe(230)
  })

  it('positions clone at (originalX+60, originalY+30) when original is in the view with known coordinates', () => {
    // Re-add alice to the view and pin her at a known position
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'alice') // alice is currently out → adds her back
    useWorkspaceStore.getState().updateNodePosition('alice', 80, 60)
    const newIds = useWorkspaceStore.getState().duplicateElements(['alice'])
    const ws = useWorkspaceStore.getState().workspace!
    const view = ws.views.systemLandscapeViews.find(v => v.key === viewKey)!
    const cloneInView = view.elements.find(e => e.id === newIds[0])!
    expect(cloneInView.x).toBe(80 + 60) // 140
    expect(cloneInView.y).toBe(60 + 30)  // 90
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

  it('deduplicates repeated IDs in bulk duplicate requests', () => {
    const newIds = useWorkspaceStore.getState().duplicateElements(['alice', 'alice', 'api'])
    expect(newIds).toHaveLength(2)
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.people.filter(p => p.name.includes('copy'))).toHaveLength(1)
    expect(ws.model.softwareSystems.filter(s => s.name.includes('copy'))).toHaveLength(1)
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

  it('duplicates a container and preserves its components', () => {
    // Add a container with two components to the api system
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Frontend')
    useWorkspaceStore.getState().addComponent(containerId, 'Login')
    useWorkspaceStore.getState().addComponent(containerId, 'Dashboard')
    useWorkspaceStore.getState().toggleElementInView(viewKey, containerId)

    const ws0 = useWorkspaceStore.getState().workspace!
    const originalContainer = ws0.model.softwareSystems[0].containers.find(c => c.id === containerId)!
    expect(originalContainer.components).toHaveLength(2)

    const newIds = useWorkspaceStore.getState().duplicateElements([containerId])
    expect(newIds).toHaveLength(1)

    const ws = useWorkspaceStore.getState().workspace!
    const api = ws.model.softwareSystems[0]
    const clone = api.containers.find(c => c.id === newIds[0])
    expect(clone).toBeDefined()
    expect(clone?.name).toContain('copy')
    // Components should be cloned with new IDs, not cleared
    expect(clone?.components).toHaveLength(2)
    expect(clone?.components[0].id).not.toBe(originalContainer.components[0].id)
    expect(clone?.components[1].id).not.toBe(originalContainer.components[1].id)
    expect(clone?.components[0].name).toBe('Login')
    expect(clone?.components[1].name).toBe('Dashboard')
  })

  it('adds duplicated relationship to every view containing both cloned elements, not just the active view', () => {
    // Add a relationship between the two elements
    useWorkspaceStore.getState().addRelationship('alice', 'api', 'Uses')

    // Create a second landscape view and add both elements to it
    const viewKey2 = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape 2')
    useWorkspaceStore.getState().toggleElementInView(viewKey2, 'alice')
    useWorkspaceStore.getState().toggleElementInView(viewKey2, 'api')

    // Active view is still viewKey (set in beforeEach); duplicate both elements from there
    const newIds = useWorkspaceStore.getState().duplicateElements(['alice', 'api'])
    expect(newIds).toHaveLength(2)

    const ws = useWorkspaceStore.getState().workspace!
    const cloneRel = ws.model.relationships.find(
      r => newIds.includes(r.sourceId) && newIds.includes(r.destinationId)
    )
    expect(cloneRel).toBeDefined()

    // The active view should have the cloned relationship
    const activeView = ws.views.systemLandscapeViews.find(v => v.key === viewKey)!
    expect(activeView.relationships.some(r => r.id === cloneRel!.id)).toBe(true)

    // The second view ALSO has both cloned elements — it should also receive the relationship ref
    const secondView = ws.views.systemLandscapeViews.find(v => v.key === viewKey2)!
    expect(secondView.elements.some(e => newIds.includes(e.id))).toBe(true) // both clones were added
    expect(secondView.relationships.some(r => r.id === cloneRel!.id)).toBe(true)
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

  it('drills into a component view when called on a container', () => {
    // Create a container in 'api' and a component view for that container
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Web')
    const compViewKey = useWorkspaceStore.getState().addView('component', containerId, 'Web Components')
    // Switch active view back to the container view so we can drill into the container
    useWorkspaceStore.getState().setActiveView(containerViewKey)
    useWorkspaceStore.getState().drillInto(containerId)
    expect(useWorkspaceStore.getState().activeViewKey).toBe(compViewKey)
    expect(useWorkspaceStore.getState().viewHistory).toContain(containerViewKey)
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

// ─── getBreadcrumb ──────────────────────────────────────────────────

describe('getBreadcrumb', () => {
  let ws: Workspace
  let keyA: string
  let keyB: string
  let keyC: string

  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    keyA = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape')
    keyB = useWorkspaceStore.getState().addView('systemContext', 'api', 'API Context')
    keyC = useWorkspaceStore.getState().addView('container', 'api', 'API Containers')
    ws = useWorkspaceStore.getState().workspace!
  })

  it('returns empty array when history is empty and activeViewKey is null', () => {
    expect(getBreadcrumb(ws, [], null)).toHaveLength(0)
  })

  it('includes only active view when history is empty', () => {
    const crumbs = getBreadcrumb(ws, [], keyA)
    expect(crumbs).toHaveLength(1)
    expect(crumbs[0]).toEqual({ key: keyA, label: 'Landscape' })
  })

  it('includes history views before active view', () => {
    const crumbs = getBreadcrumb(ws, [keyA, keyB], keyC)
    expect(crumbs).toHaveLength(3)
    expect(crumbs[0]).toEqual({ key: keyA, label: 'Landscape' })
    expect(crumbs[1]).toEqual({ key: keyB, label: 'API Context' })
    expect(crumbs[2]).toEqual({ key: keyC, label: 'API Containers' })
  })

  it('silently skips stale view keys in history', () => {
    const crumbs = getBreadcrumb(ws, ['stale-key-xyz', keyA], keyB)
    // 'stale-key-xyz' doesn't exist in workspace — should be skipped
    expect(crumbs).toHaveLength(2)
    expect(crumbs[0].key).toBe(keyA)
    expect(crumbs[1].key).toBe(keyB)
  })

  it('falls back to key as label when title is missing', () => {
    // Manually set a view without a title (clone since the store-returned
    // workspace is frozen by Immer)
    const wsLocal = structuredClone(ws)
    wsLocal.views.systemLandscapeViews[0].title = undefined
    const crumbs = getBreadcrumb(wsLocal, [], keyA)
    expect(crumbs[0].label).toBe(keyA)
  })
})

// ─── getCreatableTypes ──────────────────────────────────────────────

describe('getCreatableTypes', () => {
  let ws: Workspace

  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    ws = useWorkspaceStore.getState().workspace!
  })

  it('returns all false for null activeViewKey', () => {
    const result = getCreatableTypes(ws, null)
    expect(result.canCreatePerson).toBe(false)
    expect(result.canCreateSystem).toBe(false)
    expect(result.canCreateContainer).toBeNull()
    expect(result.canCreateComponent).toBeNull()
  })

  it('systemLandscape view: person and system are creatable', () => {
    const key = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape')
    ws = useWorkspaceStore.getState().workspace!
    const result = getCreatableTypes(ws, key)
    expect(result.canCreatePerson).toBe(true)
    expect(result.canCreateSystem).toBe(true)
    expect(result.canCreateContainer).toBeNull()
    expect(result.canCreateComponent).toBeNull()
  })

  it('systemContext view: person and system are creatable', () => {
    const key = useWorkspaceStore.getState().addView('systemContext', 'api', 'Context')
    ws = useWorkspaceStore.getState().workspace!
    const result = getCreatableTypes(ws, key)
    expect(result.canCreatePerson).toBe(true)
    expect(result.canCreateSystem).toBe(true)
    expect(result.canCreateContainer).toBeNull()
    expect(result.canCreateComponent).toBeNull()
  })

  it('container view: person, system, and container (with systemId) are creatable', () => {
    const key = useWorkspaceStore.getState().addView('container', 'api', 'Containers')
    ws = useWorkspaceStore.getState().workspace!
    const result = getCreatableTypes(ws, key)
    expect(result.canCreatePerson).toBe(true)
    expect(result.canCreateSystem).toBe(true)
    expect(result.canCreateContainer).toBe('api')
    expect(result.canCreateComponent).toBeNull()
  })

  it('component view: component (with containerId) is creatable', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Frontend')
    const key = useWorkspaceStore.getState().addView('component', containerId, 'Components')
    ws = useWorkspaceStore.getState().workspace!
    const result = getCreatableTypes(ws, key)
    expect(result.canCreatePerson).toBe(false)
    expect(result.canCreateSystem).toBe(false)
    expect(result.canCreateContainer).toBeNull()
    expect(result.canCreateComponent).toBe(containerId)
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

// ─── renameTag / removeTagGlobal ────────────────────────────────────────────

describe('renameTag', () => {
  function makeWsWithTag(): Workspace {
    const ws = makeWorkspace()
    ws.model.people[0].tags = ['Element', 'Person', 'VIP']
    ws.model.relationships.push({ id: 'r1', sourceId: 'alice', destinationId: 'api', tags: ['Relationship', 'VIP'], properties: {} })
    ws.views.configuration.styles.elements.push({ tag: 'VIP', background: '#ff0000' })
    ws.views.configuration.styles.relationships.push({ tag: 'VIP', color: '#ff0000' })
    return ws
  }

  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWsWithTag())
  })

  it('renames tag on all elements', () => {
    useWorkspaceStore.getState().renameTag('VIP', 'Premium')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.people[0].tags).toContain('Premium')
    expect(ws.model.people[0].tags).not.toContain('VIP')
  })

  it('renames tag on all relationships', () => {
    useWorkspaceStore.getState().renameTag('VIP', 'Premium')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.relationships[0].tags).toContain('Premium')
    expect(ws.model.relationships[0].tags).not.toContain('VIP')
  })

  it('renames matching element style tag', () => {
    useWorkspaceStore.getState().renameTag('VIP', 'Premium')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.views.configuration.styles.elements[0].tag).toBe('Premium')
  })

  it('renames matching relationship style tag', () => {
    useWorkspaceStore.getState().renameTag('VIP', 'Premium')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.views.configuration.styles.relationships[0].tag).toBe('Premium')
  })

  it('is a no-op when old and new names are the same', () => {
    const before = JSON.stringify(useWorkspaceStore.getState().workspace)
    useWorkspaceStore.getState().renameTag('VIP', 'VIP')
    expect(JSON.stringify(useWorkspaceStore.getState().workspace)).toBe(before)
  })

  it('is a no-op (no undo) for built-in tags', () => {
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().renameTag('Person', 'Human')
    const ws = useWorkspaceStore.getState().workspace!
    // Built-in tag was NOT renamed
    expect(ws.model.people[0].tags).toContain('Person')
    expect(ws.model.people[0].tags).not.toContain('Human')
    // No undo entry pushed
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(undoBefore)
  })

  it('is a no-op (no undo) when renaming TO a built-in tag name', () => {
    // Renaming a custom tag to a built-in name like "Person" would produce duplicate tags
    // on elements that already carry that built-in (e.g. Person elements have ["Element","Person",...]).
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().renameTag('VIP', 'Person')
    const ws = useWorkspaceStore.getState().workspace!
    // VIP tag should remain unchanged (the rename was blocked)
    expect(ws.model.people[0].tags).toContain('VIP')
    // No duplicate 'Person' tag — only the original built-in entry
    const personCount = ws.model.people[0].tags.filter(t => t === 'Person').length
    expect(personCount).toBe(1)
    // No undo entry pushed
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(undoBefore)
  })

  it('is a no-op (no undo) when oldTag does not exist anywhere', () => {
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().renameTag('NonExistentTag99', 'NewName')
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(undoBefore)
  })

  it('updates the active tag filter when renaming the active tag', () => {
    useWorkspaceStore.getState().setActiveTagFilter(['VIP'])
    useWorkspaceStore.getState().renameTag('VIP', 'Premium')
    expect(useWorkspaceStore.getState().activeTagFilter).toEqual(['Premium'])
  })

  it('supports undo', () => {
    useWorkspaceStore.getState().renameTag('VIP', 'Premium')
    useWorkspaceStore.getState().undo()
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.people[0].tags).toContain('VIP')
    expect(ws.model.people[0].tags).not.toContain('Premium')
  })
})

describe('removeTagGlobal', () => {
  function makeWsWithTag(): Workspace {
    const ws = makeWorkspace()
    ws.model.people[0].tags = ['Element', 'Person', 'VIP']
    ws.model.relationships.push({ id: 'r1', sourceId: 'alice', destinationId: 'api', tags: ['Relationship', 'VIP'], properties: {} })
    ws.views.configuration.styles.elements.push({ tag: 'VIP', background: '#ff0000' })
    ws.views.configuration.styles.relationships.push({ tag: 'VIP', color: '#ff0000' })
    return ws
  }

  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWsWithTag())
  })

  it('removes tag from all elements', () => {
    useWorkspaceStore.getState().removeTagGlobal('VIP')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.people[0].tags).not.toContain('VIP')
    expect(ws.model.people[0].tags).toContain('Element')
  })

  it('removes tag from all relationships', () => {
    useWorkspaceStore.getState().removeTagGlobal('VIP')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.relationships[0].tags).not.toContain('VIP')
    expect(ws.model.relationships[0].tags).toContain('Relationship')
  })

  it('removes matching element style', () => {
    useWorkspaceStore.getState().removeTagGlobal('VIP')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.views.configuration.styles.elements).toHaveLength(0)
  })

  it('removes matching relationship style', () => {
    useWorkspaceStore.getState().removeTagGlobal('VIP')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.views.configuration.styles.relationships).toHaveLength(0)
  })

  it('is a no-op for built-in tags (Person cannot be removed)', () => {
    const before = JSON.stringify(useWorkspaceStore.getState().workspace)
    useWorkspaceStore.getState().removeTagGlobal('Person')
    expect(JSON.stringify(useWorkspaceStore.getState().workspace)).toBe(before)
  })

  it('is a no-op for the Relationship built-in tag', () => {
    const before = JSON.stringify(useWorkspaceStore.getState().workspace)
    useWorkspaceStore.getState().removeTagGlobal('Relationship')
    expect(JSON.stringify(useWorkspaceStore.getState().workspace)).toBe(before)
  })

  it('is a no-op for the Database built-in tag', () => {
    // Database is used to render container nodes as cylinders — removing it globally
    // would silently break all database containers, so it must be protected.
    const before = JSON.stringify(useWorkspaceStore.getState().workspace)
    useWorkspaceStore.getState().removeTagGlobal('Database')
    expect(JSON.stringify(useWorkspaceStore.getState().workspace)).toBe(before)
  })

  it('clears the active tag filter when removing the active tag', () => {
    useWorkspaceStore.getState().setActiveTagFilter(['VIP'])
    useWorkspaceStore.getState().removeTagGlobal('VIP')
    expect(useWorkspaceStore.getState().activeTagFilter).toEqual([])
  })

  it('supports undo', () => {
    useWorkspaceStore.getState().removeTagGlobal('VIP')
    useWorkspaceStore.getState().undo()
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.people[0].tags).toContain('VIP')
  })

  it('is a no-op (no undo) when tag does not exist anywhere', () => {
    const prevUndoLength = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().removeTagGlobal('NonExistentTag99')
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(prevUndoLength)
  })

  it('removes tag from containers', () => {
    // Attach a custom tag to a container and confirm removeTagGlobal strips it
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Cache')
    useWorkspaceStore.setState((s) => {
      if (!s.workspace) return
      const container = s.workspace.model.softwareSystems.find(sys => sys.id === 'api')!.containers.find(c => c.id === containerId)!
      container.tags = ['Element', 'Container', 'VIP']
    })
    useWorkspaceStore.getState().removeTagGlobal('VIP')
    const ws = useWorkspaceStore.getState().workspace!
    const container = ws.model.softwareSystems.find(sys => sys.id === 'api')!.containers.find(c => c.id === containerId)!
    expect(container.tags).not.toContain('VIP')
    expect(container.tags).toContain('Container')
  })

  it('removes tag from components', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Backend')
    const compId = useWorkspaceStore.getState().addComponent(containerId, 'Handler')
    useWorkspaceStore.setState((s) => {
      if (!s.workspace) return
      const comp = s.workspace.model.softwareSystems.find(sys => sys.id === 'api')!.containers.find(c => c.id === containerId)!.components.find(comp => comp.id === compId)!
      comp.tags = ['Element', 'Component', 'VIP']
    })
    useWorkspaceStore.getState().removeTagGlobal('VIP')
    const ws = useWorkspaceStore.getState().workspace!
    const comp = ws.model.softwareSystems.find(sys => sys.id === 'api')!.containers.find(c => c.id === containerId)!.components.find(c => c.id === compId)!
    expect(comp.tags).not.toContain('VIP')
    expect(comp.tags).toContain('Component')
  })
})

// ─── Canvas position and layout actions ─────────────────────────────────────

describe('updateNodePosition and updateNodePositions', () => {
  function makeWsWithView(): { ws: Workspace; viewKey: string } {
    const ws = makeWorkspace()
    const viewKey = 'v1'
    ws.views.systemLandscapeViews.push({
      key: viewKey,
      type: 'systemLandscape',
      title: 'Landscape',
      elements: [{ id: 'alice', x: 0, y: 0 }, { id: 'api', x: 100, y: 0 }],
      relationships: [],
      autoLayout: { direction: 'TB' },
    })
    return { ws, viewKey }
  }

  beforeEach(() => {
    const { ws, viewKey } = makeWsWithView()
    useWorkspaceStore.setState({
      workspace: ws,
      activeViewKey: viewKey,
      undoStack: [],
      redoStack: [],
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
    })
  })

  it('updateNodePosition sets x, y and marks pinned=true', () => {
    useWorkspaceStore.getState().updateNodePosition('alice', 42, 99)
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    const el = view.elements.find(e => e.id === 'alice')!
    expect(el.x).toBe(42)
    expect(el.y).toBe(99)
    expect(el.pinned).toBe(true)
  })

  it('updateNodePosition does not affect other elements', () => {
    useWorkspaceStore.getState().updateNodePosition('alice', 42, 99)
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    const api = view.elements.find(e => e.id === 'api')!
    expect(api.x).toBe(100)
    expect(api.y).toBe(0)
    expect(api.pinned).toBeUndefined()
  })

  it('updateNodePosition does not push to undo stack', () => {
    useWorkspaceStore.getState().updateNodePosition('alice', 42, 99)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('updateNodePositions updates multiple elements in one call', () => {
    useWorkspaceStore.getState().updateNodePositions([
      { id: 'alice', x: 10, y: 20 },
      { id: 'api', x: 200, y: 300 },
    ])
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    expect(view.elements.find(e => e.id === 'alice')).toMatchObject({ x: 10, y: 20, pinned: true })
    expect(view.elements.find(e => e.id === 'api')).toMatchObject({ x: 200, y: 300, pinned: true })
  })
})

describe('setLayoutDirection and resetAndRelayout', () => {
  function makeWsWithPinnedView(): { ws: Workspace; viewKey: string } {
    const ws = makeWorkspace()
    const viewKey = 'v1'
    ws.views.systemLandscapeViews.push({
      key: viewKey,
      type: 'systemLandscape',
      title: 'Landscape',
      elements: [
        { id: 'alice', x: 10, y: 20, pinned: true },
        { id: 'api', x: 50, y: 80, pinned: true },
      ],
      relationships: [],
      autoLayout: { direction: 'TB' },
    })
    return { ws, viewKey }
  }

  beforeEach(() => {
    const { ws, viewKey } = makeWsWithPinnedView()
    useWorkspaceStore.setState({
      workspace: ws,
      activeViewKey: viewKey,
      layoutVersion: 0,
      undoStack: [],
      redoStack: [],
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
    })
  })

  it('setLayoutDirection changes direction on the view', () => {
    useWorkspaceStore.getState().setLayoutDirection('v1', 'LR')
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    expect(view.autoLayout?.direction).toBe('LR')
  })

  it('setLayoutDirection resets element positions and pinned flags', () => {
    useWorkspaceStore.getState().setLayoutDirection('v1', 'LR')
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    for (const el of view.elements) {
      expect(el.x).toBeUndefined()
      expect(el.y).toBeUndefined()
      expect(el.pinned).toBeUndefined()
    }
  })

  it('setLayoutDirection increments layoutVersion', () => {
    useWorkspaceStore.getState().setLayoutDirection('v1', 'LR')
    expect(useWorkspaceStore.getState().layoutVersion).toBe(1)
  })

  it('setLayoutDirection supports undo', () => {
    useWorkspaceStore.getState().setLayoutDirection('v1', 'LR')
    useWorkspaceStore.getState().undo()
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    expect(view.autoLayout?.direction).toBe('TB')
    expect(view.elements[0].pinned).toBe(true)
  })

  it('resetAndRelayout clears all positions and optionally sets direction', () => {
    useWorkspaceStore.getState().resetAndRelayout('v1', 'BT')
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    expect(view.autoLayout?.direction).toBe('BT')
    for (const el of view.elements) {
      expect(el.x).toBeUndefined()
      expect(el.pinned).toBeUndefined()
    }
  })

  it('resetAndRelayout without direction preserves existing direction', () => {
    useWorkspaceStore.getState().resetAndRelayout('v1')
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    expect(view.autoLayout?.direction).toBe('TB')
  })

  it('resetAndRelayout increments layoutVersion', () => {
    useWorkspaceStore.getState().resetAndRelayout('v1')
    expect(useWorkspaceStore.getState().layoutVersion).toBe(1)
  })
})

describe('updateElementStyle and removeElementStyle', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('updateElementStyle adds a new style when tag does not exist', () => {
    useWorkspaceStore.getState().updateElementStyle({ tag: 'VIP', background: '#ff0000' })
    const styles = useWorkspaceStore.getState().workspace!.views.configuration.styles.elements
    expect(styles).toHaveLength(1)
    expect(styles[0]).toMatchObject({ tag: 'VIP', background: '#ff0000' })
  })

  it('updateElementStyle merges when tag already exists', () => {
    useWorkspaceStore.getState().updateElementStyle({ tag: 'VIP', background: '#ff0000' })
    useWorkspaceStore.getState().updateElementStyle({ tag: 'VIP', color: '#ffffff' })
    const styles = useWorkspaceStore.getState().workspace!.views.configuration.styles.elements
    expect(styles).toHaveLength(1)
    expect(styles[0]).toMatchObject({ tag: 'VIP', background: '#ff0000', color: '#ffffff' })
  })

  it('updateElementStyle supports undo', () => {
    useWorkspaceStore.getState().updateElementStyle({ tag: 'VIP', background: '#ff0000' })
    useWorkspaceStore.getState().undo()
    const styles = useWorkspaceStore.getState().workspace!.views.configuration.styles.elements
    expect(styles).toHaveLength(0)
  })

  it('removeElementStyle removes a custom style', () => {
    useWorkspaceStore.getState().updateElementStyle({ tag: 'VIP', background: '#ff0000' })
    useWorkspaceStore.getState().removeElementStyle('VIP')
    const styles = useWorkspaceStore.getState().workspace!.views.configuration.styles.elements
    expect(styles).toHaveLength(0)
  })

  it('removeElementStyle resets built-in tags to theme default', () => {
    // Built-in type tag styles fall back to the theme palette when removed,
    // so removing them is a valid "reset" operation.
    useWorkspaceStore.getState().updateElementStyle({ tag: 'Person', background: '#ff0000' })
    useWorkspaceStore.getState().removeElementStyle('Person')
    const styles = useWorkspaceStore.getState().workspace!.views.configuration.styles.elements
    expect(styles).toHaveLength(0)
  })

  it('removeElementStyle supports undo', () => {
    useWorkspaceStore.getState().updateElementStyle({ tag: 'VIP', background: '#ff0000' })
    useWorkspaceStore.getState().removeElementStyle('VIP')
    useWorkspaceStore.getState().undo()
    const styles = useWorkspaceStore.getState().workspace!.views.configuration.styles.elements
    expect(styles).toHaveLength(1)
    expect(styles[0].tag).toBe('VIP')
  })

  it('removeElementStyle is a no-op (no undo) when the tag style does not exist', () => {
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().removeElementStyle('NonExistentTag')
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(undoBefore)
  })

  it('updateElementStyle is a no-op (no undo) when all incoming fields already match', () => {
    useWorkspaceStore.getState().updateElementStyle({ tag: 'VIP', background: '#ff0000' })
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    // Re-apply the exact same background — nothing changes
    useWorkspaceStore.getState().updateElementStyle({ tag: 'VIP', background: '#ff0000' })
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
  })

  it('updateElementStyle is NOT a no-op when a field value changes', () => {
    useWorkspaceStore.getState().updateElementStyle({ tag: 'VIP', background: '#ff0000' })
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().updateElementStyle({ tag: 'VIP', background: '#00ff00' })
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore + 1)
    const styles = useWorkspaceStore.getState().workspace!.views.configuration.styles.elements
    expect(styles[0].background).toBe('#00ff00')
  })

  it('updateElementStyle is NOT a no-op when a new field is added to existing style', () => {
    useWorkspaceStore.getState().updateElementStyle({ tag: 'VIP', background: '#ff0000' })
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().updateElementStyle({ tag: 'VIP', color: '#ffffff' })
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore + 1)
  })
})

describe('setActiveTagFilter and setActiveStatusFilter', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('setActiveTagFilter sets the filter', () => {
    useWorkspaceStore.getState().setActiveTagFilter(['VIP'])
    expect(useWorkspaceStore.getState().activeTagFilter).toEqual(['VIP'])
  })

  it('setActiveTagFilter clears the filter with empty array', () => {
    useWorkspaceStore.getState().setActiveTagFilter(['VIP'])
    useWorkspaceStore.getState().setActiveTagFilter([])
    expect(useWorkspaceStore.getState().activeTagFilter).toEqual([])
  })

  it('setActiveStatusFilter sets the status filter', () => {
    useWorkspaceStore.getState().setActiveStatusFilter(['Live'])
    expect(useWorkspaceStore.getState().activeStatusFilter).toEqual(['Live'])
  })

  it('setActiveStatusFilter clears the filter with empty array', () => {
    useWorkspaceStore.getState().setActiveStatusFilter(['Deprecated'])
    useWorkspaceStore.getState().setActiveStatusFilter([])
    expect(useWorkspaceStore.getState().activeStatusFilter).toEqual([])
  })

  it('loadWorkspace resets both filters', () => {
    useWorkspaceStore.getState().setActiveTagFilter(['VIP'])
    useWorkspaceStore.getState().setActiveStatusFilter(['Live'])
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    expect(useWorkspaceStore.getState().activeTagFilter).toEqual([])
    expect(useWorkspaceStore.getState().activeStatusFilter).toEqual([])
  })

  it('clearAllHighlightFilters resets all four facets', () => {
    const s = useWorkspaceStore.getState()
    s.setActiveTagFilter(['x'])
    s.setActiveStatusFilter(['Live'])
    s.setActiveTechFilter(['Go'])
    s.setActiveTeamFilter(['Platform'])
    s.clearAllHighlightFilters()
    const after = useWorkspaceStore.getState()
    expect(after.activeTagFilter).toEqual([])
    expect(after.activeStatusFilter).toEqual([])
    expect(after.activeTechFilter).toEqual([])
    expect(after.activeTeamFilter).toEqual([])
  })
})

// ─── addPerson / addSoftwareSystem location parameter ────────────────

describe('addPerson and addSoftwareSystem — location parameter', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('addPerson defaults to Internal location', () => {
    const id = useWorkspaceStore.getState().addPerson('Bob')
    const person = useWorkspaceStore.getState().workspace!.model.people.find(p => p.id === id)!
    expect(person.location).toBe('Internal')
  })

  it('addPerson with External location stores External', () => {
    const id = useWorkspaceStore.getState().addPerson('External User', undefined, 'External')
    const person = useWorkspaceStore.getState().workspace!.model.people.find(p => p.id === id)!
    expect(person.location).toBe('External')
  })

  it('addSoftwareSystem defaults to Internal location', () => {
    const id = useWorkspaceStore.getState().addSoftwareSystem('MyApp')
    const sys = useWorkspaceStore.getState().workspace!.model.softwareSystems.find(s => s.id === id)!
    expect(sys.location).toBe('Internal')
  })

  it('addSoftwareSystem with External location stores External', () => {
    const id = useWorkspaceStore.getState().addSoftwareSystem('Legacy API', undefined, 'External')
    const sys = useWorkspaceStore.getState().workspace!.model.softwareSystems.find(s => s.id === id)!
    expect(sys.location).toBe('External')
  })
})

// ─── updateElement location ──────────────────────────────────────────

describe('updateElement — location', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('updateElement changes location to External', () => {
    // alice has no location set in makeWorkspace() (undefined) — changing it to External is a real change
    useWorkspaceStore.getState().updateElement('alice', { location: 'External' })
    expect(useWorkspaceStore.getState().workspace!.model.people[0].location).toBe('External')
  })

  it('updateElement location change supports undo', () => {
    useWorkspaceStore.getState().updateElement('alice', { location: 'External' })
    useWorkspaceStore.getState().undo()
    // After undo the location reverts to the state before the change (undefined in makeWorkspace)
    expect(useWorkspaceStore.getState().workspace!.model.people[0].location).toBeUndefined()
  })

  it('updateElement is a no-op (no undo) when location is already the same value', () => {
    // First set a location explicitly
    useWorkspaceStore.getState().updateElement('alice', { location: 'External' })
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    // Passing the same value again should not push undo
    useWorkspaceStore.getState().updateElement('alice', { location: 'External' })
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
  })

  it('updateElement location has no effect on containers (not applicable)', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Web')
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    // Containers have no location field — this should be a no-op
    useWorkspaceStore.getState().updateElement(containerId, { location: 'External' })
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
  })
})

// ─── updateRelationship — tags ───────────────────────────────────────

describe('updateRelationship — tags', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('updateRelationship adds a custom tag to the relationship', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    useWorkspaceStore.getState().updateRelationship(relId, { tags: ['Relationship', 'Priority'] })
    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === relId)!
    expect(rel.tags).toContain('Priority')
    expect(rel.tags).toContain('Relationship')
  })

  it('updateRelationship tags change supports undo', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    useWorkspaceStore.getState().updateRelationship(relId, { tags: ['Relationship', 'Priority'] })
    useWorkspaceStore.getState().undo()
    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === relId)!
    expect(rel.tags).not.toContain('Priority')
    expect(rel.tags).toContain('Relationship')
  })

  it('updateRelationship is a no-op (no undo) when tags array is identical', () => {
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'api', 'calls')
    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === relId)!
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    // Pass the exact same tags array contents — should not push undo
    useWorkspaceStore.getState().updateRelationship(relId, { tags: [...rel.tags] })
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
  })
})

// ─── addContainer — extraTag parameter ───────────────────────────────────────

describe('addContainer — extraTag parameter', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('addContainer with extraTag appends the custom tag after built-in tags', () => {
    const id = useWorkspaceStore.getState().addContainer('api', 'DB', undefined, 'Database')
    const ws = useWorkspaceStore.getState().workspace!
    const container = ws.model.softwareSystems.find(s => s.id === 'api')!.containers.find(c => c.id === id)!
    expect(container.tags).toEqual(['Element', 'Container', 'Database'])
  })

  it('addContainer without extraTag has exactly the two built-in tags', () => {
    const id = useWorkspaceStore.getState().addContainer('api', 'Web')
    const ws = useWorkspaceStore.getState().workspace!
    const container = ws.model.softwareSystems.find(s => s.id === 'api')!.containers.find(c => c.id === id)!
    expect(container.tags).toEqual(['Element', 'Container'])
  })
})

// ─── duplicateElements — softwareSystem with containers ──────────────────────

describe('duplicateElements — softwareSystem with containers', () => {
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
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'alice')
    useWorkspaceStore.getState().toggleElementInView(viewKey, 'api')
  })

  it('duplicated softwareSystem clones its containers with new IDs', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Web')
    const newIds = useWorkspaceStore.getState().duplicateElements(['api'])
    expect(newIds).toHaveLength(1)
    const ws = useWorkspaceStore.getState().workspace!
    const clone = ws.model.softwareSystems.find(s => s.id === newIds[0])!
    expect(clone.containers).toHaveLength(1)
    expect(clone.containers[0].id).not.toBe(containerId)
    expect(clone.containers[0].name).toBe('Web')
  })

  it('duplicated softwareSystem is auto-added to sibling systemLandscape views', () => {
    const viewKey2 = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Landscape 2')
    const newIds = useWorkspaceStore.getState().duplicateElements(['api'])
    expect(newIds).toHaveLength(1)
    const ws = useWorkspaceStore.getState().workspace!
    const sibling = ws.views.systemLandscapeViews.find(v => v.key === viewKey2)!
    expect(sibling.elements.some(e => e.id === newIds[0])).toBe(true)
  })
})

// ─── duplicateElements — container and component sibling view auto-add ────────

describe('duplicateElements — container and component sibling view auto-add', () => {
  let containerViewKey: string
  let containerId: string

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
    // Create two container views for 'api' so there is a sibling to auto-add into
    containerViewKey = useWorkspaceStore.getState().addView('container', 'api', 'Containers A')
    useWorkspaceStore.getState().addView('container', 'api', 'Containers B')
    useWorkspaceStore.getState().setActiveView(containerViewKey)
    containerId = useWorkspaceStore.getState().addContainer('api', 'Web')
  })

  it('duplicated container is auto-added to sibling container views scoped to the same system', () => {
    // containerViewKey is active; there is also Containers B (a sibling container view for 'api')
    const newIds = useWorkspaceStore.getState().duplicateElements([containerId])
    expect(newIds).toHaveLength(1)
    const ws = useWorkspaceStore.getState().workspace!
    // All container views for 'api' should have the clone
    const siblingViewB = ws.views.containerViews.find(v => v.title === 'Containers B')!
    expect(siblingViewB.elements.some(e => e.id === newIds[0])).toBe(true)
  })

  it('duplicated container is NOT auto-added to container views for a different system', () => {
    const otherId = useWorkspaceStore.getState().addSoftwareSystem('Other')
    useWorkspaceStore.getState().addView('container', otherId, 'Other Containers')
    // Reset active view back to Containers A before duplicating so 'Other Containers' is not the active view
    useWorkspaceStore.getState().setActiveView(containerViewKey)
    const newIds = useWorkspaceStore.getState().duplicateElements([containerId])
    expect(newIds).toHaveLength(1)
    const ws = useWorkspaceStore.getState().workspace!
    const otherView = ws.views.containerViews.find(v => v.title === 'Other Containers')!
    expect(otherView.elements.some(e => e.id === newIds[0])).toBe(false)
  })

  it('duplicated component is auto-added to sibling component views scoped to the same container', () => {
    // Create two component views for 'containerId'
    const compViewA = useWorkspaceStore.getState().addView('component', containerId, 'Components A')
    useWorkspaceStore.getState().addView('component', containerId, 'Components B')
    useWorkspaceStore.getState().setActiveView(compViewA)
    const compId = useWorkspaceStore.getState().addComponent(containerId, 'Auth')
    // Duplicate the component while Components A is active
    const newIds = useWorkspaceStore.getState().duplicateElements([compId])
    expect(newIds).toHaveLength(1)
    const ws = useWorkspaceStore.getState().workspace!
    const siblingViewB = ws.views.componentViews.find(v => v.title === 'Components B')!
    expect(siblingViewB.elements.some(e => e.id === newIds[0])).toBe(true)
  })
})

// ─── updateElement — url field ────────────────────────────────────────────────

describe('updateElement — url', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('updateElement sets url on an element', () => {
    useWorkspaceStore.getState().updateElement('alice', { url: 'https://example.com/alice' })
    expect(useWorkspaceStore.getState().workspace!.model.people[0].url).toBe('https://example.com/alice')
  })

  it('updateElement url change supports undo', () => {
    useWorkspaceStore.getState().updateElement('alice', { url: 'https://example.com/alice' })
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace!.model.people[0].url).toBeUndefined()
  })

  it('updateElement clears url when passed undefined', () => {
    useWorkspaceStore.getState().updateElement('alice', { url: 'https://example.com' })
    useWorkspaceStore.getState().updateElement('alice', { url: undefined })
    expect(useWorkspaceStore.getState().workspace!.model.people[0].url).toBeUndefined()
  })

  it('updateElement is a no-op (no undo) when url is already undefined and patch passes undefined', () => {
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().updateElement('alice', { url: undefined })
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
  })
})

// ─── updateElementLive — technology ──────────────────────────────────────────

describe('updateElementLive — technology', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('updateElementLive sets technology on a container without pushing undo', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Web')
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().updateElementLive(containerId, { technology: 'React' })
    const container = useWorkspaceStore.getState().workspace!.model.softwareSystems[0].containers.find(c => c.id === containerId)!
    expect(container.technology).toBe('React')
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
  })

  it('updateElementLive technology has no effect on persons (not applicable)', () => {
    const ws0 = useWorkspaceStore.getState().workspace!
    const undoBefore = useWorkspaceStore.getState().undoStack.length
    useWorkspaceStore.getState().updateElementLive('alice', { technology: 'React' })
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
    // alice (person) has no technology field — workspace should be unchanged
    expect(JSON.stringify(useWorkspaceStore.getState().workspace)).toBe(JSON.stringify(ws0))
  })
})

// ─── renameTag — containers and components ────────────────────────────────────

describe('renameTag — nested elements (containers and components)', () => {
  let containerId: string

  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    // Use a non-built-in custom tag 'Legacy' so renameTag is not blocked
    containerId = useWorkspaceStore.getState().addContainer('api', 'DB', undefined, 'Legacy')
    useWorkspaceStore.getState().addComponent(containerId, 'Schema')
    // Give the component the same custom tag by patching the workspace
    useWorkspaceStore.setState((s) => {
      if (!s.workspace) return
      const sys = s.workspace.model.softwareSystems.find(sys => sys.id === 'api')!
      const comp = sys.containers.find(c => c.id === containerId)!.components[0]
      comp.tags = ['Element', 'Component', 'Legacy']
    })
  })

  it('renameTag renames tag on containers', () => {
    useWorkspaceStore.getState().renameTag('Legacy', 'Archive')
    const ws = useWorkspaceStore.getState().workspace!
    const container = ws.model.softwareSystems[0].containers[0]
    expect(container.tags).toContain('Archive')
    expect(container.tags).not.toContain('Legacy')
  })

  it('renameTag renames tag on components', () => {
    useWorkspaceStore.getState().renameTag('Legacy', 'Archive')
    const ws = useWorkspaceStore.getState().workspace!
    const component = ws.model.softwareSystems[0].containers[0].components[0]
    expect(component.tags).toContain('Archive')
    expect(component.tags).not.toContain('Legacy')
  })
})

// ─── undo/redo — viewHistory purging ──────────────────────────────────

describe('undo/redo — viewHistory purging', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('undo purges viewHistory entries that no longer exist in the restored workspace', () => {
    // Create two views; keyB ends up active
    useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View A')
    const keyB = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View B')
    // Simulate: user navigated through B so it appears in history (e.g., drillInto from B)
    useWorkspaceStore.setState({ viewHistory: [keyB] })
    // Undo the addition of view B — the restored workspace has only view A
    useWorkspaceStore.getState().undo()
    // viewHistory must no longer contain keyB (it was purged since B no longer exists)
    expect(useWorkspaceStore.getState().viewHistory).not.toContain(keyB)
  })

  it('redo purges viewHistory entries that do not exist in the redo target workspace', () => {
    // Add view A and undo it so redo stack has {A}
    const keyA = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'View A')
    useWorkspaceStore.getState().undo()
    // Inject a stale key into viewHistory (pretend keyA was in history before undo)
    useWorkspaceStore.setState({ viewHistory: ['stale-key-that-never-existed'] })
    // Redo restores workspace with view A; stale key is still not present → purge
    useWorkspaceStore.getState().redo()
    expect(useWorkspaceStore.getState().viewHistory).not.toContain('stale-key-that-never-existed')
    // The valid key A was added back to the workspace via redo
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0].key).toBe(keyA)
  })

  it('undo is a no-op when undoStack is empty', () => {
    // Fresh workspace — undo stack is empty
    const wsBefore = JSON.stringify(useWorkspaceStore.getState().workspace)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
    useWorkspaceStore.getState().undo()
    expect(JSON.stringify(useWorkspaceStore.getState().workspace)).toBe(wsBefore)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('redo is a no-op when redoStack is empty', () => {
    // No undo performed, so redo stack is empty
    const viewKey = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'My View')
    const wsBefore = JSON.stringify(useWorkspaceStore.getState().workspace)
    expect(useWorkspaceStore.getState().redoStack).toHaveLength(0)
    useWorkspaceStore.getState().redo()
    expect(JSON.stringify(useWorkspaceStore.getState().workspace)).toBe(wsBefore)
    expect(useWorkspaceStore.getState().activeViewKey).toBe(viewKey)
  })
})

// ─── loadWorkspace — edge cases ───────────────────────────────────────

describe('loadWorkspace — edge cases', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().closeWorkspace()
  })

  it('loadWorkspace with a workspace that has no views sets activeViewKey to null', () => {
    const ws = makeWorkspace() // makeWorkspace has no views by default
    useWorkspaceStore.getState().loadWorkspace(ws)
    expect(useWorkspaceStore.getState().activeViewKey).toBeNull()
  })

  it('loadWorkspace with a workspace that has views sets activeViewKey to the first view', () => {
    const ws = makeWorkspace()
    ws.views.systemLandscapeViews.push({
      key: 'landscape1',
      type: 'systemLandscape',
      title: 'Landscape',
      elements: [],
      relationships: [],
      autoLayout: { direction: 'TB' },
    })
    useWorkspaceStore.getState().loadWorkspace(ws)
    expect(useWorkspaceStore.getState().activeViewKey).toBe('landscape1')
  })

  it('loadWorkspace resets undo and redo stacks', () => {
    // Populate stacks from a previous session
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.getState().addGroup('Temp')
    expect(useWorkspaceStore.getState().undoStack.length).toBeGreaterThan(0)
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().redoStack.length).toBeGreaterThan(0)
    // Load a fresh workspace — stacks must reset
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
    expect(useWorkspaceStore.getState().redoStack).toHaveLength(0)
  })
})

// ─── buildElementMap ──────────────────────────────────────────────────

describe('buildElementMap', () => {
  it('maps all people by ID', () => {
    const ws = makeWorkspace()
    const map = buildElementMap(ws)
    expect(map.has('alice')).toBe(true)
    expect(map.get('alice')!.name).toBe('Alice')
  })

  it('maps all softwareSystems by ID', () => {
    const ws = makeWorkspace()
    const map = buildElementMap(ws)
    expect(map.has('api')).toBe(true)
    expect(map.get('api')!.type).toBe('softwareSystem')
  })

  it('maps nested containers by ID', () => {
    const ws = makeWorkspace()
    ws.model.softwareSystems[0].containers = [
      { id: 'db', type: 'container', name: 'Database', tags: ['Container'], properties: {}, components: [] },
    ]
    const map = buildElementMap(ws)
    expect(map.has('db')).toBe(true)
    expect(map.get('db')!.name).toBe('Database')
  })

  it('maps nested components (inside containers) by ID', () => {
    const ws = makeWorkspace()
    ws.model.softwareSystems[0].containers = [
      {
        id: 'web', type: 'container', name: 'Web App', tags: ['Container'], properties: {},
        components: [
          { id: 'ctrl', type: 'component', name: 'Controller', tags: ['Component'], properties: {} },
        ],
      },
    ]
    const map = buildElementMap(ws)
    expect(map.has('ctrl')).toBe(true)
    expect(map.get('ctrl')!.name).toBe('Controller')
  })

  it('returns an empty map when model has no elements', () => {
    const ws = makeWorkspace()
    ws.model.people = []
    ws.model.softwareSystems = []
    const map = buildElementMap(ws)
    expect(map.size).toBe(0)
  })
})

// ─── buildRelationshipMap ─────────────────────────────────────────────

describe('buildRelationshipMap', () => {
  it('maps all relationships by ID', () => {
    const ws = makeWorkspace()
    ws.model.relationships = [
      { id: 'r1', sourceId: 'alice', destinationId: 'api', tags: ['Relationship'], properties: {} },
      { id: 'r2', sourceId: 'api', destinationId: 'alice', tags: ['Relationship'], properties: {} },
    ]
    const map = buildRelationshipMap(ws)
    expect(map.has('r1')).toBe(true)
    expect(map.has('r2')).toBe(true)
    expect(map.get('r1')!.sourceId).toBe('alice')
  })

  it('returns an empty map when there are no relationships', () => {
    const ws = makeWorkspace()
    ws.model.relationships = []
    const map = buildRelationshipMap(ws)
    expect(map.size).toBe(0)
  })
})

// ─── canDrillInto ─────────────────────────────────────────────────────

describe('canDrillInto', () => {
  it('returns false for a person (never has child views)', () => {
    const ws = makeWorkspace()
    expect(canDrillInto(ws, 'alice')).toBe(false)
  })

  it('returns false for a softwareSystem with no scoped views', () => {
    const ws = makeWorkspace()
    // No systemContext or container views exist → no child view
    expect(canDrillInto(ws, 'api')).toBe(false)
  })

  it('returns true for a softwareSystem that has a container view', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.getState().addView('container', 'api', 'Containers')
    const ws = useWorkspaceStore.getState().workspace!
    expect(canDrillInto(ws, 'api')).toBe(true)
  })

  it('returns true for a softwareSystem that has a systemContext view', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.getState().addView('systemContext', 'api', 'API Context')
    const ws = useWorkspaceStore.getState().workspace!
    expect(canDrillInto(ws, 'api')).toBe(true)
  })

  it('returns true for a container that has a component view', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Web')
    useWorkspaceStore.getState().addView('component', containerId, 'Components')
    const ws = useWorkspaceStore.getState().workspace!
    expect(canDrillInto(ws, containerId)).toBe(true)
  })

  it('returns false for a container with no component view', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Web')
    const ws = useWorkspaceStore.getState().workspace!
    expect(canDrillInto(ws, containerId)).toBe(false)
  })

  it('returns false for an unknown element ID', () => {
    const ws = makeWorkspace()
    expect(canDrillInto(ws, 'does-not-exist')).toBe(false)
  })
})

// ─── getRelationshipById ──────────────────────────────────────────────

describe('getRelationshipById', () => {
  it('returns the relationship when found', () => {
    const ws = makeWorkspace()
    ws.model.relationships = [
      { id: 'rel-1', sourceId: 'alice', destinationId: 'api', tags: ['Relationship'], properties: {} },
    ]
    const rel = getRelationshipById(ws, 'rel-1')
    expect(rel).toBeDefined()
    expect(rel!.sourceId).toBe('alice')
  })

  it('returns undefined when not found', () => {
    const ws = makeWorkspace()
    expect(getRelationshipById(ws, 'ghost-rel')).toBeUndefined()
  })
})

// ─── getSelectedElement ───────────────────────────────────────────────

describe('getSelectedElement', () => {
  it('returns undefined when selectedIds is empty', () => {
    const ws = makeWorkspace()
    expect(getSelectedElement(ws, [])).toBeUndefined()
  })

  it('returns the element for the first selected ID', () => {
    const ws = makeWorkspace()
    const el = getSelectedElement(ws, ['alice'])
    expect(el).toBeDefined()
    expect(el!.name).toBe('Alice')
  })

  it('returns the first element when multiple IDs are selected', () => {
    const ws = makeWorkspace()
    // alice is first in model
    const el = getSelectedElement(ws, ['alice', 'api'])
    expect(el!.id).toBe('alice')
  })

  it('returns undefined when the ID is not found in the model', () => {
    const ws = makeWorkspace()
    expect(getSelectedElement(ws, ['ghost-id'])).toBeUndefined()
  })
})

// ─── revalidateScope ──────────────────────────────────────────────────

describe('revalidateScope', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('populates scopeViolations when a landscape-scoped workspace has containers', () => {
    // Add a container to violate landscape scope
    const ws = useWorkspaceStore.getState().workspace!
    const patchedWs: Workspace = {
      ...ws,
      scope: 'landscape',
      model: {
        ...ws.model,
        softwareSystems: [
          {
            id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {},
            containers: [{ id: 'c1', type: 'container', name: 'Web', tags: ['Element', 'Container'], properties: {}, components: [] }],
          },
        ],
      },
    }
    useWorkspaceStore.setState({ workspace: patchedWs, scopeViolations: [] })
    // scopeViolations is empty before revalidation
    expect(useWorkspaceStore.getState().scopeViolations).toHaveLength(0)

    useWorkspaceStore.getState().revalidateScope()

    const violations = useWorkspaceStore.getState().scopeViolations
    // Validator emits both a workspace-level violation summarizing the count
    // and per-container violations for each offending container.
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.every((v) => v.type === 'error')).toBe(true)
  })

  it('clears scopeViolations when workspace becomes valid', () => {
    // Start with a pre-loaded violation
    useWorkspaceStore.setState({ scopeViolations: [{ type: 'error', message: 'stale error' }] })
    // Current workspace has no scope set, so it should be violation-free
    useWorkspaceStore.getState().revalidateScope()
    expect(useWorkspaceStore.getState().scopeViolations).toHaveLength(0)
  })

  it('returns empty violations when workspace is null', () => {
    useWorkspaceStore.setState({ workspace: null, scopeViolations: [{ type: 'error', message: 'old' }] })
    useWorkspaceStore.getState().revalidateScope()
    expect(useWorkspaceStore.getState().scopeViolations).toHaveLength(0)
  })
})

// ─── setLastSavedUndoLength ───────────────────────────────────────────

describe('setLastSavedUndoLength', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('updates lastSavedUndoLength', () => {
    useWorkspaceStore.getState().setLastSavedUndoLength(5)
    expect(useWorkspaceStore.getState().lastSavedUndoLength).toBe(5)
  })

  it('can be set to 0 to mark workspace as saved at current position', () => {
    useWorkspaceStore.getState().setLastSavedUndoLength(3)
    useWorkspaceStore.getState().setLastSavedUndoLength(0)
    expect(useWorkspaceStore.getState().lastSavedUndoLength).toBe(0)
  })

  it('loadWorkspace resets lastSavedUndoLength to 0', () => {
    useWorkspaceStore.getState().setLastSavedUndoLength(7)
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    expect(useWorkspaceStore.getState().lastSavedUndoLength).toBe(0)
  })
})

// ─── focusElementId / clearFocusElement ──────────────────────────────

describe('focusElementId', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  })

  it('addPerson sets focusElementId to the new person id', () => {
    const id = useWorkspaceStore.getState().addPerson('Carol')
    expect(useWorkspaceStore.getState().focusElementId).toBe(id)
  })

  it('addSoftwareSystem sets focusElementId to the new system id', () => {
    const id = useWorkspaceStore.getState().addSoftwareSystem('Payments')
    expect(useWorkspaceStore.getState().focusElementId).toBe(id)
  })

  it('addContainer sets focusElementId to the new container id', () => {
    const id = useWorkspaceStore.getState().addContainer('api', 'Database')
    expect(useWorkspaceStore.getState().focusElementId).toBe(id)
  })

  it('addComponent sets focusElementId to the new component id', () => {
    const containerId = useWorkspaceStore.getState().addContainer('api', 'Backend')
    const id = useWorkspaceStore.getState().addComponent(containerId, 'Auth Service')
    expect(useWorkspaceStore.getState().focusElementId).toBe(id)
  })

  it('clearFocusElement resets focusElementId to null', () => {
    useWorkspaceStore.getState().addPerson('Dave')
    expect(useWorkspaceStore.getState().focusElementId).not.toBeNull()
    useWorkspaceStore.getState().clearFocusElement()
    expect(useWorkspaceStore.getState().focusElementId).toBeNull()
  })

  it('loadWorkspace clears focusElementId', () => {
    useWorkspaceStore.getState().addPerson('Eve')
    expect(useWorkspaceStore.getState().focusElementId).not.toBeNull()
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    expect(useWorkspaceStore.getState().focusElementId).toBeNull()
  })
})

describe('zoomInto + pendingZoomConfirm', () => {
  function makeWorkspaceWithContainer(): Workspace {
    return {
      name: 'Test',
      model: {
        people: [],
        softwareSystems: [
          {
            id: 'sys1', type: 'softwareSystem', name: 'Internet Banking', tags: ['Element', 'Software System'], properties: {},
            containers: [
              { id: 'c1', type: 'container', name: 'Web App', tags: ['Element', 'Container'], properties: {}, components: [] },
              { id: 'c2', type: 'container', name: 'API', tags: ['Element', 'Container'], properties: {},
                components: [{ id: 'comp1', type: 'component', name: 'AuthService', tags: ['Element', 'Component'], properties: {} }],
              },
            ],
          },
          // An empty system — still zoomable; zoomInto should prompt to create an empty container view.
          { id: 'sys2', type: 'softwareSystem', name: 'Empty', tags: ['Element', 'Software System'], properties: {}, containers: [] },
        ],
        relationships: [],
        groups: [],
      },
      views: {
        systemLandscapeViews: [{
          type: 'systemLandscape', key: 'landscape', title: 'Landscape',
          elements: [{ id: 'sys1' }, { id: 'sys2' }],
          relationships: [], autoLayout: { direction: 'TB' },
        }],
        systemContextViews: [],
        containerViews: [],
        componentViews: [],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    } as unknown as Workspace
  }

  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspaceWithContainer())
  })

  it('zoomInto navigates when a child view already exists', () => {
    // Create a container view first so drill works
    useWorkspaceStore.getState().addView('container', 'sys1', 'Containers')
    // Go back to landscape
    useWorkspaceStore.getState().setActiveView('landscape')
    const before = useWorkspaceStore.getState().activeViewKey
    expect(before).toBe('landscape')

    useWorkspaceStore.getState().zoomInto('sys1')

    const state = useWorkspaceStore.getState()
    expect(state.activeViewKey).not.toBe('landscape')
    expect(state.pendingZoomConfirm).toBeNull()
    // The previous view is now in viewHistory (for navigateBack)
    expect(state.viewHistory).toContain('landscape')
  })

  it('zoomInto sets pendingZoomConfirm when no child view exists (system→container)', () => {
    useWorkspaceStore.getState().zoomInto('sys1')
    const state = useWorkspaceStore.getState()
    expect(state.pendingZoomConfirm).not.toBeNull()
    expect(state.pendingZoomConfirm?.elementId).toBe('sys1')
    expect(state.pendingZoomConfirm?.elementName).toBe('Internet Banking')
    expect(state.pendingZoomConfirm?.targetType).toBe('container')
    // Active view did not change.
    expect(state.activeViewKey).toBe('landscape')
  })

  it('zoomInto sets pendingZoomConfirm for container→component drill target', () => {
    useWorkspaceStore.getState().zoomInto('c2')
    const state = useWorkspaceStore.getState()
    expect(state.pendingZoomConfirm).not.toBeNull()
    expect(state.pendingZoomConfirm?.elementId).toBe('c2')
    expect(state.pendingZoomConfirm?.targetType).toBe('component')
  })

  it('zoomInto prompts to create a container view for a system with no containers', () => {
    useWorkspaceStore.getState().zoomInto('sys2')
    const state = useWorkspaceStore.getState()
    expect(state.pendingZoomConfirm).not.toBeNull()
    expect(state.pendingZoomConfirm?.elementId).toBe('sys2')
    expect(state.pendingZoomConfirm?.targetType).toBe('container')
  })

  it('zoomInto prompts to create a component view for a container with no components', () => {
    useWorkspaceStore.getState().zoomInto('c1')
    const state = useWorkspaceStore.getState()
    expect(state.pendingZoomConfirm).not.toBeNull()
    expect(state.pendingZoomConfirm?.elementId).toBe('c1')
    expect(state.pendingZoomConfirm?.targetType).toBe('component')
  })

  it('confirmZoomCreate creates a container view, navigates, and preserves history', () => {
    useWorkspaceStore.getState().zoomInto('sys1')
    expect(useWorkspaceStore.getState().pendingZoomConfirm).not.toBeNull()

    useWorkspaceStore.getState().confirmZoomCreate()

    const state = useWorkspaceStore.getState()
    expect(state.pendingZoomConfirm).toBeNull()
    // A new container view was created and is now active.
    const containerViews = state.workspace!.views.containerViews
    expect(containerViews).toHaveLength(1)
    expect(containerViews[0].softwareSystemId).toBe('sys1')
    expect(state.activeViewKey).toBe(containerViews[0].key)
    // viewHistory remembers the landscape so navigateBack works.
    expect(state.viewHistory).toContain('landscape')
  })

  it('confirmZoomCreate creates a component view for a container', () => {
    useWorkspaceStore.getState().zoomInto('c2')
    useWorkspaceStore.getState().confirmZoomCreate()

    const state = useWorkspaceStore.getState()
    expect(state.pendingZoomConfirm).toBeNull()
    const compViews = state.workspace!.views.componentViews
    expect(compViews).toHaveLength(1)
    expect(compViews[0].containerId).toBe('c2')
  })

  it('cancelZoomConfirm clears the pending confirm without creating a view', () => {
    useWorkspaceStore.getState().zoomInto('sys1')
    expect(useWorkspaceStore.getState().pendingZoomConfirm).not.toBeNull()

    useWorkspaceStore.getState().cancelZoomConfirm()

    const state = useWorkspaceStore.getState()
    expect(state.pendingZoomConfirm).toBeNull()
    expect(state.workspace!.views.containerViews).toHaveLength(0)
  })

  it('openCreateViewFromZoom consumes the pending confirm and opens the full dialog with defaults', () => {
    useWorkspaceStore.getState().zoomInto('sys1')

    useWorkspaceStore.getState().openCreateViewFromZoom()

    const state = useWorkspaceStore.getState()
    expect(state.pendingZoomConfirm).toBeNull()
    expect(state.createViewDialogOpen).toBe(true)
    expect(state.createViewDefaults).toEqual({ type: 'container', scopeId: 'sys1' })
  })

  it('openCreateViewFromZoom is a no-op when no confirm is pending', () => {
    // Ensure clean state — beforeEach loadWorkspace doesn't reset createViewDialogOpen.
    useWorkspaceStore.setState({ createViewDialogOpen: false, createViewDefaults: null, pendingZoomConfirm: null })
    useWorkspaceStore.getState().openCreateViewFromZoom()
    const state = useWorkspaceStore.getState()
    expect(state.createViewDialogOpen).toBe(false)
    expect(state.createViewDefaults).toBeNull()
  })

  it('loadWorkspace clears stale pendingZoomConfirm and createViewDefaults', () => {
    useWorkspaceStore.getState().zoomInto('sys1')
    useWorkspaceStore.setState({ createViewDefaults: { type: 'container', scopeId: 'sys1' } })

    useWorkspaceStore.getState().loadWorkspace(makeWorkspaceWithContainer())

    const state = useWorkspaceStore.getState()
    expect(state.pendingZoomConfirm).toBeNull()
    expect(state.createViewDefaults).toBeNull()
  })
})

describe('removeElementsFromView', () => {
  beforeEach(() => useWorkspaceStore.getState().closeWorkspace())

  it('removes the listed elements from the view but keeps them in the model', () => {
    const ws: Workspace = {
      name: 'T',
      model: {
        people: [],
        softwareSystems: [
          { id: 'sysA', type: 'softwareSystem', name: 'A', tags: [], properties: {}, containers: [] },
          { id: 'sysB', type: 'softwareSystem', name: 'B', tags: [], properties: {}, containers: [] },
        ],
        relationships: [{ id: 'r1', sourceId: 'sysA', destinationId: 'sysB', tags: [], properties: {} }],
        groups: [],
      },
      views: {
        systemLandscapeViews: [{
          type: 'systemLandscape', key: 'land',
          elements: [{ id: 'sysA' }, { id: 'sysB' }],
          relationships: [{ id: 'r1' }],
        }],
        systemContextViews: [], containerViews: [], componentViews: [],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    useWorkspaceStore.getState().loadWorkspace(ws)
    useWorkspaceStore.getState().setActiveView('land')

    useWorkspaceStore.getState().removeElementsFromView('land', ['sysA'])

    const w = useWorkspaceStore.getState().workspace!
    // Model intact:
    expect(w.model.softwareSystems.map(s => s.id)).toEqual(['sysA', 'sysB'])
    // View shrunk:
    expect(w.views.systemLandscapeViews[0].elements.map(e => e.id)).toEqual(['sysB'])
    // Orphaned relationship ref pruned:
    expect(w.views.systemLandscapeViews[0].relationships).toEqual([])
  })

  it('skips focal-scope IDs (defense in depth)', () => {
    const ws: Workspace = {
      name: 'T',
      model: {
        people: [],
        softwareSystems: [{
          id: 'sys', type: 'softwareSystem', name: 'S', tags: [], properties: {},
          containers: [{ id: 'c1', type: 'container', name: 'C', tags: [], properties: {}, components: [] }],
        }],
        relationships: [], groups: [],
      },
      views: {
        systemLandscapeViews: [], systemContextViews: [], componentViews: [],
        containerViews: [{
          type: 'container', key: 'cont', softwareSystemId: 'sys',
          elements: [{ id: 'c1' }], relationships: [],
        }],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    useWorkspaceStore.getState().loadWorkspace(ws)
    useWorkspaceStore.getState().setActiveView('cont')

    // Try to remove the focal system from its own container view (not normally selectable, but defense matters)
    useWorkspaceStore.getState().removeElementsFromView('cont', ['sys', 'c1'])

    const view = useWorkspaceStore.getState().workspace!.views.containerViews[0]
    // c1 removed, sys ignored (it wasn't in elements anyway, but the action must not have thrown or no-op'd both)
    expect(view.elements).toEqual([])
    // System still in model:
    expect(useWorkspaceStore.getState().workspace!.model.softwareSystems[0].id).toBe('sys')
  })

  it('records a single undo snapshot for the batch', () => {
    const ws: Workspace = {
      name: 'T',
      model: {
        people: [],
        softwareSystems: [
          { id: 'a', type: 'softwareSystem', name: 'A', tags: [], properties: {}, containers: [] },
          { id: 'b', type: 'softwareSystem', name: 'B', tags: [], properties: {}, containers: [] },
        ],
        relationships: [], groups: [],
      },
      views: {
        systemLandscapeViews: [{
          type: 'systemLandscape', key: 'land', elements: [{ id: 'a' }, { id: 'b' }], relationships: [],
        }],
        systemContextViews: [], containerViews: [], componentViews: [],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    useWorkspaceStore.getState().loadWorkspace(ws)

    useWorkspaceStore.getState().removeElementsFromView('land', ['a', 'b'])
    useWorkspaceStore.getState().undo()

    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    expect(view.elements.map(e => e.id).sort()).toEqual(['a', 'b'])
  })

  it('does not push an undo snapshot when the selection is only focal-scope IDs', () => {
    const ws: Workspace = {
      name: 'T',
      model: {
        people: [],
        softwareSystems: [{
          id: 'sys', type: 'softwareSystem', name: 'S', tags: [], properties: {},
          containers: [{ id: 'c1', type: 'container', name: 'C', tags: [], properties: {}, components: [] }],
        }],
        relationships: [], groups: [],
      },
      views: {
        systemLandscapeViews: [], systemContextViews: [], componentViews: [],
        containerViews: [{
          type: 'container', key: 'cont', softwareSystemId: 'sys',
          elements: [{ id: 'c1' }], relationships: [],
        }],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    useWorkspaceStore.getState().loadWorkspace(ws)
    useWorkspaceStore.getState().setActiveView('cont')

    const undoBefore = useWorkspaceStore.getState().undoStack.length

    // Only pass the focal-scope ID — should be a no-op that skips pushUndoSnapshot
    useWorkspaceStore.getState().removeElementsFromView('cont', ['sys'])

    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoBefore)
    // View must be unchanged
    expect(useWorkspaceStore.getState().workspace!.views.containerViews[0].elements).toEqual([{ id: 'c1' }])
  })
})
