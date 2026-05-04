import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'
import type { Person, SoftwareSystem, Container, Component } from '@/types/model'
import { announce } from '@/lib/announce'
import { nanoid, pushUndoSnapshot } from '../internals'
import {
  applyElementPatch,
  addToCurrentView,
  cascadeDeleteElements,
  duplicateElementsInTree,
  uniqueElementName,
  findViewHelper,
} from '../workspace-helpers'
import { getFirstViewKey } from '../workspace-selectors'

/** Element CRUD: add/update/delete/duplicate for people, systems, containers,
 *  and components. Each add* action also auto-includes the new element in the
 *  relevant peer views (system landscape views for people/systems, container
 *  views scoped to the same system for containers, etc.). */
export type ElementSlice = Pick<WorkspaceState,
  | 'addPerson' | 'addSoftwareSystem' | 'addContainer' | 'addComponent'
  | 'updateElement' | 'updateElementLive' | 'updateElementTechnology'
  | 'deleteElement' | 'deleteElements' | 'duplicateElements'
>

export const createElementSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  ElementSlice
> = (set, get) => ({
  addPerson: (name, position, location) => {
    const id = nanoid(8)
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      const ws = s.workspace
      const person: Person = { id, type: 'person', name: uniqueElementName(name, ws), tags: ['Element', 'Person'], properties: {}, location: location ?? 'Internal' }
      ws.model.people.push(person)
      addToCurrentView(ws, s.activeViewKey, id, position)
      // Auto-add to all system landscape views (they display every person/system)
      for (const v of ws.views.systemLandscapeViews) {
        if (v.key !== s.activeViewKey && !v.elements.some(e => e.id === id)) {
          v.elements.push({ id })
        }
      }
      s.focusElementId = id
      s.selectedElementIds = [id]
      s.selectedRelationshipId = null
      s.selectedGroupId = null
    })
    announce('Person created')
    return id
  },

  addSoftwareSystem: (name, position, location) => {
    const id = nanoid(8)
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      const ws = s.workspace
      const system: SoftwareSystem = { id, type: 'softwareSystem', name: uniqueElementName(name, ws), tags: ['Element', 'Software System'], properties: {}, containers: [], location: location ?? 'Internal' }
      ws.model.softwareSystems.push(system)
      addToCurrentView(ws, s.activeViewKey, id, position)
      for (const v of ws.views.systemLandscapeViews) {
        if (v.key !== s.activeViewKey && !v.elements.some(e => e.id === id)) {
          v.elements.push({ id })
        }
      }
      s.focusElementId = id
      s.selectedElementIds = [id]
      s.selectedRelationshipId = null
      s.selectedGroupId = null
    })
    get().revalidateScope()
    announce('System created')
    return id
  },

  addContainer: (systemId, name, position, extraTag) => {
    const id = nanoid(8)
    let added = false
    set((s) => {
      if (!s.workspace) return
      const ws = s.workspace
      const system = ws.model.softwareSystems.find(sys => sys.id === systemId)
      if (!system) return
      pushUndoSnapshot(s)
      const tags = extraTag ? ['Element', 'Container', extraTag] : ['Element', 'Container']
      const container: Container = { id, type: 'container', name: uniqueElementName(name, ws), tags, properties: {}, components: [] }
      system.containers.push(container)
      addToCurrentView(ws, s.activeViewKey, id, position)
      // Also auto-add to all other container views scoped to the same system
      for (const v of ws.views.containerViews) {
        if (v.softwareSystemId === systemId && v.key !== s.activeViewKey) {
          if (!v.elements.some(e => e.id === id)) v.elements.push({ id })
        }
      }
      s.focusElementId = id
      s.selectedElementIds = [id]
      s.selectedRelationshipId = null
      s.selectedGroupId = null
      added = true
    })
    if (added) {
      get().revalidateScope()
      announce('Container created')
    }
    return id
  },

  addComponent: (containerId, name, position) => {
    const id = nanoid(8)
    let added = false
    set((s) => {
      if (!s.workspace) return
      const ws = s.workspace
      for (const sys of ws.model.softwareSystems) {
        const container = sys.containers.find(c => c.id === containerId)
        if (!container) continue
        pushUndoSnapshot(s)
        const comp: Component = { id, type: 'component', name: uniqueElementName(name, ws), tags: ['Element', 'Component'], properties: {} }
        container.components.push(comp)
        addToCurrentView(ws, s.activeViewKey, id, position)
        // Also auto-add to all other component views scoped to the same container
        for (const v of ws.views.componentViews) {
          if (v.containerId === containerId && v.key !== s.activeViewKey) {
            if (!v.elements.some(e => e.id === id)) v.elements.push({ id })
          }
        }
        s.focusElementId = id
        s.selectedElementIds = [id]
        s.selectedRelationshipId = null
        s.selectedGroupId = null
        added = true
        return
      }
    })
    if (added) announce('Component created')
    return id
  },

  updateElement: (id, patch) => set((s) => {
    if (!s.workspace) return
    // applyElementPatch is no-op-safe; only push undo if something actually changed.
    if (!applyElementPatch(s.workspace, id, patch)) return
    pushUndoSnapshot(s)
  }),

  updateElementLive: (id, patch) => set((s) => {
    if (!s.workspace) return
    // Mutate the draft directly — Immer detects no-op patches and skips
    // state replacement when applyElementPatch reports no change. No undo push.
    applyElementPatch(s.workspace, id, patch)
  }),

  updateElementTechnology: (id, technology) => set((s) => {
    if (!s.workspace) return
    if (!applyElementPatch(s.workspace, id, { technology })) return
    pushUndoSnapshot(s)
  }),

  deleteElement: (id) => {
    // Delegate to batch implementation
    get().deleteElements([id])
  },

  deleteElements: (ids) => {
    if (ids.length === 0) return
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      cascadeDeleteElements(s.workspace, ids)
      // If the active view was among the ones just removed, fall back to the first remaining view.
      // Also purge stale keys from viewHistory so navigateBack never jumps to a ghost view.
      const activeStillExists = s.activeViewKey ? !!findViewHelper(s.workspace, s.activeViewKey) : false
      s.activeViewKey = activeStillExists ? s.activeViewKey : getFirstViewKey(s.workspace)
      s.viewHistory = s.viewHistory.filter(k => !!findViewHelper(s.workspace!, k))
      s.selectedElementIds = []
      s.selectedRelationshipId = null
      s.selectedGroupId = null
    })
    get().revalidateScope()
    announce(ids.length === 1 ? 'Element deleted' : `${ids.length} elements deleted`)
  },

  duplicateElements: (ids) => {
    let createdIds: string[] = []
    set((s) => {
      if (!s.workspace || !s.activeViewKey) return
      createdIds = duplicateElementsInTree(s.workspace, ids, s.activeViewKey, () => nanoid(8))
      if (createdIds.length === 0) return
      pushUndoSnapshot(s)
      s.selectedElementIds = createdIds
      s.selectedRelationshipId = null
      s.selectedGroupId = null
    })
    if (createdIds.length > 0) {
      announce(createdIds.length === 1 ? 'Element duplicated' : `${createdIds.length} elements duplicated`)
      get().revalidateScope()
    }
    return createdIds
  },
})
