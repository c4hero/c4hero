import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { current } from 'immer'
import type { View } from '@/types/model'
import type { WorkspaceState } from './workspace-types'
import { nanoid, pushUndoSnapshot, undoSnapshot } from './internals'
import { createFilterSlice } from './slices/filter-slice'
import { createUiSlice } from './slices/ui-slice'
import { createSelectionSlice } from './slices/selection-slice'
import { createNavigationSlice } from './slices/navigation-slice'
import { createElementSlice } from './slices/element-slice'
import { createGroupSlice } from './slices/group-slice'
import { createRelationshipSlice } from './slices/relationship-slice'
import { announce } from '@/lib/announce'
import { validateScope } from '@/lib/scopeValidation'
export type { WorkspaceState, UndoState } from './workspace-types'
import {
  findViewHelper,
  forEachElementHelper,
  VIEW_ARRAY_KEYS,
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

// State shape lives in workspace-types.ts; nanoid + undo helpers live in
// internals.ts so per-domain slices in ./slices/ can use both without
// circular imports.

// Re-alias imported helpers under the names used internally
const findView = findViewHelper
const forEachElement = forEachElementHelper

export const useWorkspaceStore = create<WorkspaceState>()(immer((set, get, store) => ({
  ...createFilterSlice(set, get, store),
  ...createUiSlice(set, get, store),
  ...createSelectionSlice(set, get, store),
  ...createNavigationSlice(set, get, store),
  ...createElementSlice(set, get, store),
  ...createGroupSlice(set, get, store),
  ...createRelationshipSlice(set, get, store),
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
