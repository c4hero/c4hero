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
