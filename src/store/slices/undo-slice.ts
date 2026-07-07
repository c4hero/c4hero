import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'
import { announce } from '@/lib/announce'
import { validateScope } from '@/lib/scopeValidation'
import { undoSnapshot } from '../internals'
import { findViewHelper, clearSelectionDraft } from '../workspace-helpers'
import { getFirstViewKey } from '../workspace-selectors'

/** Undo / redo history. Other slices append snapshots to undoStack via
 *  pushUndoSnapshot; the actual stack mechanics live here. */
export type UndoSlice = Pick<WorkspaceState,
  | 'undoStack' | 'redoStack'
  | 'undo' | 'redo' | 'canUndo' | 'canRedo' | 'resetWorkspaceTo'
  | 'lastSavedUndoLength' | 'setLastSavedUndoLength'
>

export const createUndoSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  UndoSlice
> = (set, get) => ({
  undoStack: [],
  redoStack: [],
  lastSavedUndoLength: 0,

  setLastSavedUndoLength: (n) => set({ lastSavedUndoLength: n }),

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
      const activeStillExists = s.activeViewKey ? !!findViewHelper(previous, s.activeViewKey) : false
      s.activeViewKey = activeStillExists ? s.activeViewKey : getFirstViewKey(previous)
      s.viewHistory = s.viewHistory.filter(k => !!findViewHelper(previous, k))
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
      const activeStillExists = s.activeViewKey ? !!findViewHelper(next, s.activeViewKey) : false
      s.activeViewKey = activeStillExists ? s.activeViewKey : getFirstViewKey(next)
      s.viewHistory = s.viewHistory.filter(k => !!findViewHelper(next, k))
      s.selectedElementIds = []
      s.selectedRelationshipId = null
      s.selectedGroupId = null
      s.scopeViolations = validateScope(next)
    })
    announce('Redone')
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  resetWorkspaceTo: (ws) => set((s) => {
    // Wholesale workspace replacement with the same view/selection/scope fixups as
    // undo(), but WITHOUT touching the undo/redo stacks — the caller's batch owns
    // the single undo entry. Used by the AI sweep's replay-from-baseline revert.
    s.workspace = ws
    const activeStillExists = s.activeViewKey ? !!findViewHelper(ws, s.activeViewKey) : false
    s.activeViewKey = activeStillExists ? s.activeViewKey : getFirstViewKey(ws)
    s.viewHistory = s.viewHistory.filter(k => !!findViewHelper(ws, k))
    clearSelectionDraft(s)
    s.scopeViolations = validateScope(ws)
  }),
})
