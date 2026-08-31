import type { StateCreator } from 'zustand'
import type { Workspace } from '@/types/model'
import type { WorkspaceState } from '../workspace-types'
import { validateScope } from '@/lib/scopeValidation'
import { parseDSL } from '@/lib/dsl'
import { checkModelIntegrity } from '@/lib/modelIntegrity'
import { pushUndoSnapshot } from '../internals'
import { normalizeWorkspaceShape, allViewsOf, findViewHelper, clearSelectionDraft } from '../workspace-helpers'
import { getFirstViewKey } from '../workspace-selectors'

/** Carry per-view element layout (x/y/pinned/locked) and view-level locks over
 *  from the previous workspace onto a freshly parsed one, matched by view key +
 *  element id. Positions never round-trip through DSL text — without this every
 *  code-pane apply would scramble the canvas. */
function carryOverViewLayout(prev: Workspace, next: Workspace): void {
  const prevViews = new Map(allViewsOf(prev).map((v) => [v.key, v]))
  for (const view of allViewsOf(next)) {
    const old = prevViews.get(view.key)
    if (!old) continue
    if (old.locked) view.locked = true
    const oldElements = new Map(old.elements.map((el) => [el.id, el]))
    for (const el of view.elements) {
      const oldEl = oldElements.get(el.id)
      if (!oldEl) continue
      if (oldEl.x !== undefined) el.x = oldEl.x
      if (oldEl.y !== undefined) el.y = oldEl.y
      if (oldEl.pinned) el.pinned = true
      if (oldEl.locked) el.locked = true
    }
  }
}

/** Workspace lifecycle: load / close / metadata / scope validation, plus
 *  the active filename used by folder-mode persistence. The workspace
 *  reference itself lives here as the single source of truth. */
export type LifecycleSlice = Pick<WorkspaceState,
  | 'workspace'
  | 'loadWorkspace' | 'closeWorkspace' | 'updateWorkspaceMeta'
  | 'replaceWorkspaceFromDSL'
  | 'scopeViolations' | 'revalidateScope'
  | 'activeWorkspaceFilename' | 'setActiveWorkspaceFilename'
>

export const createLifecycleSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  LifecycleSlice
> = (set, get) => ({
  workspace: null,
  scopeViolations: [],
  activeWorkspaceFilename: null,

  setActiveWorkspaceFilename: (name) => set({ activeWorkspaceFilename: name }),

  revalidateScope: () => set((s) => {
    s.scopeViolations = s.workspace ? validateScope(s.workspace) : []
  }),

  loadWorkspace: (workspace) => {
    // Files and snapshots written before dynamic/deployment views existed
    // lack those arrays; fill them before anything iterates VIEW_ARRAY_KEYS.
    normalizeWorkspaceShape(workspace)
    const firstView = getFirstViewKey(workspace)
    set({
      workspace,
      activeViewKey: firstView,
      viewHistory: [],
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
      focusElementId: null, // prevent stale scroll-to signal from a previous workspace
      // Close the assistant/settings so an open panel doesn't reopen off the
      // previous workspace when the next canvas mounts (App renders on these flags).
      aiPanelOpen: false,
      aiSettingsOpen: false,
      aiPanelFeature: null,
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
      lastClearedHighlightFilters: null,
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
      aiPanelOpen: false,
      aiSettingsOpen: false,
      aiPanelFeature: null,
      pendingDelete: null, // dismiss any in-flight delete confirmation dialog
      pendingZoomConfirm: null,
      createViewDefaults: null,
      undoStack: [],
      redoStack: [],
      lastClearedHighlightFilters: null,
      scopeViolations: [],
    }),

  replaceWorkspaceFromDSL: (text) => {
    if (!get().workspace) return { ok: false, errors: [{ message: 'No workspace open', line: 1, column: 1 }] }

    // Strict gate: parsing is lenient (returns a partial model alongside
    // errors), but a half-parsed model must never replace real work.
    const { workspace: parsed, errors } = parseDSL(text)
    if (errors.length > 0) return { ok: false, errors }

    normalizeWorkspaceShape(parsed)

    // The parser also accepts many half-typed documents (an unclosed
    // `workspace {`, even free text) as an error-free EMPTY model. Applying
    // that mid-keystroke would wipe the canvas — and autosave would write it
    // to disk. Refuse to empty a non-empty model from the code pane.
    const parsedEmpty = parsed.model.people.length === 0
      && parsed.model.softwareSystems.length === 0
      && parsed.model.deploymentEnvironments.length === 0
    const current = get().workspace!
    const currentNonEmpty = current.model.people.length > 0
      || current.model.softwareSystems.length > 0
      || current.model.deploymentEnvironments.length > 0
    if (parsedEmpty && currentNonEmpty) {
      return {
        ok: false,
        errors: [{
          message: 'This text parses to an empty model — not applied. Keep typing; the canvas updates once the model has elements again.',
          line: 1,
          column: 1,
        }],
      }
    }
    const violations = checkModelIntegrity(parsed)
    if (violations.length > 0) {
      return {
        ok: false,
        errors: violations.map((v) => ({ message: `Integrity: ${v.message}`, line: 1, column: 1 })),
      }
    }

    set((s) => {
      if (!s.workspace) return
      carryOverViewLayout(s.workspace, parsed)
      pushUndoSnapshot(s)
      s.workspace = parsed
      // Same fixups as undo(): the text edit may have deleted the active view,
      // history entries, or the selected element.
      const activeStillExists = s.activeViewKey ? !!findViewHelper(parsed, s.activeViewKey) : false
      s.activeViewKey = activeStillExists ? s.activeViewKey : getFirstViewKey(parsed)
      s.viewHistory = s.viewHistory.filter((k) => !!findViewHelper(parsed, k))
      clearSelectionDraft(s)
      s.scopeViolations = validateScope(parsed)
    })
    return { ok: true, errors: [] }
  },

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
})
