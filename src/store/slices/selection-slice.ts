import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'

/** Selection state: which element(s), relationship, or group is currently
 *  highlighted in the canvas / inspector. Selecting any canvas object closes
 *  the Highlighter panel so the Inspector doesn't stack underneath it. */
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
    if (ids.length > 0) s.highlighterOpenFacet = null
  }),
  selectRelationship: (id) => set((s) => {
    s.selectedRelationshipId = id
    s.selectedElementIds = []
    s.selectedGroupId = null
    if (id) s.highlighterOpenFacet = null
  }),
  selectGroup: (id) => set((s) => {
    s.selectedGroupId = id
    s.selectedElementIds = []
    s.selectedRelationshipId = null
    if (id) s.highlighterOpenFacet = null
  }),
  clearSelection: () => set({ selectedElementIds: [], selectedRelationshipId: null, selectedGroupId: null }),
})
