import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'
import { validateScope } from '@/lib/scopeValidation'
import { pushUndoSnapshot } from '../internals'
import { getFirstViewKey } from '../workspace-selectors'

/** Workspace lifecycle: load / close / metadata / scope validation, plus
 *  the active filename used by folder-mode persistence. The workspace
 *  reference itself lives here as the single source of truth. */
export type LifecycleSlice = Pick<WorkspaceState,
  | 'workspace'
  | 'loadWorkspace' | 'closeWorkspace' | 'updateWorkspaceMeta'
  | 'scopeViolations' | 'revalidateScope'
  | 'activeWorkspaceFilename' | 'setActiveWorkspaceFilename'
>

export const createLifecycleSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  LifecycleSlice
> = (set) => ({
  workspace: null,
  scopeViolations: [],
  activeWorkspaceFilename: null,

  setActiveWorkspaceFilename: (name) => set({ activeWorkspaceFilename: name }),

  revalidateScope: () => set((s) => {
    s.scopeViolations = s.workspace ? validateScope(s.workspace) : []
  }),

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
