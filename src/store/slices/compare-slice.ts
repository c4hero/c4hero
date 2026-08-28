import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'

/** Revision comparison: the base (compared-against) workspace plus the two
 *  surfaces that render its diff — the change panel and the canvas overlay.
 *
 *  Only the *base* revision is stored. The diff itself is derived from
 *  (base, current workspace) at render time via `diffWorkspacesCached`, so it
 *  stays live: every edit the user makes updates the change list and the canvas
 *  tint immediately, with no stale-diff state to invalidate.
 *
 *  The base workspace is read-only. It is assigned through the object form of
 *  `set` rather than an immer recipe so it is never deep-frozen or drafted —
 *  it is a plain parsed snapshot, not part of the editable model. */
export type CompareSlice = Pick<WorkspaceState,
  | 'comparisonBase' | 'comparisonLabel' | 'comparisonPanelOpen' | 'comparisonOverlay'
  | 'startComparison' | 'clearComparison'
  | 'setComparisonPanelOpen' | 'setComparisonOverlay'
>

export const createCompareSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  CompareSlice
> = (set) => ({
  comparisonBase: null,
  comparisonLabel: null,
  comparisonPanelOpen: false,
  comparisonOverlay: true,

  startComparison: (base, label) => set({
    comparisonBase: base,
    comparisonLabel: label,
    comparisonOverlay: true,
    comparisonPanelOpen: true,
    commandPaletteOpen: false,
  }),

  clearComparison: () => set({
    comparisonBase: null,
    comparisonLabel: null,
    comparisonPanelOpen: false,
    comparisonOverlay: true,
  }),

  setComparisonPanelOpen: (open) => set({ comparisonPanelOpen: open, commandPaletteOpen: false }),
  setComparisonOverlay: (on) => set({ comparisonOverlay: on }),
})
