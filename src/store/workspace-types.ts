import type {
  Workspace, ModelElement, Relationship, Group,
  ViewType, ElementStatus,
} from '@/types/model'
import type { ScopeViolation } from '@/lib/scopeValidation'
import type { AiFeatureId } from '@/lib/ai/types'
export interface CascadeImpact {
  /** Top-level elements explicitly selected for deletion. */
  elementCount: number
  /** Names of those top-level elements (for the dialog body). */
  elementNames: string[]
  /** Containers that get deleted because their parent system is being removed. */
  descendantContainers: number
  /** Components that get deleted because their container (or its parent system) is being removed. */
  descendantComponents: number
  /** Relationships that lose at least one endpoint and get pruned. */
  relationships: number
  /** Scoped views (systemContext / container / component) that get removed because their scope element is gone. */
  scopedViews: number
}

export interface PendingDelete {
  message: string
  impact?: CascadeImpact
  onConfirm: () => void
}

// ─── Undo History ────────────────────────────────────────────────────

export const MAX_UNDO = 25

export interface UndoState {
  undoStack: Workspace[]
  redoStack: Workspace[]
}

// ─── Highlighter ─────────────────────────────────────────────────────

export type HighlighterFacet = 'tags' | 'status' | 'tech' | 'teams'

// ─── State Interface ─────────────────────────────────────────────────

export interface WorkspaceState extends UndoState {
  workspace: Workspace | null

  // Navigation
  activeViewKey: string | null
  viewHistory: string[]

  // Selection
  selectedElementIds: string[]
  selectedRelationshipId: string | null
  selectedGroupId: string | null

  // UI
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  searchOpen: boolean
  commandPaletteOpen: boolean
  pendingDelete: PendingDelete | null
  confirmDelete: (
    payload: string | { message: string; impact?: CascadeImpact },
    onConfirm: () => void,
  ) => void
  cancelDelete: () => void
  /** Active zoom-in confirm prompt: shown when the user clicks zoom on an element
   *  that has children but no corresponding child view. */
  pendingZoomConfirm: { elementId: string; elementName: string; targetType: 'container' | 'component' } | null
  /** Optional defaults to pre-populate CreateViewDialog with, used by the zoom "Customize…" flow. */
  createViewDefaults: { type: ViewType; scopeId?: string } | null
  presentationMode: boolean
  lastSavedUndoLength: number
  setLastSavedUndoLength: (n: number) => void

  // Focus request — set to an element ID to center the canvas on it, then cleared.
  focusElementId: string | null
  clearFocusElement: () => void

  // Canvas settings
  activeTagFilter: string[]
  activeStatusFilter: ElementStatus[]
  /** Multi-select tech filter — element matches if any of its technology tokens is in this set. */
  activeTechFilter: string[]
  activeTeamFilter: string[]
  /** Snapshot of filters that were active before a view-switch cleared them.
   *  Lets the UI offer a one-click restore. Null when there's nothing to restore. */
  lastClearedHighlightFilters: {
    activeTagFilter: string[]
    activeStatusFilter: ElementStatus[]
    activeTechFilter: string[]
    activeTeamFilter: string[]
  } | null
  minimapEnabled: boolean
  snapToGrid: boolean
  multiSelectMode: boolean
  setMultiSelectMode: (on: boolean) => void

  // Active filename for folder-based workspaces (e.g. 'bigbank.dsl')
  activeWorkspaceFilename: string | null
  setActiveWorkspaceFilename: (name: string | null) => void

  // Scope validation
  scopeViolations: ScopeViolation[]
  revalidateScope: () => void

  // Workspace lifecycle
  loadWorkspace: (workspace: Workspace) => void
  closeWorkspace: () => void
  updateWorkspaceMeta: (patch: { name?: string; description?: string }) => void

  // Navigation
  setActiveView: (key: string) => void
  drillInto: (elementId: string) => void
  /** Zoom into a drillable element. If a child view exists, navigate to it (like drillInto).
   *  Otherwise, set pendingZoomConfirm so the UI can prompt the user to create one. */
  zoomInto: (elementId: string) => void
  /** Accept the pending zoom confirm: create the target view and navigate to it. */
  confirmZoomCreate: () => void
  /** Dismiss the pending zoom confirm without creating a view. */
  cancelZoomConfirm: () => void
  /** Convert the pending zoom confirm into CreateViewDialog defaults + open the dialog
   *  (the "Customize…" escape hatch on the zoom confirm prompt). */
  openCreateViewFromZoom: () => void
  setCreateViewDefaults: (defaults: { type: ViewType; scopeId?: string } | null) => void
  navigateBack: () => void
  focusViewForElements: (ids: string[]) => void

  // Selection
  selectElements: (ids: string[]) => void
  selectRelationship: (id: string) => void
  selectGroup: (id: string | null) => void
  clearSelection: () => void

  // Element CRUD
  addPerson: (name: string, position?: { x: number; y: number }, location?: 'Internal' | 'External') => string
  addSoftwareSystem: (name: string, position?: { x: number; y: number }, location?: 'Internal' | 'External') => string
  addContainer: (systemId: string, name: string, position?: { x: number; y: number }, extraTag?: string) => string
  addComponent: (containerId: string, name: string, position?: { x: number; y: number }) => string
  updateElement: (id: string, patch: Partial<Pick<ModelElement, 'name' | 'description' | 'tags' | 'status' | 'owner' | 'url'>> & { location?: 'Internal' | 'External' | 'Unspecified' }) => void
  /** Same as updateElement but does NOT push an undo entry — for live typing previews */
  updateElementLive: (id: string, patch: Partial<Pick<ModelElement, 'name' | 'description' | 'tags' | 'status' | 'owner' | 'url'>> & { location?: 'Internal' | 'External' | 'Unspecified', technology?: string }) => void
  updateElementTechnology: (id: string, technology: string) => void
  deleteElement: (id: string) => void
  deleteElements: (ids: string[]) => void
  duplicateElements: (ids: string[]) => string[]

  // Group CRUD
  addGroup: (name: string, elementIds?: string[]) => string
  updateGroup: (id: string, patch: Partial<Pick<Group, 'name' | 'elementIds'>>) => void
  deleteGroup: (id: string) => void

  // Relationship CRUD
  addRelationship: (sourceId: string, destinationId: string, description?: string, technology?: string) => string
  updateRelationship: (id: string, patch: Partial<Pick<Relationship, 'description' | 'technology' | 'interactionStyle' | 'lineStyle' | 'url' | 'tags'>>) => void
  reconnectRelationship: (id: string, newSourceId: string, newTargetId: string) => void
  deleteRelationship: (id: string) => void

  // View management
  addView: (type: ViewType, scopeId?: string, title?: string) => string
  deleteView: (key: string) => void
  renameView: (key: string, title: string) => void
  duplicateView: (key: string) => string
  updateNodePosition: (nodeId: string, x: number, y: number) => void
  updateNodePositions: (updates: { id: string; x: number; y: number }[]) => void
  /** Fill in saved x/y for view elements that don't yet have positions. Used
   *  by Canvas to canonicalize the initial dagre layout so subsequent adds
   *  see existing nodes as "frozen" and don't trigger a full re-layout.
   *  Does NOT pin, push undo, or bump layoutVersion — purely a derivation. */
  syncAutoLayoutPositions: (viewKey: string, updates: Map<string, { x: number; y: number }>) => void

  // Undo/Redo
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  /** Replace the whole workspace in place WITHOUT pushing an undo snapshot, fixing
   *  up active view / selection / scope. For batched rebuilds (e.g. the AI sweep's
   *  replay-from-baseline revert) where the surrounding batch owns the single undo
   *  entry. Not for general use — prefer mutators that record undo. */
  resetWorkspaceTo: (workspace: Workspace) => void

  // View element management
  toggleElementInView: (viewKey: string, elementId: string) => void
  removeElementsFromView: (viewKey: string, ids: string[]) => void
  setLayoutDirection: (viewKey: string, direction: 'TB' | 'BT' | 'LR' | 'RL') => void
  /** Reset all node positions and optionally change layout direction in a single undo step */
  resetAndRelayout: (viewKey: string, direction?: 'TB' | 'BT' | 'LR' | 'RL') => void

  // Layout epoch — increments on explicit relayout/direction change so Canvas can refit
  layoutVersion: number

  // Canvas settings
  setActiveTagFilter: (tags: string[]) => void
  toggleActiveTagFilter: (tag: string) => void
  setActiveStatusFilter: (statuses: ElementStatus[]) => void
  toggleActiveStatusFilter: (status: ElementStatus) => void
  setActiveTechFilter: (techs: string[]) => void
  toggleActiveTechFilter: (tech: string) => void
  setActiveTeamFilter: (teams: string[]) => void
  toggleActiveTeamFilter: (team: string) => void
  clearAllHighlightFilters: () => void
  /** Re-apply filters from `lastClearedHighlightFilters` and clear the stash. No-op if stash is null. */
  restoreHighlightFilters: () => void
  /** Drop the cleared-filters stash without restoring (user dismisses the affordance). */
  dismissClearedHighlightFiltersHint: () => void
  updateElementStyle: (style: import('@/types/model').ElementStyle) => void
  removeElementStyle: (tag: string) => void
  renameTag: (oldTag: string, newTag: string) => void
  removeTagGlobal: (tag: string) => void
  toggleMinimap: () => void
  toggleSnapToGrid: () => void

  // Views panel (floating)
  viewsPanelOpen: boolean
  setViewsPanelOpen: (open: boolean) => void
  toggleViewsPanel: () => void

  // UI toggles
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  setLeftPanelOpen: (open: boolean) => void
  setRightPanelOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  canvasSettingsOpen: boolean
  setCanvasSettingsOpen: (open: boolean) => void
  /** BYOK AI assistant panel. `aiPanelFeature` selects which feature tab opens. */
  aiPanelOpen: boolean
  aiPanelFeature: AiFeatureId | null
  setAiPanelOpen: (open: boolean, feature?: AiFeatureId | null) => void
  clearAiPanelFeature: () => void
  aiPanelBusy: boolean
  setAiPanelBusy: (busy: boolean) => void
  batchApplying: boolean
  setBatchApplying: (on: boolean) => void
  aiSettingsOpen: boolean
  setAiSettingsOpen: (open: boolean) => void
  canvasGuideOpen: boolean
  setCanvasGuideOpen: (open: boolean) => void
  addElementPanelOpen: boolean
  setAddElementPanelOpen: (open: boolean) => void
  /** Which Highlighter facet's flyout is currently open above the bottom bar.
   *  Null when no flyout is showing (bar still visible at minimal size). */
  highlighterOpenFacet: HighlighterFacet | null
  setHighlighterOpenFacet: (facet: HighlighterFacet | null) => void
  tagFilterMode: 'any' | 'all'
  statusFilterMode: 'any' | 'all'
  techFilterMode: 'any' | 'all'
  teamFilterMode: 'any' | 'all'
  setTagFilterMode: (mode: 'any' | 'all') => void
  setStatusFilterMode: (mode: 'any' | 'all') => void
  setTechFilterMode: (mode: 'any' | 'all') => void
  setTeamFilterMode: (mode: 'any' | 'all') => void
  createViewDialogOpen: boolean
  setCreateViewDialogOpen: (open: boolean) => void
  setPresentationMode: (on: boolean) => void
}
