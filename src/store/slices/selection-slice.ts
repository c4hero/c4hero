import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'

/** Selection state: which element(s), relationship, or group is currently
 *  highlighted in the canvas / inspector. Selecting any canvas object closes
 *  the Highlighter panel and the AI assistant so the Inspector doesn't stack
 *  underneath them. */
export type SelectionSlice = Pick<WorkspaceState,
  | 'selectedElementIds' | 'selectedRelationshipId' | 'selectedGroupId'
  | 'selectElements' | 'selectRelationship' | 'selectGroup' | 'clearSelection'
>

export const createSelectionSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  SelectionSlice
> = (set) => ({
  selectedElementIds: [],
  selectedRelationshipId: null,
  selectedGroupId: null,

  selectElements: (ids) => set((s) => {
    s.selectedElementIds = ids
    s.selectedRelationshipId = null
    s.selectedGroupId = null
    // Opening the inspector closes BOTH AI surfaces (panel + settings); App.tsx
    // renders the assistant whenever either flag is set, so closing only
    // aiPanelOpen would leave AI settings stacked over the inspector. EXCEPT
    // while the assistant is mid-flow (aiPanelBusy) — an interview even invites
    // you to click highlighted nodes — where closing it would discard the work;
    // there the panel stays and App suppresses the inspector behind it.
    if (ids.length > 0) { s.highlighterOpenFacet = null; if (!s.aiPanelBusy) { s.aiPanelOpen = false; s.aiSettingsOpen = false } }
  }),
  selectRelationship: (id) => set((s) => {
    s.selectedRelationshipId = id
    s.selectedElementIds = []
    s.selectedGroupId = null
    if (id) { s.highlighterOpenFacet = null; if (!s.aiPanelBusy) { s.aiPanelOpen = false; s.aiSettingsOpen = false } }
  }),
  selectGroup: (id) => set((s) => {
    s.selectedGroupId = id
    s.selectedElementIds = []
    s.selectedRelationshipId = null
    if (id) { s.highlighterOpenFacet = null; if (!s.aiPanelBusy) { s.aiPanelOpen = false; s.aiSettingsOpen = false } }
  }),
  clearSelection: () => set({ selectedElementIds: [], selectedRelationshipId: null, selectedGroupId: null }),
})
