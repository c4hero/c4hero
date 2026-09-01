import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'
import type { Person, SoftwareSystem, Container, Component, Workspace } from '@/types/model'
import { announce } from '@/lib/announce'
import { deriveIdFromName, uniqueDerivedId, validateElementId } from '@/lib/identifier'
import { nanoid, pushUndoSnapshot } from '../internals'
import {
  applyElementPatch,
  addToCurrentView,
  cascadeDeleteElements,
  collectTakenIds,
  duplicateElementsInTree,
  findElementHelper,
  renameElementId,
  uniqueElementName,
  findViewHelper,
  appendScopedView,
  selectCreated,
} from '../workspace-helpers'
import { getFirstViewKey } from '../workspace-selectors'

/** Derive a unique ID from a (already deduped) display name. */
function mintIdFor(ws: Workspace, name: string, excludeId?: string): string {
  const taken = collectTakenIds(ws)
  if (excludeId) taken.delete(excludeId)
  return uniqueDerivedId(deriveIdFromName(name), (id) => taken.has(id))
}

/** Swap an element's ID and patch the state-level references the workspace
 *  cascade can't reach (selection, active view key, view history). */
function applyElementIdRename(s: WorkspaceState, oldId: string, newId: string): void {
  const keyRenames = renameElementId(s.workspace!, oldId, newId)
  s.selectedElementIds = s.selectedElementIds.map(x => (x === oldId ? newId : x))
  if (keyRenames.length > 0) {
    const keyMap = new Map(keyRenames.map(k => [k.from, k.to]))
    if (s.activeViewKey && keyMap.has(s.activeViewKey)) s.activeViewKey = keyMap.get(s.activeViewKey)!
    s.viewHistory = s.viewHistory.map(k => keyMap.get(k) ?? k)
  }
}

/** Element CRUD: add/update/delete/duplicate for people, systems, containers,
 *  and components. Each add* action also auto-includes the new element in the
 *  relevant peer views (system landscape views for people/systems, container
 *  views scoped to the same system for containers, etc.). */
export type ElementSlice = Pick<WorkspaceState,
  | 'addPerson' | 'addSoftwareSystem' | 'addContainer' | 'addComponent'
  | 'updateElement' | 'updateElementLive' | 'updateElementTechnology'
  | 'updateElementId' | 'resyncElementId'
  | 'deleteElement' | 'deleteElements' | 'duplicateElements'
>

export const createElementSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  ElementSlice
> = (set, get) => ({
  addPerson: (name, position, location) => {
    let id = ''
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      const ws = s.workspace
      const finalName = uniqueElementName(name, ws)
      id = mintIdFor(ws, finalName)
      const person: Person = { id, type: 'person', idIsAuto: true, name: finalName, tags: ['Element', 'Person'], properties: {}, location: location ?? 'Internal' }
      ws.model.people.push(person)
      addToCurrentView(ws, s.activeViewKey, id, position, 'person')
      // Auto-add to all system landscape views (they display every person/system)
      for (const v of ws.views.systemLandscapeViews) {
        if (v.key !== s.activeViewKey && !v.elements.some(e => e.id === id)) {
          v.elements.push({ id })
        }
      }
      selectCreated(s, id)
    })
    announce('Person created')
    return id
  },

  addSoftwareSystem: (name, position, location) => {
    let id = ''
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      const ws = s.workspace
      const finalName = uniqueElementName(name, ws)
      id = mintIdFor(ws, finalName)
      const system: SoftwareSystem = { id, type: 'softwareSystem', idIsAuto: true, name: finalName, tags: ['Element', 'Software System'], properties: {}, containers: [], location: location ?? 'Internal' }
      ws.model.softwareSystems.push(system)
      addToCurrentView(ws, s.activeViewKey, id, position, 'softwareSystem')
      for (const v of ws.views.systemLandscapeViews) {
        if (v.key !== s.activeViewKey && !v.elements.some(e => e.id === id)) {
          v.elements.push({ id })
        }
      }
      selectCreated(s, id)
    })
    get().revalidateScope()
    announce('System created')
    return id
  },

  addContainer: (systemId, name, position, extraTag) => {
    let id = ''
    let added = false
    set((s) => {
      if (!s.workspace) return
      const ws = s.workspace
      const system = ws.model.softwareSystems.find(sys => sys.id === systemId)
      if (!system) return
      pushUndoSnapshot(s)
      const tags = extraTag ? ['Element', 'Container', extraTag] : ['Element', 'Container']
      const finalName = uniqueElementName(name, ws)
      id = mintIdFor(ws, finalName)
      const container: Container = { id, type: 'container', idIsAuto: true, name: finalName, tags, properties: {}, components: [] }
      system.containers.push(container)
      // A container belongs ONLY in its own system's container views — never in
      // the active view if that view is scoped to a different system (that would
      // render system B's container inside system A's view). Add it to every
      // container view scoped to THIS system (with the drop position on the
      // active one); if the system has no container view yet, create and switch
      // to one so the container isn't stranded invisibly. Matters for AI-applied
      // ops, which run regardless of the active view.
      let placed = false
      for (const v of ws.views.containerViews) {
        if (v.softwareSystemId !== systemId) continue
        if (!v.elements.some(e => e.id === id)) {
          v.elements.push(v.key === s.activeViewKey ? { id, x: position?.x, y: position?.y } : { id })
        }
        placed = true
      }
      if (!placed) {
        const vk = nanoid(8)
        appendScopedView(ws, 'container', systemId, `${system.name} — Containers`, vk)
        // During a batch AI apply, don't jump per-op — the panel navigates once
        // afterwards (focusViewForElements). For a single creation, switch to it.
        if (!s.batchApplying) s.activeViewKey = vk
      }
      selectCreated(s, id)
      added = true
    })
    if (added) {
      get().revalidateScope()
      announce('Container created')
    }
    return id
  },

  addComponent: (containerId, name, position) => {
    let id = ''
    let added = false
    set((s) => {
      if (!s.workspace) return
      const ws = s.workspace
      for (const sys of ws.model.softwareSystems) {
        const container = sys.containers.find(c => c.id === containerId)
        if (!container) continue
        pushUndoSnapshot(s)
        const finalName = uniqueElementName(name, ws)
        id = mintIdFor(ws, finalName)
        const comp: Component = { id, type: 'component', idIsAuto: true, name: finalName, tags: ['Element', 'Component'], properties: {} }
        container.components.push(comp)
        // A component belongs ONLY in its own container's component views (not in
        // a different container's active view). Add to every component view
        // scoped to THIS container (position on the active one); if none exists,
        // create + switch to one so it isn't stranded invisibly (see addContainer).
        let placed = false
        for (const v of ws.views.componentViews) {
          if (v.containerId !== containerId) continue
          if (!v.elements.some(e => e.id === id)) {
            v.elements.push(v.key === s.activeViewKey ? { id, x: position?.x, y: position?.y } : { id })
          }
          placed = true
        }
        if (!placed) {
          const vk = nanoid(8)
          appendScopedView(ws, 'component', containerId, `${container.name} — Components`, vk)
          if (!s.batchApplying) s.activeViewKey = vk
        }
        selectCreated(s, id)
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
    // While the ID is auto-derived, a committed rename re-derives it so the
    // exported DSL identifier keeps tracking the display name. Live typing
    // (updateElementLive) never does this — only the commit path.
    if (patch.name !== undefined) {
      const el = findElementHelper(s.workspace, id)
      if (el?.idIsAuto) {
        const newId = mintIdFor(s.workspace, el.name, id)
        if (newId !== id) applyElementIdRename(s, id, newId)
      }
    }
  }),

  updateElementId: (id, rawNewId) => {
    const newId = rawNewId.trim()
    if (newId === id) return null
    let error: string | null = null
    set((s) => {
      if (!s.workspace) return
      const el = findElementHelper(s.workspace, id)
      if (!el) return
      const taken = collectTakenIds(s.workspace)
      taken.delete(id)
      error = validateElementId(newId, (candidate) => taken.has(candidate))
      if (error) return
      pushUndoSnapshot(s)
      // A hand-set ID is pinned: renames stop re-deriving it.
      delete el.idIsAuto
      applyElementIdRename(s, id, newId)
    })
    if (!error) announce('Element ID updated')
    return error
  },

  resyncElementId: (id) => {
    set((s) => {
      if (!s.workspace) return
      const el = findElementHelper(s.workspace, id)
      if (!el) return
      const newId = mintIdFor(s.workspace, el.name, id)
      if (el.idIsAuto && newId === id) return
      pushUndoSnapshot(s)
      el.idIsAuto = true
      if (newId !== id) applyElementIdRename(s, id, newId)
    })
    announce('Element ID synced from name')
  },

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
      // freshId tracks its own mints: duplicateElementsInTree builds clones
      // before pushing them, so the workspace alone can't dedupe a batch.
      const taken = collectTakenIds(s.workspace)
      const freshId = (name?: string): string => {
        let candidate: string
        if (name !== undefined) {
          candidate = uniqueDerivedId(deriveIdFromName(name), (c) => taken.has(c))
        } else {
          candidate = nanoid(8)
          while (taken.has(candidate)) candidate = nanoid(8)
        }
        taken.add(candidate)
        return candidate
      }
      createdIds = duplicateElementsInTree(s.workspace, ids, s.activeViewKey, freshId)
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
