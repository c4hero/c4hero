import type { StateCreator } from 'zustand'
import { current } from 'immer'
import type { WorkspaceState } from '../workspace-types'
import type { View } from '@/types/model'
import { nanoid, pushUndoSnapshot } from '../internals'
import { findViewHelper, VIEW_ARRAY_KEYS, appendScopedView } from '../workspace-helpers'
import { getFirstViewKey, getFocalScopeId } from '../workspace-selectors'

/** View management: create / delete / rename / duplicate views, plus the
 *  per-view body actions (toggle element membership, layout direction,
 *  reset+relayout, drag-position updates, auto-layout sync) and the
 *  layoutVersion epoch. */
export type ViewSlice = Pick<WorkspaceState,
  | 'addView' | 'deleteView' | 'renameView' | 'duplicateView'
  | 'toggleElementInView' | 'removeElementsFromView' | 'setLayoutDirection' | 'resetAndRelayout'
  | 'updateNodePosition' | 'updateNodePositions' | 'syncAutoLayoutPositions'
  | 'layoutVersion'
>

export const createViewSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  ViewSlice
> = (set) => ({
  layoutVersion: 0,

  addView: (type, scopeId, title) => {
    const key = nanoid(8)
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      appendScopedView(s.workspace, type, scopeId, title ?? `New ${type} view`, key)
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

  removeElementsFromView: (viewKey, ids) => set((s) => {
    if (!s.workspace) return
    if (ids.length === 0) return
    const ws = s.workspace
    const view = findViewHelper(ws, viewKey)
    if (!view) return

    // Defense in depth: never remove the focal scope element from its own view.
    // The keymap layer should already filter these out, but the helper guards
    // again so future callers can't accidentally bypass the rule.
    const focalId = getFocalScopeId(view)
    const removable = new Set(ids.filter((id) => id !== focalId))
    if (removable.size === 0) return

    pushUndoSnapshot(s)
    view.elements = view.elements.filter((e) => !removable.has(e.id))
    view.relationships = view.relationships.filter((r) => {
      const rel = ws.model.relationships.find((mr) => mr.id === r.id)
      if (!rel) return false
      return !removable.has(rel.sourceId) && !removable.has(rel.destinationId)
    })
  }),

  toggleElementInView: (viewKey, elementId) => set((s) => {
    if (!s.workspace) return
    const ws = s.workspace
    const view = findViewHelper(ws, viewKey)
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
    const view = findViewHelper(s.workspace, viewKey)
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
    const view = findViewHelper(s.workspace, viewKey)
    if (!view) return
    pushUndoSnapshot(s)
    for (const el of view.elements) {
      el.x = undefined
      el.y = undefined
      el.pinned = undefined
    }
    if (direction) {
      view.autoLayout = { ...view.autoLayout, direction }
    }
    s.layoutVersion += 1
  }),
})
