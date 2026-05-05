import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'

/** Highlighter filters: tag, status, technology, team — each is a multi-select
 *  string list with a per-dimension "any | all" combine mode. */
export type FilterSlice = Pick<WorkspaceState,
  | 'activeTagFilter' | 'activeStatusFilter' | 'activeTechFilter' | 'activeTeamFilter'
  | 'tagFilterMode' | 'statusFilterMode' | 'techFilterMode' | 'teamFilterMode'
  | 'lastClearedHighlightFilters'
  | 'setActiveTagFilter' | 'toggleActiveTagFilter'
  | 'setActiveStatusFilter' | 'toggleActiveStatusFilter'
  | 'setActiveTechFilter' | 'toggleActiveTechFilter'
  | 'setActiveTeamFilter' | 'toggleActiveTeamFilter'
  | 'clearAllHighlightFilters'
  | 'restoreHighlightFilters' | 'dismissClearedHighlightFiltersHint'
  | 'setTagFilterMode' | 'setStatusFilterMode' | 'setTechFilterMode' | 'setTeamFilterMode'
>

export const createFilterSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  FilterSlice
> = (set) => ({
  activeTagFilter: [],
  activeStatusFilter: [],
  activeTechFilter: [],
  activeTeamFilter: [],
  lastClearedHighlightFilters: null,
  tagFilterMode: 'any',
  statusFilterMode: 'any',
  techFilterMode: 'all',
  teamFilterMode: 'any',

  setActiveTagFilter: (tags) => set({ activeTagFilter: tags }),
  toggleActiveTagFilter: (tag) => set((s) => {
    const idx = s.activeTagFilter.indexOf(tag)
    if (idx >= 0) s.activeTagFilter.splice(idx, 1)
    else s.activeTagFilter.push(tag)
  }),
  setActiveStatusFilter: (statuses) => set({ activeStatusFilter: statuses }),
  toggleActiveStatusFilter: (status) => set((s) => {
    const idx = s.activeStatusFilter.indexOf(status)
    if (idx >= 0) s.activeStatusFilter.splice(idx, 1)
    else s.activeStatusFilter.push(status)
  }),
  setActiveTechFilter: (techs) => set({ activeTechFilter: techs }),
  toggleActiveTechFilter: (tech) => set((s) => {
    const idx = s.activeTechFilter.indexOf(tech)
    if (idx >= 0) s.activeTechFilter.splice(idx, 1)
    else s.activeTechFilter.push(tech)
  }),
  setActiveTeamFilter: (teams) => set({ activeTeamFilter: teams }),
  toggleActiveTeamFilter: (team) => set((s) => {
    const idx = s.activeTeamFilter.indexOf(team)
    if (idx >= 0) s.activeTeamFilter.splice(idx, 1)
    else s.activeTeamFilter.push(team)
  }),
  clearAllHighlightFilters: () => set({
    activeTagFilter: [],
    activeStatusFilter: [],
    activeTechFilter: [],
    activeTeamFilter: [],
    // Manual clear is intentional — drop any pending "restore from previous view" hint too.
    lastClearedHighlightFilters: null,
  }),

  restoreHighlightFilters: () => set((s) => {
    const stash = s.lastClearedHighlightFilters
    if (!stash) return
    s.activeTagFilter = stash.activeTagFilter
    s.activeStatusFilter = stash.activeStatusFilter
    s.activeTechFilter = stash.activeTechFilter
    s.activeTeamFilter = stash.activeTeamFilter
    s.lastClearedHighlightFilters = null
  }),

  dismissClearedHighlightFiltersHint: () => set({ lastClearedHighlightFilters: null }),

  setTagFilterMode: (mode) => set({ tagFilterMode: mode }),
  setStatusFilterMode: (mode) => set({ statusFilterMode: mode }),
  setTechFilterMode: (mode) => set({ techFilterMode: mode }),
  setTeamFilterMode: (mode) => set({ teamFilterMode: mode }),
})
