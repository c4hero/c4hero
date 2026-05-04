import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { current, isDraft, original } from 'immer'
import { customAlphabet } from 'nanoid'
import type { WorkspaceState } from './workspace-types'
import { MAX_UNDO } from './workspace-types'
import { createFilterSlice } from './slices/filter-slice'
import { createUiSlice } from './slices/ui-slice'
import { createSelectionSlice } from './slices/selection-slice'
import { createNavigationSlice } from './slices/navigation-slice'
export type { WorkspaceState, UndoState } from './workspace-types'

// IDs must be valid Structurizr DSL identifiers from the moment they are created
// so they survive a serialize → parse roundtrip without any sanitization:
//   - No hyphens: the serializer maps `-` → `_`, changing the ID.
//   - No leading digits: the serializer prepends `e` to digit-prefixed IDs,
//     changing them (e.g. `0abc1234` → var name `e0abc1234` → new ID `e0abc1234`).
// Using only letters guarantees IDs are always valid as-is.
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 8)
import type {
  Workspace, Relationship, View, Group,
  Person, SoftwareSystem, Container, Component,
} from '@/types/model'
import { announce } from '@/lib/announce'
import { validateScope } from '@/lib/scopeValidation'
import {
  allViewsOf,
  findViewHelper,
  forEachElementHelper,
  applyElementPatch,
  elementExists,
  VIEW_ARRAY_KEYS,
  forEachView,
  uniqueElementName,
  addToCurrentView,
  cascadeDeleteElements,
  duplicateElementsInTree,
  buildInitialViewContent,
} from './workspace-helpers'
export { allViewsOf } from './workspace-helpers'
export {
  getAllViews,
  getActiveView,
  buildElementMap,
  buildRelationshipMap,
  getSelectedElement,
  getRelationshipById,
  canDrillInto,
  getZoomTarget,
  getBreadcrumb,
  getCreatableTypes,
} from './workspace-selectors'
import { getFirstViewKey } from './workspace-selectors'

// ─── Built-in Tags ──────────────────────────────────────────────────

/** Tags that always exist and whose styles cannot be removed.
 *  'Relationship' is the built-in tag for all relationships and is
 *  included here so removeTagGlobal can't strip it from the model. */
export const BUILTIN_TAGS = new Set(['Element', 'Person', 'Software System', 'Container', 'Component', 'Relationship', 'Database'])

// State shape lives in workspace-types.ts so per-domain slices in ./slices/
// can import the type without circling back through this file.

// ─── Internal Helpers ────────────────────────────────────────────────

/** Resolve the pre-mutation workspace reference suitable for the undo stack.
 *  Inside an Immer producer, original(draft) returns the pre-produce ref —
 *  immutable, structurally shared with the next state. Outside a producer
 *  (e.g. test setState shortcuts), s.workspace is already a stable snapshot. */
function undoSnapshot(s: WorkspaceState): Workspace | null {
  if (!s.workspace) return null
  return isDraft(s.workspace) ? (original(s.workspace) as Workspace) : s.workspace
}

/** Append the pre-produce workspace snapshot to undoStack and clear redoStack
 *  in place. Safe to call before OR after mutations — original() always
 *  returns the pre-produce ref, so position within the producer doesn't
 *  matter. */
function pushUndoSnapshot(s: WorkspaceState): void {
  const snapshot = undoSnapshot(s)
  if (!snapshot) return
  s.undoStack.push(snapshot)
  // Trim to MAX_UNDO entries from the front (oldest first).
  if (s.undoStack.length > MAX_UNDO) s.undoStack.splice(0, s.undoStack.length - MAX_UNDO)
  s.redoStack.length = 0
}

// Re-alias imported helpers under the names used internally
const findView = findViewHelper
const forEachElement = forEachElementHelper

export const useWorkspaceStore = create<WorkspaceState>()(immer((set, get, store) => ({
  ...createFilterSlice(set, get, store),
  ...createUiSlice(set, get, store),
  ...createSelectionSlice(set, get, store),
  ...createNavigationSlice(set, get, store),
  workspace: null,
  lastSavedUndoLength: 0,
  setLastSavedUndoLength: (n) => set({ lastSavedUndoLength: n }),
  undoStack: [],
  redoStack: [],
  layoutVersion: 0,
  activeWorkspaceFilename: null,
  setActiveWorkspaceFilename: (name) => set({ activeWorkspaceFilename: name }),

  // ─── Scope Validation ───────────────────────────────────────────

  scopeViolations: [],
  revalidateScope: () => set((s) => {
    s.scopeViolations = s.workspace ? validateScope(s.workspace) : []
  }),

  // ─── Workspace Lifecycle ────────────────────────────────────────

  loadWorkspace: (workspace) => {
    const firstView = getFirstViewKey(workspace)
    set({
      workspace,
      activeViewKey: firstView,
      viewHistory: [],
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
      focusElementId: null, // prevent stale scroll-to signal from a previous workspace
      pendingDelete: null,  // dismiss any in-flight delete confirmation from a previous workspace
      pendingZoomConfirm: null,
      createViewDefaults: null,
      undoStack: [],
      redoStack: [],
      lastSavedUndoLength: 0, // reset so the save indicator doesn't inherit a stale saved position
      // Clear view filters so they don't bleed from a previous workspace
      activeTagFilter: [],
      activeStatusFilter: [],
      activeTechFilter: [],
      activeTeamFilter: [],
      scopeViolations: validateScope(workspace),
    })
  },

  closeWorkspace: () =>
    set({
      workspace: null,
      activeWorkspaceFilename: null,
      activeViewKey: null,
      viewHistory: [],
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
      focusElementId: null,
      pendingDelete: null, // dismiss any in-flight delete confirmation dialog
      pendingZoomConfirm: null,
      createViewDefaults: null,
      undoStack: [],
      redoStack: [],
      scopeViolations: [],
    }),

  updateWorkspaceMeta: (patch) => set((s) => {
    if (!s.workspace) return
    const ws = s.workspace
    const willChange =
      (patch.name !== undefined && ws.name !== patch.name) ||
      (patch.description !== undefined && ws.description !== patch.description)
    if (!willChange) return
    pushUndoSnapshot(s)
    if (patch.name !== undefined) ws.name = patch.name
    if (patch.description !== undefined) ws.description = patch.description
  }),

  // ─── Element CRUD ───────────────────────────────────────────────

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
    // Mutate first to detect no-op patches; only push undo if something changed.
    // applyElementPatch operates directly on the draft and is no-op-safe.
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
    useWorkspaceStore.getState().deleteElements([id])
  },

  deleteElements: (ids) => {
    if (ids.length === 0) return
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      cascadeDeleteElements(s.workspace, ids)
      // If the active view was among the ones just removed, fall back to the first remaining view.
      // Also purge stale keys from viewHistory so navigateBack never jumps to a ghost view.
      const activeStillExists = s.activeViewKey ? !!findView(s.workspace, s.activeViewKey) : false
      s.activeViewKey = activeStillExists ? s.activeViewKey : getFirstViewKey(s.workspace)
      s.viewHistory = s.viewHistory.filter(k => !!findView(s.workspace!, k))
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

  // ─── Group CRUD ─────────────────────────────────────────────────

  addGroup: (name, elementIds = []) => {
    const id = nanoid(8)
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      const group: Group = { id, name, elementIds }
      s.workspace.model.groups.push(group)
    })
    return id
  },

  updateGroup: (id, patch) => set((s) => {
    if (!s.workspace) return
    const group = s.workspace.model.groups.find(g => g.id === id)
    if (!group) return
    let changed = false
    if (patch.name !== undefined && group.name !== patch.name) { group.name = patch.name; changed = true }
    if (patch.elementIds !== undefined) { group.elementIds = patch.elementIds; changed = true } // array, always treat as a change
    if (!changed) return
    pushUndoSnapshot(s)
  }),

  deleteGroup: (id) => set((s) => {
    if (!s.workspace) return
    if (!s.workspace.model.groups.some(g => g.id === id)) return
    pushUndoSnapshot(s)
    s.workspace.model.groups = s.workspace.model.groups.filter(g => g.id !== id)
    if (s.selectedGroupId === id) s.selectedGroupId = null
  }),

  // ─── Relationship CRUD ──────────────────────────────────────────

  addRelationship: (sourceId, destinationId, description, technology) => {
    const id = nanoid(8)
    let created = false
    set((s) => {
      if (!s.workspace) return
      if (sourceId === destinationId) return
      const ws = s.workspace
      if (!elementExists(ws, sourceId) || !elementExists(ws, destinationId)) return
      pushUndoSnapshot(s)
      const rel: Relationship = {
        id,
        sourceId,
        destinationId,
        description,
        technology,
        tags: ['Relationship'],
        properties: {},
      }
      ws.model.relationships.push(rel)
      created = true
      // For systemContext views: if one endpoint is the scoped system, auto-add
      // the other endpoint (external actor) to the view so the context diagram stays
      // consistent — a person/system related to the scope should appear in its context view.
      for (const v of ws.views.systemContextViews) {
        if (!v.softwareSystemId) continue
        const scopeId = v.softwareSystemId
        const sourceIsScope = sourceId === scopeId
        const destIsScope = destinationId === scopeId
        if (sourceIsScope || destIsScope) {
          const actorId = sourceIsScope ? destinationId : sourceId
          if (!v.elements.some(e => e.id === actorId)) {
            v.elements.push({ id: actorId })
          }
        }
      }
      // Add relationship ref to every view that now has both endpoints
      for (const view of allViewsOf(ws)) {
        const viewElIds = new Set(view.elements.map(e => e.id))
        if (viewElIds.has(sourceId) && viewElIds.has(destinationId)) {
          if (!view.relationships.some(r => r.id === id)) {
            view.relationships.push({ id })
          }
        }
      }
      s.selectedRelationshipId = id
      s.selectedElementIds = []
      s.selectedGroupId = null
    })
    return created ? id : ''
  },

  updateRelationship: (id, patch) => set((s) => {
    if (!s.workspace) return
    const rel = s.workspace.model.relationships.find(r => r.id === id)
    if (!rel) return
    // Use 'key in patch' for optional fields that the UI may legitimately clear by passing
    // undefined (e.g. empty text field → { description: undefined }).  This mirrors the same
    // pattern used in applyElementPatch.
    // No-op guard: only push undo if at least one field actually changes.
    let changed = false
    if ('description' in patch && rel.description !== patch.description) { rel.description = patch.description; changed = true }
    if ('technology' in patch && rel.technology !== patch.technology) { rel.technology = patch.technology; changed = true }
    if ('interactionStyle' in patch && rel.interactionStyle !== patch.interactionStyle) { rel.interactionStyle = patch.interactionStyle; changed = true }
    if ('lineStyle' in patch && rel.lineStyle !== patch.lineStyle) { rel.lineStyle = patch.lineStyle; changed = true }
    if ('url' in patch && rel.url !== patch.url) { rel.url = patch.url; changed = true }
    if (patch.tags !== undefined) {
      const tagsChanged = patch.tags.length !== rel.tags.length || patch.tags.some((t, i) => t !== rel.tags[i])
      if (tagsChanged) { rel.tags = patch.tags; changed = true }
    }
    if (!changed) return
    pushUndoSnapshot(s)
  }),

  reconnectRelationship: (id, newSourceId, newTargetId) => set((s) => {
    if (!s.workspace) return
    const ws = s.workspace
    const rel = ws.model.relationships.find(r => r.id === id)
    if (!rel) return
    if (rel.sourceId === newSourceId && rel.destinationId === newTargetId) return
    if (newSourceId === newTargetId) return
    if (!elementExists(ws, newSourceId) || !elementExists(ws, newTargetId)) return
    pushUndoSnapshot(s)
    rel.sourceId = newSourceId
    rel.destinationId = newTargetId

    // Mirror addRelationship semantics for system context views: when one endpoint
    // is the scoped system, ensure the other endpoint is visible so the context
    // diagram still expresses the relationship after reconnecting.
    for (const v of ws.views.systemContextViews) {
      if (!v.softwareSystemId) continue
      const scopeId = v.softwareSystemId
      const sourceIsScope = newSourceId === scopeId
      const destIsScope = newTargetId === scopeId
      if (sourceIsScope || destIsScope) {
        const actorId = sourceIsScope ? newTargetId : newSourceId
        if (!v.elements.some(e => e.id === actorId)) {
          v.elements.push({ id: actorId })
        }
      }
    }

    // Sync view.relationships: keep only in views where both new endpoints exist
    forEachView(ws, (v) => {
      const elIds = new Set(v.elements.map(e => e.id))
      const hasRel = v.relationships.some(r => r.id === id)
      const bothPresent = elIds.has(newSourceId) && elIds.has(newTargetId)
      if (hasRel && !bothPresent) {
        v.relationships = v.relationships.filter(r => r.id !== id)
      } else if (!hasRel && bothPresent) {
        v.relationships.push({ id })
      }
    })
  }),

  deleteRelationship: (id) => set((s) => {
    if (!s.workspace) return
    const ws = s.workspace
    if (!ws.model.relationships.some(r => r.id === id)) return
    pushUndoSnapshot(s)
    ws.model.relationships = ws.model.relationships.filter(r => r.id !== id)
    // Remove from all views
    forEachView(ws, (v) => {
      v.relationships = v.relationships.filter(r => r.id !== id)
    })
    if (s.selectedRelationshipId === id) s.selectedRelationshipId = null
  }),

  // ─── View Management ────────────────────────────────────────────

  addView: (type, scopeId, title) => {
    const key = nanoid(8)
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      const ws = s.workspace
      const { elements, relationships } = buildInitialViewContent(ws.model, type, scopeId)
      const view: View = {
        type,
        key,
        title: title ?? `New ${type} view`,
        elements,
        relationships,
        autoLayout: { direction: 'TB' },
        softwareSystemId: (type === 'systemContext' || type === 'container') ? scopeId : undefined,
        containerId: type === 'component' ? scopeId : undefined,
      }
      switch (type) {
        case 'systemLandscape': ws.views.systemLandscapeViews.push(view); break
        case 'systemContext': ws.views.systemContextViews.push(view); break
        case 'container': ws.views.containerViews.push(view); break
        case 'component': ws.views.componentViews.push(view); break
      }
      s.activeViewKey = key
      s.selectedElementIds = []
      s.selectedRelationshipId = null
      s.selectedGroupId = null
    })
    return key
  },

  deleteView: (key) => set((s) => {
    if (!s.workspace) return
    const ws = s.workspace
    // Find which array contains the key and only filter that one
    let found = false
    for (const arrKey of VIEW_ARRAY_KEYS) {
      const idx = ws.views[arrKey].findIndex(v => v.key === key)
      if (idx !== -1) {
        pushUndoSnapshot(s)
        ws.views[arrKey].splice(idx, 1)
        found = true
        break
      }
    }
    if (!found) return
    const switchingViews = s.activeViewKey === key
    if (switchingViews) {
      s.activeViewKey = getFirstViewKey(ws)
      s.selectedElementIds = []
      s.selectedRelationshipId = null
      s.selectedGroupId = null
    }
    s.viewHistory = s.viewHistory.filter(k => k !== key)
  }),

  renameView: (key, title) => set((s) => {
    if (!s.workspace) return
    const ws = s.workspace
    for (const arrKey of VIEW_ARRAY_KEYS) {
      const v = ws.views[arrKey].find(v => v.key === key)
      if (v) {
        if (v.title === title) return // no-op: title unchanged
        pushUndoSnapshot(s)
        v.title = title
        return
      }
    }
  }),

  duplicateView: (key) => {
    const newKey = nanoid(8)
    set((s) => {
      if (!s.workspace) return
      const ws = s.workspace
      for (const arrKey of VIEW_ARRAY_KEYS) {
        const src = ws.views[arrKey].find(v => v.key === key)
        if (!src) continue
        pushUndoSnapshot(s)
        // Deep-copy via current() unwrap so the clone is fully detached from
        // any existing view's draft sub-objects.
        const detached = current(src) as View
        const copy: View = {
          ...structuredClone(detached),
          key: newKey,
          title: `${src.title ?? 'View'} copy`,
        }
        ws.views[arrKey].push(copy)
        s.activeViewKey = newKey
        s.selectedElementIds = []
        s.selectedRelationshipId = null
        s.selectedGroupId = null
        return
      }
    })
    return newKey
  },

  updateNodePosition: (nodeId, x, y) => set((s) => {
    if (!s.workspace || !s.activeViewKey) return
    for (const key of VIEW_ARRAY_KEYS) {
      const view = s.workspace.views[key].find(v => v.key === s.activeViewKey)
      if (!view) continue
      const el = view.elements.find(e => e.id === nodeId)
      if (!el) return
      el.x = x
      el.y = y
      el.pinned = true
      return
    }
    // Don't push undo for every drag position — too noisy
  }),

  updateNodePositions: (updates) => set((s) => {
    if (!s.workspace || !s.activeViewKey) return
    const updateMap = new Map(updates.map(u => [u.id, u]))
    for (const key of VIEW_ARRAY_KEYS) {
      const view = s.workspace.views[key].find(v => v.key === s.activeViewKey)
      if (!view) continue
      for (const el of view.elements) {
        const u = updateMap.get(el.id)
        if (!u) continue
        el.x = u.x
        el.y = u.y
        el.pinned = true
      }
      return
    }
  }),

  syncAutoLayoutPositions: (viewKey, updates) => set((s) => {
    if (!s.workspace || updates.size === 0) return
    for (const key of VIEW_ARRAY_KEYS) {
      const view = s.workspace.views[key].find(v => v.key === viewKey)
      if (!view) continue
      for (const el of view.elements) {
        // Only fill in missing positions; never override saved ones (those
        // came from a drag, a load, or a prior sync).
        if (el.x !== undefined && el.y !== undefined) continue
        const u = updates.get(el.id)
        if (!u) continue
        el.x = u.x
        el.y = u.y
      }
      return
    }
  }),

  // ─── Undo / Redo ───────────────────────────────────────────────

  undo: () => {
    set((s) => {
      if (s.undoStack.length === 0 || !s.workspace) return
      // Capture the pre-produce (= current) workspace ref for the redo stack.
      // original() avoids deep-copying — it's the same immutable ref that
      // shares structure with whatever this undo replaces.
      const currentWs = undoSnapshot(s)!
      const previous = s.undoStack.pop()!
      s.redoStack.push(currentWs)
      // Replace the draft's workspace with the popped snapshot. Immer treats
      // a wholesale property replacement just fine — the new state has
      // workspace === previous (a frozen plain object from the stack).
      s.workspace = previous
      const activeStillExists = s.activeViewKey ? !!findView(previous, s.activeViewKey) : false
      s.activeViewKey = activeStillExists ? s.activeViewKey : getFirstViewKey(previous)
      s.viewHistory = s.viewHistory.filter(k => !!findView(previous, k))
      s.selectedElementIds = []
      s.selectedRelationshipId = null
      s.selectedGroupId = null
      s.scopeViolations = validateScope(previous)
    })
    announce('Undone')
  },

  redo: () => {
    set((s) => {
      if (s.redoStack.length === 0 || !s.workspace) return
      const currentWs = undoSnapshot(s)!
      const next = s.redoStack.pop()!
      s.undoStack.push(currentWs)
      s.workspace = next
      const activeStillExists = s.activeViewKey ? !!findView(next, s.activeViewKey) : false
      s.activeViewKey = activeStillExists ? s.activeViewKey : getFirstViewKey(next)
      s.viewHistory = s.viewHistory.filter(k => !!findView(next, k))
      s.selectedElementIds = []
      s.selectedRelationshipId = null
      s.selectedGroupId = null
      s.scopeViolations = validateScope(next)
    })
    announce('Redone')
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  // ─── View Element Management ────────────────────────────────────

  toggleElementInView: (viewKey, elementId) => set((s) => {
    if (!s.workspace) return
    const ws = s.workspace
    const view = findView(ws, viewKey)
    if (!view) return
    const idx = view.elements.findIndex(e => e.id === elementId)
    pushUndoSnapshot(s)
    if (idx >= 0) {
      view.elements.splice(idx, 1)
      // Also remove relationships that reference this element
      view.relationships = view.relationships.filter(r => {
        const rel = ws.model.relationships.find(mr => mr.id === r.id)
        if (!rel) return false
        return rel.sourceId !== elementId && rel.destinationId !== elementId
      })
    } else {
      // Capture IDs already in the view BEFORE adding the new element
      const existingElementIds = new Set(view.elements.map(e => e.id))
      view.elements.push({ id: elementId })
      // Auto-add any model relationships that connect the new element to elements
      // already present in the view (avoids forcing the user to re-draw connections)
      const existingRelIds = new Set(view.relationships.map(r => r.id))
      for (const rel of ws.model.relationships) {
        if (existingRelIds.has(rel.id)) continue
        const linksNewEl =
          (rel.sourceId === elementId && existingElementIds.has(rel.destinationId)) ||
          (rel.destinationId === elementId && existingElementIds.has(rel.sourceId))
        if (linksNewEl) {
          view.relationships.push({ id: rel.id })
          existingRelIds.add(rel.id)
        }
      }
    }
  }),

  setLayoutDirection: (viewKey, direction) => set((s) => {
    if (!s.workspace) return
    const view = findView(s.workspace, viewKey)
    if (!view) return
    pushUndoSnapshot(s)
    view.autoLayout = { ...view.autoLayout, direction }
    // Reset positions and pinned flags to trigger full re-layout
    for (const el of view.elements) {
      el.x = undefined
      el.y = undefined
      el.pinned = undefined
    }
    s.layoutVersion += 1
  }),

  resetAndRelayout: (viewKey, direction) => set((s) => {
    if (!s.workspace) return
    const view = findView(s.workspace, viewKey)
    if (!view) return
    pushUndoSnapshot(s)
    // Reset positions and pinned flags
    for (const el of view.elements) {
      el.x = undefined
      el.y = undefined
      el.pinned = undefined
    }
    // Optionally change direction
    if (direction) {
      view.autoLayout = { ...view.autoLayout, direction }
    }
    s.layoutVersion += 1
  }),

  // ─── Canvas Settings ──────────────────────────────────────────

  updateElementStyle: (style) => set((s) => {
    if (!s.workspace) return
    const styles = s.workspace.views.configuration.styles.elements
    const idx = styles.findIndex((es) => es.tag === style.tag)
    if (idx >= 0) {
      // No-op guard: if every incoming field already matches, skip the undo push
      const existing = styles[idx]
      const keys = Object.keys(style) as (keyof typeof style)[]
      const changed = keys.some(k => k !== 'tag' && style[k] !== existing[k])
      if (!changed) return
      pushUndoSnapshot(s)
      styles[idx] = { ...existing, ...style }
    } else {
      pushUndoSnapshot(s)
      styles.push(style)
    }
  }),
  removeElementStyle: (tag) => set((s) => {
    // Built-in tag styles CAN be removed — the theme provides the fallback.
    if (!s.workspace) return
    const styles = s.workspace.views.configuration.styles.elements
    if (!styles.some((es) => es.tag === tag)) return
    pushUndoSnapshot(s)
    s.workspace.views.configuration.styles.elements = styles.filter((es) => es.tag !== tag)
  }),
  renameTag: (oldTag, newTag) => set((s) => {
    if (!newTag.trim() || oldTag === newTag) return
    if (BUILTIN_TAGS.has(oldTag)) return // Built-in tags cannot be renamed
    if (BUILTIN_TAGS.has(newTag.trim())) return // Cannot rename a custom tag to a built-in name
    if (!s.workspace) return
    const ws = s.workspace
    // Quick existence check before doing any mutation
    let exists = ws.views.configuration.styles.elements.some(es => es.tag === oldTag)
      || ws.views.configuration.styles.relationships.some(rs => rs.tag === oldTag)
      || ws.model.relationships.some(r => r.tags.includes(oldTag))
    if (!exists) forEachElement(ws, (el) => { if (el.tags.includes(oldTag)) { exists = true; return true } })
    if (!exists) return
    pushUndoSnapshot(s)
    forEachElement(ws, (el) => { el.tags = el.tags.map(t => t === oldTag ? newTag : t) })
    for (const rel of ws.model.relationships) { rel.tags = rel.tags.map(t => t === oldTag ? newTag : t) }
    const elStyle = ws.views.configuration.styles.elements.find(es => es.tag === oldTag)
    if (elStyle) elStyle.tag = newTag
    const relStyle = ws.views.configuration.styles.relationships.find(rs => rs.tag === oldTag)
    if (relStyle) relStyle.tag = newTag
    s.activeTagFilter = s.activeTagFilter.map((t) => (t === oldTag ? newTag : t))
  }),

  removeTagGlobal: (tag) => set((s) => {
    if (BUILTIN_TAGS.has(tag)) return // Built-in tags cannot be removed
    if (!s.workspace) return
    const ws = s.workspace
    let exists = ws.views.configuration.styles.elements.some(es => es.tag === tag)
      || ws.views.configuration.styles.relationships.some(rs => rs.tag === tag)
      || ws.model.relationships.some(r => r.tags.includes(tag))
    if (!exists) forEachElement(ws, (el) => { if (el.tags.includes(tag)) { exists = true; return true } })
    if (!exists) return
    pushUndoSnapshot(s)
    forEachElement(ws, (el) => { el.tags = el.tags.filter(t => t !== tag) })
    for (const rel of ws.model.relationships) { rel.tags = rel.tags.filter(t => t !== tag) }
    ws.views.configuration.styles.elements = ws.views.configuration.styles.elements.filter(es => es.tag !== tag)
    ws.views.configuration.styles.relationships = ws.views.configuration.styles.relationships.filter(rs => rs.tag !== tag)
    s.activeTagFilter = s.activeTagFilter.filter((t) => t !== tag)
  }),

})))
