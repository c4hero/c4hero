import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'
import { findChildViewHelper as findChildView, getZoomTarget } from '../workspace-selectors'
import { clearSelectionDraft } from '../workspace-helpers'
import { announce } from '@/lib/announce'

/** If any Highlighter filter is non-empty, snapshot all four into
 *  `lastClearedHighlightFilters` and clear the active filters. Idempotent
 *  when filters are empty (preserves any pre-existing stash). Modes are
 *  preferences and are intentionally NOT touched. */
function clearHighlightFiltersWithStash(s: WorkspaceState): boolean {
  const hasActive =
    s.activeTagFilter.length > 0 ||
    s.activeStatusFilter.length > 0 ||
    s.activeTechFilter.length > 0 ||
    s.activeTeamFilter.length > 0
  if (!hasActive) return false
  s.lastClearedHighlightFilters = {
    activeTagFilter: [...s.activeTagFilter],
    activeStatusFilter: [...s.activeStatusFilter],
    activeTechFilter: [...s.activeTechFilter],
    activeTeamFilter: [...s.activeTeamFilter],
  }
  s.activeTagFilter = []
  s.activeStatusFilter = []
  s.activeTechFilter = []
  s.activeTeamFilter = []
  return true
}

/** Navigation state: which view is active, the breadcrumb history, the
 *  pending zoom-confirm prompt, and a transient focusElementId that the
 *  canvas consumes to pan to a freshly-created element. */
export type NavigationSlice = Pick<WorkspaceState,
  | 'activeViewKey' | 'viewHistory'
  | 'pendingZoomConfirm' | 'createViewDefaults'
  | 'focusElementId' | 'clearFocusElement'
  | 'setActiveView' | 'drillInto' | 'zoomInto'
  | 'confirmZoomCreate' | 'cancelZoomConfirm' | 'openCreateViewFromZoom'
  | 'setCreateViewDefaults' | 'navigateBack' | 'focusViewForElements'
>

export const createNavigationSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  NavigationSlice
> = (set, get) => ({
  activeViewKey: null,
  viewHistory: [],
  pendingZoomConfirm: null,
  createViewDefaults: null,
  focusElementId: null,

  clearFocusElement: () => set({ focusElementId: null }),

  // After a batch (AI) apply that suppressed per-op view switching, navigate
  // ONCE to the view that best shows the newly-created elements. Prefer DEPTH:
  // the most specific view tier (component > container > context > landscape)
  // that contains any new element wins, tie-broken by count within the tier.
  // (A plain max-count would bias to landscape/context, which accumulate every
  // new system+person, so "add a container/component" would land you on a
  // high-level diagram instead of the deep elements you just created.)
  focusViewForElements: (ids) => set((s) => {
    if (!s.workspace || ids.length === 0) return
    const idSet = new Set(ids)
    const tiers = [
      s.workspace.views.componentViews,
      s.workspace.views.containerViews,
      s.workspace.views.systemContextViews,
      s.workspace.views.systemLandscapeViews,
    ]
    let best: string | null = null
    for (const tier of tiers) {
      let bestCount = 0
      for (const v of tier) {
        const count = v.elements.reduce((n, e) => n + (idSet.has(e.id) ? 1 : 0), 0)
        if (count > bestCount) { bestCount = count; best = v.key }
      }
      if (best) break // most-specific tier with any new element wins
    }
    if (best && best !== s.activeViewKey) {
      if (s.activeViewKey) s.viewHistory.push(s.activeViewKey)
      s.activeViewKey = best
      clearSelectionDraft(s)
      // Match the other view-switches — don't carry stale highlight filters into
      // the destination view.
      if (clearHighlightFiltersWithStash(s)) announce('Highlighter cleared on view change')
    }
  }),

  setActiveView: (key) => set((s) => {
    const changed = s.activeViewKey !== key
    s.activeViewKey = key
    s.selectedElementIds = []
    s.selectedRelationshipId = null
    s.selectedGroupId = null
    if (changed && clearHighlightFiltersWithStash(s)) {
      announce('Highlighter cleared on view change')
    }
  }),

  drillInto: (elementId) => set((s) => {
    if (!s.workspace || !s.activeViewKey) return
    const childView = findChildView(s.workspace, elementId)
    if (!childView) return
    // No-op if the "child" view is the one we're already on. This happens when
    // drilling on a system inside its own systemContext view and no container
    // view exists — findChildView falls back to the same systemContext view.
    if (childView.key === s.activeViewKey) return
    s.viewHistory.push(s.activeViewKey)
    s.activeViewKey = childView.key
    s.selectedElementIds = []
    s.selectedRelationshipId = null
    s.selectedGroupId = null
    if (clearHighlightFiltersWithStash(s)) {
      announce('Highlighter cleared on view change')
    }
  }),

  zoomInto: (elementId) => {
    const s = get()
    if (!s.workspace || !s.activeViewKey) return
    // Existing child view? Navigate like drillInto.
    const childView = findChildView(s.workspace, elementId, s.activeViewKey)
    if (childView && childView.key !== s.activeViewKey) {
      get().drillInto(elementId)
      return
    }
    // No child view yet — figure out what type we *would* create.
    const target = getZoomTarget(s.workspace, elementId)
    if (!target) return // not drillable (person/component/external/etc.)
    set({
      pendingZoomConfirm: { elementId, elementName: target.elementName, targetType: target.targetType },
    })
  },

  confirmZoomCreate: () => {
    const s = get()
    const pending = s.pendingZoomConfirm
    if (!pending || !s.workspace) return
    const viewTypeName = pending.targetType === 'container' ? 'Container' : 'Component'
    const title = `${pending.elementName} — ${viewTypeName}s`
    // addView auto-populates elements and switches to the new view. It also
    // pushes an undo entry. Preserve viewHistory so navigateBack returns here.
    const prevActive = s.activeViewKey
    get().addView(pending.targetType, pending.elementId, title)
    if (prevActive) {
      set((curr) => {
        curr.viewHistory.push(prevActive)
        curr.pendingZoomConfirm = null
      })
    } else {
      set({ pendingZoomConfirm: null })
    }
  },

  cancelZoomConfirm: () => set({ pendingZoomConfirm: null }),

  openCreateViewFromZoom: () => {
    const pending = get().pendingZoomConfirm
    if (!pending) return
    set({
      pendingZoomConfirm: null,
      createViewDefaults: { type: pending.targetType, scopeId: pending.elementId },
      createViewDialogOpen: true,
    })
  },

  setCreateViewDefaults: (defaults) => set({ createViewDefaults: defaults }),

  navigateBack: () => set((s) => {
    if (s.viewHistory.length === 0) return
    const previous = s.viewHistory.pop()!
    s.activeViewKey = previous
    s.selectedElementIds = []
    s.selectedRelationshipId = null
    s.selectedGroupId = null
    if (clearHighlightFiltersWithStash(s)) {
      announce('Highlighter cleared on view change')
    }
  }),
})
