import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { WorkspaceState } from './workspace-types'
import { createFilterSlice } from './slices/filter-slice'
import { createUiSlice } from './slices/ui-slice'
import { createSelectionSlice } from './slices/selection-slice'
import { createNavigationSlice } from './slices/navigation-slice'
import { createElementSlice } from './slices/element-slice'
import { createGroupSlice } from './slices/group-slice'
import { createRelationshipSlice } from './slices/relationship-slice'
import { createViewSlice } from './slices/view-slice'
import { createTagStyleSlice } from './slices/tag-style-slice'
import { createUndoSlice } from './slices/undo-slice'
import { createLifecycleSlice } from './slices/lifecycle-slice'

export type { WorkspaceState, UndoState } from './workspace-types'
export { BUILTIN_TAGS } from './builtin-tags'
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
  isFocalScopeElement,
  getFocalScopeId,
} from './workspace-selectors'

/**
 * Workspace store — composed of per-domain slices in ./slices/. Each slice
 * is a self-contained {state + actions} module that operates on the shared
 * WorkspaceState; cross-slice action calls go through get() / set().
 *
 * State shape: see workspace-types.ts.
 * Undo helpers (used by every workspace-mutating slice): see internals.ts.
 */
export const useWorkspaceStore = create<WorkspaceState>()(
  immer((...a) => ({
    ...createFilterSlice(...a),
    ...createUiSlice(...a),
    ...createSelectionSlice(...a),
    ...createNavigationSlice(...a),
    ...createLifecycleSlice(...a),
    ...createElementSlice(...a),
    ...createGroupSlice(...a),
    ...createRelationshipSlice(...a),
    ...createViewSlice(...a),
    ...createTagStyleSlice(...a),
    ...createUndoSlice(...a),
  })),
)
