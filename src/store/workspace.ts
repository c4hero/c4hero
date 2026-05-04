import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { current, isDraft, original } from 'immer'
import { customAlphabet } from 'nanoid'

// IDs must be valid Structurizr DSL identifiers from the moment they are created
// so they survive a serialize → parse roundtrip without any sanitization:
//   - No hyphens: the serializer maps `-` → `_`, changing the ID.
//   - No leading digits: the serializer prepends `e` to digit-prefixed IDs,
//     changing them (e.g. `0abc1234` → var name `e0abc1234` → new ID `e0abc1234`).
// Using only letters guarantees IDs are always valid as-is.
const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 8)
import type {
  Workspace, ModelElement, Relationship, View, Group,
  Person, SoftwareSystem, Container, Component,
  ViewType, ElementStatus,
} from '@/types/model'
import { announce } from '@/lib/announce'
import { validateScope } from '@/lib/scopeValidation'
import type { ScopeViolation } from '@/lib/scopeValidation'
import {
  allViewsOf,
  findViewHelper,
  forEachElementHelper,
  applyElementPatch,
  elementExists,
  VIEW_ARRAY_KEYS,
  forEachView,
  uniqueElementName,
  addToCurrentView,
  cloneWorkspace,
  cascadeDeleteElements,
  duplicateElementsInTree,
  buildInitialViewContent,
} from './workspace-helpers'
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
} from './workspace-selectors'
import { getFirstViewKey, findChildViewHelper as findChildView } from './workspace-selectors'
import { getZoomTarget } from './workspace-selectors'

// ─── Built-in Tags ──────────────────────────────────────────────────

/** Tags that always exist and whose styles cannot be removed.
 *  'Relationship' is the built-in tag for all relationships and is
 *  included here so removeTagGlobal can't strip it from the model. */
export const BUILTIN_TAGS = new Set(['Element', 'Person', 'Software System', 'Container', 'Component', 'Relationship', 'Database'])

// ─── Undo History ────────────────────────────────────────────────────

const MAX_UNDO = 25

interface UndoState {
  undoStack: Workspace[]
  redoStack: Workspace[]
}

// ─── State Interface ─────────────────────────────────────────────────

interface WorkspaceState extends UndoState {
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
  pendingDelete: { message: string; onConfirm: () => void } | null
  confirmDelete: (message: string, onConfirm: () => void) => void
  cancelDelete: () => void
  /** Active zoom-in confirm prompt: shown when the user clicks zoom on an element
   *  that has children but no corresponding child view. */
  pendingZoomConfirm: { elementId: string; elementName: string; targetType: 'container' | 'component' } | null
  /** Optional defaults to pre-populate CreateViewDialog with, used by the zoom "Customize…" flow. */
  createViewDefaults: { type: ViewType; scopeId?: string } | null
  presentationMode: boolean
  lastSavedUndoLength: number
  setLastSavedUndoLength: (n: number) => void

  // Focus request — set to an element ID to center the canvas on it, then cleared
  focusElementId: string | null
  clearFocusElement: () => void

  // Canvas settings
  activeTagFilter: string[]
  activeStatusFilter: ElementStatus[]
  /** Multi-select tech filter — element matches if any of its technology tokens is in this set. */
  activeTechFilter: string[]
  activeTeamFilter: string[]
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

  // View element management
  toggleElementInView: (viewKey: string, elementId: string) => void
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
  addElementPanelOpen: boolean
  setAddElementPanelOpen: (open: boolean) => void
  highlighterPanelOpen: boolean
  setHighlighterPanelOpen: (open: boolean) => void
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

// ─── Internal Helpers ────────────────────────────────────────────────

/** Resolve the pre-mutation workspace reference suitable for the undo stack.
 *  Inside an Immer producer, original(draft) returns the pre-produce ref —
 *  immutable, structurally shared with the next state. Outside a producer
 *  (e.g. test setState shortcuts), s.workspace is already a stable snapshot. */
function undoSnapshot(s: WorkspaceState): Workspace | null {
  if (!s.workspace) return null
  return isDraft(s.workspace) ? (original(s.workspace) as Workspace) : s.workspace
}

/** Push current workspace to undo stack before mutation. Returns a partial
 *  UndoState for spread-merging into `set` returns — used by the legacy
 *  cloneWs-based actions during the migration. */
function pushUndo(s: WorkspaceState): Partial<UndoState> {
  const snapshot = undoSnapshot(s)
  if (!snapshot) return {}
  const undoStack = [...s.undoStack, snapshot].slice(-MAX_UNDO)
  return { undoStack, redoStack: [] }
}

/** Draft-mutation variant: append the pre-produce workspace snapshot to
 *  undoStack in place. Safe to call before OR after mutations — original()
 *  always returns the pre-produce ref, so position within the producer
 *  doesn't matter. Clears redoStack. */
function pushUndoSnapshot(s: WorkspaceState): void {
  const snapshot = undoSnapshot(s)
  if (!snapshot) return
  s.undoStack.push(snapshot)
  // Trim to MAX_UNDO entries from the front (oldest first).
  if (s.undoStack.length > MAX_UNDO) s.undoStack.splice(0, s.undoStack.length - MAX_UNDO)
  s.redoStack.length = 0
}

// Re-alias imported helpers under the names used internally
const findView = findViewHelper
const forEachElement = forEachElementHelper

/** Clone the active workspace for safe mutation. */
function cloneWs(s: WorkspaceState): Workspace | null {
  if (!s.workspace) return null
  // Unwrap drafts before cloning: structuredClone'ing a proxy works but the
  // result still references sub-drafts that get revoked post-producer. current()
  // returns a stable plain snapshot which structuredClone then deep-copies safely.
  const source = isDraft(s.workspace) ? (current(s.workspace) as Workspace) : s.workspace
  return cloneWorkspace(source)
}

export const useWorkspaceStore = create<WorkspaceState>()(immer((set, get) => ({
  workspace: null,
  activeViewKey: null,
  viewHistory: [],
  selectedElementIds: [],
  selectedRelationshipId: null,
  selectedGroupId: null,
  leftPanelOpen: true,
  rightPanelOpen: true,
  searchOpen: false,
  commandPaletteOpen: false,
  canvasSettingsOpen: false,
  addElementPanelOpen: false,
  highlighterPanelOpen: false,
  tagFilterMode: 'any',
  statusFilterMode: 'any',
  techFilterMode: 'all',
  teamFilterMode: 'any',
  createViewDialogOpen: false,
  pendingDelete: null,
  pendingZoomConfirm: null,
  createViewDefaults: null,
  lastSavedUndoLength: 0,
  setLastSavedUndoLength: (n) => set({ lastSavedUndoLength: n }),
  presentationMode: false,
  viewsPanelOpen: false,
  focusElementId: null,
  clearFocusElement: () => set({ focusElementId: null }),
  activeTagFilter: [],
  activeStatusFilter: [],
  activeTechFilter: [],
  activeTeamFilter: [],
  minimapEnabled: true,
  snapToGrid: false,
  multiSelectMode: false,
  undoStack: [],
  redoStack: [],
  layoutVersion: 0,
  activeWorkspaceFilename: null,
  setActiveWorkspaceFilename: (name) => set({ activeWorkspaceFilename: name }),

  // ─── Scope Validation ───────────────────────────────────────────

  scopeViolations: [],
  revalidateScope: () => set((s) => {
    s.scopeViolations = s.workspace ? validateScope(s.workspace) : []
  }),

  // ─── Workspace Lifecycle ────────────────────────────────────────

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
      pendingDelete: null, // dismiss any in-flight delete confirmation dialog
      pendingZoomConfirm: null,
      createViewDefaults: null,
      undoStack: [],
      redoStack: [],
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

  // ─── Navigation ─────────────────────────────────────────────────

  setActiveView: (key) => set({ activeViewKey: key, selectedElementIds: [], selectedRelationshipId: null, selectedGroupId: null }),

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
    // Build a friendly title and create the view.
    const viewTypeName = pending.targetType === 'container' ? 'Container' : 'Component'
    const title = `${pending.elementName} — ${viewTypeName}s`
    // addView auto-populates elements and switches to the new view. It also
    // pushes an undo entry. We want the new view to be drillable-from the
    // current view, so preserve viewHistory.
    const prevActive = s.activeViewKey
    get().addView(pending.targetType, pending.elementId, title)
    // Restore breadcrumb history so navigateBack returns to the caller view.
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
  }),

  // ─── Selection ──────────────────────────────────────────────────

  // Selecting any canvas object closes the Highlighter panel so the Inspector
  // (right side) doesn't stack underneath / behind it.
  selectElements: (ids) => set((s) => {
    s.selectedElementIds = ids
    s.selectedRelationshipId = null
    s.selectedGroupId = null
    if (ids.length > 0) s.highlighterPanelOpen = false
  }),
  selectRelationship: (id) => set((s) => {
    s.selectedRelationshipId = id
    s.selectedElementIds = []
    s.selectedGroupId = null
    if (id) s.highlighterPanelOpen = false
  }),
  selectGroup: (id) => set((s) => {
    s.selectedGroupId = id
    s.selectedElementIds = []
    s.selectedRelationshipId = null
    if (id) s.highlighterPanelOpen = false
  }),
  clearSelection: () => set({ selectedElementIds: [], selectedRelationshipId: null, selectedGroupId: null }),

  // ─── Element CRUD ───────────────────────────────────────────────

  addPerson: (name, position, location) => {
    const id = nanoid(8)
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      const ws = s.workspace
      const person: Person = { id, type: 'person', name: uniqueElementName(name, ws), tags: ['Element', 'Person'], properties: {}, location: location ?? 'Internal' }
      ws.model.people.push(person)
      addToCurrentView(ws, s.activeViewKey, id, position)
      // Auto-add to all system landscape views (they display every person/system)
      for (const v of ws.views.systemLandscapeViews) {
        if (v.key !== s.activeViewKey && !v.elements.some(e => e.id === id)) {
          v.elements.push({ id })
        }
      }
      s.focusElementId = id
      s.selectedElementIds = [id]
      s.selectedRelationshipId = null
      s.selectedGroupId = null
    })
    announce('Person created')
    return id
  },

  addSoftwareSystem: (name, position, location) => {
    const id = nanoid(8)
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      const ws = s.workspace
      const system: SoftwareSystem = { id, type: 'softwareSystem', name: uniqueElementName(name, ws), tags: ['Element', 'Software System'], properties: {}, containers: [], location: location ?? 'Internal' }
      ws.model.softwareSystems.push(system)
      addToCurrentView(ws, s.activeViewKey, id, position)
      // Auto-add to all system landscape views (they display every person/system)
      for (const v of ws.views.systemLandscapeViews) {
        if (v.key !== s.activeViewKey && !v.elements.some(e => e.id === id)) {
          v.elements.push({ id })
        }
      }
      s.focusElementId = id
      s.selectedElementIds = [id]
      s.selectedRelationshipId = null
      s.selectedGroupId = null
    })
    get().revalidateScope()
    announce('System created')
    return id
  },

  addContainer: (systemId, name, position, extraTag) => {
    const id = nanoid(8)
    let added = false
    set((s) => {
      if (!s.workspace) return
      const ws = s.workspace
      const system = ws.model.softwareSystems.find(sys => sys.id === systemId)
      if (!system) return
      pushUndoSnapshot(s)
      const tags = extraTag ? ['Element', 'Container', extraTag] : ['Element', 'Container']
      const container: Container = { id, type: 'container', name: uniqueElementName(name, ws), tags, properties: {}, components: [] }
      system.containers.push(container)
      addToCurrentView(ws, s.activeViewKey, id, position)
      // Also auto-add to all other container views scoped to the same system
      for (const v of ws.views.containerViews) {
        if (v.softwareSystemId === systemId && v.key !== s.activeViewKey) {
          if (!v.elements.some(e => e.id === id)) v.elements.push({ id })
        }
      }
      s.focusElementId = id
      s.selectedElementIds = [id]
      s.selectedRelationshipId = null
      s.selectedGroupId = null
      added = true
    })
    if (added) {
      get().revalidateScope()
      announce('Container created')
    }
    return id
  },

  addComponent: (containerId, name, position) => {
    const id = nanoid(8)
    let added = false
    set((s) => {
      if (!s.workspace) return
      const ws = s.workspace
      for (const sys of ws.model.softwareSystems) {
        const container = sys.containers.find(c => c.id === containerId)
        if (!container) continue
        pushUndoSnapshot(s)
        const comp: Component = { id, type: 'component', name: uniqueElementName(name, ws), tags: ['Element', 'Component'], properties: {} }
        container.components.push(comp)
        addToCurrentView(ws, s.activeViewKey, id, position)
        // Also auto-add to all other component views scoped to the same container
        for (const v of ws.views.componentViews) {
          if (v.containerId === containerId && v.key !== s.activeViewKey) {
            if (!v.elements.some(e => e.id === id)) v.elements.push({ id })
          }
        }
        s.focusElementId = id
        s.selectedElementIds = [id]
        s.selectedRelationshipId = null
        s.selectedGroupId = null
        added = true
        return
      }
    })
    if (added) announce('Component created')
    return id
  },

  updateElement: (id, patch) => set((s) => {
    if (!s.workspace) return
    // Mutate first to detect no-op patches; only push undo if something changed.
    // applyElementPatch operates directly on the draft and is no-op-safe.
    if (!applyElementPatch(s.workspace, id, patch)) return
    pushUndoSnapshot(s)
  }),

  updateElementLive: (id, patch) => set((s) => {
    if (!s.workspace) return
    // Mutate the draft directly — Immer detects no-op patches and skips
    // state replacement when applyElementPatch reports no change. No undo push.
    applyElementPatch(s.workspace, id, patch)
  }),

  updateElementTechnology: (id, technology) => set((s) => {
    if (!s.workspace) return
    if (!applyElementPatch(s.workspace, id, { technology })) return
    pushUndoSnapshot(s)
  }),

  deleteElement: (id) => {
    // Delegate to batch implementation
    useWorkspaceStore.getState().deleteElements([id])
  },

  deleteElements: (ids) => {
    if (ids.length === 0) return
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      cascadeDeleteElements(s.workspace, ids)
      // If the active view was among the ones just removed, fall back to the first remaining view.
      // Also purge stale keys from viewHistory so navigateBack never jumps to a ghost view.
      const activeStillExists = s.activeViewKey ? !!findView(s.workspace, s.activeViewKey) : false
      s.activeViewKey = activeStillExists ? s.activeViewKey : getFirstViewKey(s.workspace)
      s.viewHistory = s.viewHistory.filter(k => !!findView(s.workspace!, k))
      s.selectedElementIds = []
      s.selectedRelationshipId = null
      s.selectedGroupId = null
    })
    get().revalidateScope()
    announce(ids.length === 1 ? 'Element deleted' : `${ids.length} elements deleted`)
  },

  duplicateElements: (ids) => {
    let createdIds: string[] = []
    set((s) => {
      if (!s.workspace || !s.activeViewKey) return
      createdIds = duplicateElementsInTree(s.workspace, ids, s.activeViewKey, () => nanoid(8))
      if (createdIds.length === 0) return
      pushUndoSnapshot(s)
      s.selectedElementIds = createdIds
      s.selectedRelationshipId = null
      s.selectedGroupId = null
    })
    if (createdIds.length > 0) {
      announce(createdIds.length === 1 ? 'Element duplicated' : `${createdIds.length} elements duplicated`)
      get().revalidateScope()
    }
    return createdIds
  },

  // ─── Group CRUD ─────────────────────────────────────────────────

  addGroup: (name, elementIds = []) => {
    const id = nanoid(8)
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      const group: Group = { id, name, elementIds }
      s.workspace.model.groups.push(group)
    })
    return id
  },

  updateGroup: (id, patch) => set((s) => {
    if (!s.workspace) return
    const group = s.workspace.model.groups.find(g => g.id === id)
    if (!group) return
    let changed = false
    if (patch.name !== undefined && group.name !== patch.name) { group.name = patch.name; changed = true }
    if (patch.elementIds !== undefined) { group.elementIds = patch.elementIds; changed = true } // array, always treat as a change
    if (!changed) return
    pushUndoSnapshot(s)
  }),

  deleteGroup: (id) => set((s) => {
    if (!s.workspace) return
    if (!s.workspace.model.groups.some(g => g.id === id)) return
    pushUndoSnapshot(s)
    s.workspace.model.groups = s.workspace.model.groups.filter(g => g.id !== id)
    if (s.selectedGroupId === id) s.selectedGroupId = null
  }),

  // ─── Relationship CRUD ──────────────────────────────────────────

  addRelationship: (sourceId, destinationId, description, technology) => {
    const id = nanoid(8)
    let created = false
    set((s) => {
      const ws = cloneWs(s)
      if (!ws) return s
      if (sourceId === destinationId) return s
      if (!elementExists(ws, sourceId) || !elementExists(ws, destinationId)) return s
      const rel: Relationship = {
        id,
        sourceId,
        destinationId,
        description,
        technology,
        tags: ['Relationship'],
        properties: {},
      }
      ws.model.relationships.push(rel)
      created = true
      // For systemContext views: if one endpoint is the scoped system, auto-add
      // the other endpoint (external actor) to the view so the context diagram stays
      // consistent — a person/system related to the scope should appear in its context view.
      for (const v of ws.views.systemContextViews) {
        if (!v.softwareSystemId) continue
        const scopeId = v.softwareSystemId
        const sourceIsScope = sourceId === scopeId
        const destIsScope = destinationId === scopeId
        if (sourceIsScope || destIsScope) {
          const actorId = sourceIsScope ? destinationId : sourceId
          if (!v.elements.some(e => e.id === actorId)) {
            v.elements.push({ id: actorId })
          }
        }
      }
      // Add relationship ref to every view that now has both endpoints
      for (const view of allViewsOf(ws)) {
        const viewElIds = new Set(view.elements.map(e => e.id))
        if (viewElIds.has(sourceId) && viewElIds.has(destinationId)) {
          if (!view.relationships.some(r => r.id === id)) {
            view.relationships.push({ id })
          }
        }
      }
      return { ...pushUndo(s), workspace: ws, selectedRelationshipId: id, selectedElementIds: [], selectedGroupId: null }
    })
    return created ? id : ''
  },

  updateRelationship: (id, patch) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    const rel = ws.model.relationships.find(r => r.id === id)
    if (!rel) return s
    // Use 'key in patch' for optional fields that the UI may legitimately clear by passing
    // undefined (e.g. empty text field → { description: undefined }).  This mirrors the same
    // pattern used in applyElementPatch.
    // No-op guard: only push undo if at least one field actually changes.
    let changed = false
    if ('description' in patch && rel.description !== patch.description) { rel.description = patch.description; changed = true }
    if ('technology' in patch && rel.technology !== patch.technology) { rel.technology = patch.technology; changed = true }
    if ('interactionStyle' in patch && rel.interactionStyle !== patch.interactionStyle) { rel.interactionStyle = patch.interactionStyle; changed = true }
    if ('lineStyle' in patch && rel.lineStyle !== patch.lineStyle) { rel.lineStyle = patch.lineStyle; changed = true }
    if ('url' in patch && rel.url !== patch.url) { rel.url = patch.url; changed = true }
    if (patch.tags !== undefined) {
      // Tags array: compare by serialized form since the reference always differs post-clone
      const tagsChanged = patch.tags.length !== rel.tags.length || patch.tags.some((t, i) => t !== rel.tags[i])
      if (tagsChanged) { rel.tags = patch.tags; changed = true }
    }
    if (!changed) return s
    return { ...pushUndo(s), workspace: ws }
  }),

  reconnectRelationship: (id, newSourceId, newTargetId) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    const rel = ws.model.relationships.find(r => r.id === id)
    if (!rel) return s
    if (rel.sourceId === newSourceId && rel.destinationId === newTargetId) return s
    if (newSourceId === newTargetId) return s
    if (!elementExists(ws, newSourceId) || !elementExists(ws, newTargetId)) return s
    rel.sourceId = newSourceId
    rel.destinationId = newTargetId

    // Mirror addRelationship semantics for system context views: when one endpoint
    // is the scoped system, ensure the other endpoint is visible so the context
    // diagram still expresses the relationship after reconnecting.
    for (const v of ws.views.systemContextViews) {
      if (!v.softwareSystemId) continue
      const scopeId = v.softwareSystemId
      const sourceIsScope = newSourceId === scopeId
      const destIsScope = newTargetId === scopeId
      if (sourceIsScope || destIsScope) {
        const actorId = sourceIsScope ? newTargetId : newSourceId
        if (!v.elements.some(e => e.id === actorId)) {
          v.elements.push({ id: actorId })
        }
      }
    }

    // Sync view.relationships: keep only in views where both new endpoints exist
    forEachView(ws, (v) => {
      const elIds = new Set(v.elements.map(e => e.id))
      const hasRel = v.relationships.some(r => r.id === id)
      const bothPresent = elIds.has(newSourceId) && elIds.has(newTargetId)
      if (hasRel && !bothPresent) {
        v.relationships = v.relationships.filter(r => r.id !== id)
      } else if (!hasRel && bothPresent) {
        v.relationships.push({ id })
      }
    })
    return { ...pushUndo(s), workspace: ws }
  }),

  deleteRelationship: (id) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    if (!ws.model.relationships.some(r => r.id === id)) return s
    ws.model.relationships = ws.model.relationships.filter(r => r.id !== id)
    // Remove from all views
    forEachView(ws, (v) => {
      v.relationships = v.relationships.filter(r => r.id !== id)
    })
    return {
      ...pushUndo(s),
      workspace: ws,
      selectedRelationshipId: s.selectedRelationshipId === id ? null : s.selectedRelationshipId,
    }
  }),

  // ─── View Management ────────────────────────────────────────────

  addView: (type, scopeId, title) => {
    const key = nanoid(8)
    set((s) => {
      const ws = cloneWs(s)
      if (!ws) return s

      const { elements, relationships } = buildInitialViewContent(ws.model, type, scopeId)
      const view: View = {
        type,
        key,
        title: title ?? `New ${type} view`,
        elements,
        relationships,
        autoLayout: { direction: 'TB' },
        softwareSystemId: (type === 'systemContext' || type === 'container') ? scopeId : undefined,
        containerId: type === 'component' ? scopeId : undefined,
      }
      switch (type) {
        case 'systemLandscape': ws.views.systemLandscapeViews.push(view); break
        case 'systemContext': ws.views.systemContextViews.push(view); break
        case 'container': ws.views.containerViews.push(view); break
        case 'component': ws.views.componentViews.push(view); break
      }
      return { ...pushUndo(s), workspace: ws, activeViewKey: key, selectedElementIds: [], selectedRelationshipId: null, selectedGroupId: null }
    })
    return key
  },

  deleteView: (key) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    // Find which array contains the key and only filter that one
    let found = false
    for (const arrKey of VIEW_ARRAY_KEYS) {
      const idx = ws.views[arrKey].findIndex(v => v.key === key)
      if (idx !== -1) {
        ws.views[arrKey].splice(idx, 1)
        found = true
        break
      }
    }
    if (!found) return s
    const newActiveKey = s.activeViewKey === key ? getFirstViewKey(ws) : s.activeViewKey
    // Remove the deleted key from navigation history so navigateBack never lands on a ghost view
    const newHistory = s.viewHistory.filter(k => k !== key)
    // Clear selection when the active view is being deleted (we're switching to a different view)
    const switchingViews = s.activeViewKey === key
    return {
      ...pushUndo(s),
      workspace: ws,
      activeViewKey: newActiveKey,
      viewHistory: newHistory,
      ...(switchingViews ? { selectedElementIds: [], selectedRelationshipId: null, selectedGroupId: null } : {}),
    }
  }),

  renameView: (key, title) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    let found = false
    for (const arr of [ws.views.systemLandscapeViews, ws.views.systemContextViews, ws.views.containerViews, ws.views.componentViews] as { key: string; title?: string }[][]) {
      const v = arr.find(v => v.key === key)
      if (v) {
        if (v.title === title) return s // no-op: title unchanged
        v.title = title
        found = true
        break
      }
    }
    if (!found) return s
    return { ...pushUndo(s), workspace: ws }
  }),

  duplicateView: (key) => {
    const newKey = nanoid(8)
    set((s) => {
      const ws = cloneWs(s)
      if (!ws) return s
      let found = false
      for (const arrKey of VIEW_ARRAY_KEYS) {
        const src = ws.views[arrKey].find(v => v.key === key)
        if (src) {
          const copy: View = {
            ...structuredClone(src),
            key: newKey,
            title: `${src.title ?? 'View'} copy`,
          }
          ws.views[arrKey].push(copy)
          found = true
          break
        }
      }
      if (!found) return s
      return { ...pushUndo(s), workspace: ws, activeViewKey: newKey, selectedElementIds: [], selectedRelationshipId: null, selectedGroupId: null }
    })
    return newKey
  },

  updateNodePosition: (nodeId, x, y) => set((s) => {
    if (!s.workspace || !s.activeViewKey) return
    for (const key of VIEW_ARRAY_KEYS) {
      const view = s.workspace.views[key].find(v => v.key === s.activeViewKey)
      if (!view) continue
      const el = view.elements.find(e => e.id === nodeId)
      if (!el) return
      el.x = x
      el.y = y
      el.pinned = true
      return
    }
    // Don't push undo for every drag position — too noisy
  }),

  updateNodePositions: (updates) => set((s) => {
    if (!s.workspace || !s.activeViewKey) return
    const updateMap = new Map(updates.map(u => [u.id, u]))
    for (const key of VIEW_ARRAY_KEYS) {
      const view = s.workspace.views[key].find(v => v.key === s.activeViewKey)
      if (!view) continue
      for (const el of view.elements) {
        const u = updateMap.get(el.id)
        if (!u) continue
        el.x = u.x
        el.y = u.y
        el.pinned = true
      }
      return
    }
  }),

  syncAutoLayoutPositions: (viewKey, updates) => set((s) => {
    if (!s.workspace || updates.size === 0) return
    for (const key of VIEW_ARRAY_KEYS) {
      const view = s.workspace.views[key].find(v => v.key === viewKey)
      if (!view) continue
      for (const el of view.elements) {
        // Only fill in missing positions; never override saved ones (those
        // came from a drag, a load, or a prior sync).
        if (el.x !== undefined && el.y !== undefined) continue
        const u = updates.get(el.id)
        if (!u) continue
        el.x = u.x
        el.y = u.y
      }
      return
    }
  }),

  // ─── Undo / Redo ───────────────────────────────────────────────

  undo: () => {
    set((s) => {
      if (s.undoStack.length === 0 || !s.workspace) return s
      const undoStack = [...s.undoStack]
      const previous = undoStack.pop()!
      const redoStack = [...s.redoStack, s.workspace]
      // If the current active view no longer exists in the restored workspace, fall back to first view
      const activeStillExists = s.activeViewKey ? !!findView(previous, s.activeViewKey) : false
      const activeViewKey = activeStillExists ? s.activeViewKey : getFirstViewKey(previous)
      // Purge any viewHistory entries that no longer exist in the restored workspace
      const viewHistory = s.viewHistory.filter(k => !!findView(previous, k))
      return { workspace: previous, undoStack, redoStack, activeViewKey, viewHistory, selectedElementIds: [], selectedRelationshipId: null, selectedGroupId: null, scopeViolations: validateScope(previous) }
    })
    announce('Undone')
  },

  redo: () => {
    set((s) => {
      if (s.redoStack.length === 0 || !s.workspace) return s
      const redoStack = [...s.redoStack]
      const next = redoStack.pop()!
      const undoStack = [...s.undoStack, s.workspace]
      // If the current active view no longer exists in the target workspace, fall back to first view
      const activeStillExists = s.activeViewKey ? !!findView(next, s.activeViewKey) : false
      const activeViewKey = activeStillExists ? s.activeViewKey : getFirstViewKey(next)
      // Purge any viewHistory entries that no longer exist in the target workspace
      const viewHistory = s.viewHistory.filter(k => !!findView(next, k))
      return { workspace: next, undoStack, redoStack, activeViewKey, viewHistory, selectedElementIds: [], selectedRelationshipId: null, selectedGroupId: null, scopeViolations: validateScope(next) }
    })
    announce('Redone')
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  // ─── View Element Management ────────────────────────────────────

  toggleElementInView: (viewKey, elementId) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    const view = findView(ws, viewKey)
    if (!view) return s
    const idx = view.elements.findIndex(e => e.id === elementId)
    if (idx >= 0) {
      view.elements.splice(idx, 1)
      // Also remove relationships that reference this element
      view.relationships = view.relationships.filter(r => {
        const rel = ws.model.relationships.find(mr => mr.id === r.id)
        if (!rel) return false
        return rel.sourceId !== elementId && rel.destinationId !== elementId
      })
    } else {
      // Capture IDs already in the view BEFORE adding the new element
      const existingElementIds = new Set(view.elements.map(e => e.id))
      view.elements.push({ id: elementId })
      // Auto-add any model relationships that connect the new element to elements
      // already present in the view (avoids forcing the user to re-draw connections)
      const existingRelIds = new Set(view.relationships.map(r => r.id))
      for (const rel of ws.model.relationships) {
        if (existingRelIds.has(rel.id)) continue
        const linksNewEl =
          (rel.sourceId === elementId && existingElementIds.has(rel.destinationId)) ||
          (rel.destinationId === elementId && existingElementIds.has(rel.sourceId))
        if (linksNewEl) {
          view.relationships.push({ id: rel.id })
          existingRelIds.add(rel.id)
        }
      }
    }
    return { ...pushUndo(s), workspace: ws }
  }),

  setLayoutDirection: (viewKey, direction) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    const view = findView(ws, viewKey)
    if (!view) return s
    view.autoLayout = { ...view.autoLayout, direction }
    // Reset positions and pinned flags to trigger full re-layout
    for (const el of view.elements) {
      el.x = undefined
      el.y = undefined
      el.pinned = undefined
    }
    return { ...pushUndo(s), workspace: ws, layoutVersion: s.layoutVersion + 1 }
  }),

  resetAndRelayout: (viewKey, direction) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    const view = findView(ws, viewKey)
    if (!view) return s
    // Reset positions and pinned flags
    for (const el of view.elements) {
      el.x = undefined
      el.y = undefined
      el.pinned = undefined
    }
    // Optionally change direction
    if (direction) {
      view.autoLayout = { ...view.autoLayout, direction }
    }
    return { ...pushUndo(s), workspace: ws, layoutVersion: s.layoutVersion + 1 }
  }),

  // ─── Canvas Settings ──────────────────────────────────────────

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
  }),
  updateElementStyle: (style) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    const styles = ws.views.configuration.styles.elements
    const idx = styles.findIndex((es) => es.tag === style.tag)
    if (idx >= 0) {
      // No-op guard: if every incoming field already matches, skip the undo push
      const existing = styles[idx]
      const keys = Object.keys(style) as (keyof typeof style)[]
      const changed = keys.some(k => k !== 'tag' && style[k] !== existing[k])
      if (!changed) return s
      styles[idx] = { ...existing, ...style }
    } else {
      styles.push(style)
    }
    return { ...pushUndo(s), workspace: ws }
  }),
  removeElementStyle: (tag) => set((s) => {
    // Built-in tag styles CAN be removed — the theme provides the fallback.
    const ws = cloneWs(s)
    if (!ws) return s
    const exists = ws.views.configuration.styles.elements.some((es) => es.tag === tag)
    if (!exists) return s
    ws.views.configuration.styles.elements = ws.views.configuration.styles.elements.filter((es) => es.tag !== tag)
    return { ...pushUndo(s), workspace: ws }
  }),
  renameTag: (oldTag, newTag) => set((s) => {
    if (!newTag.trim() || oldTag === newTag) return s
    if (BUILTIN_TAGS.has(oldTag)) return s // Built-in tags cannot be renamed
    if (BUILTIN_TAGS.has(newTag.trim())) return s // Cannot rename a custom tag to a built-in name
    if (!s.workspace) return s
    // Quick existence check before the expensive clone + undo push
    const src = s.workspace
    let exists = src.views.configuration.styles.elements.some(es => es.tag === oldTag)
      || src.views.configuration.styles.relationships.some(rs => rs.tag === oldTag)
      || src.model.relationships.some(r => r.tags.includes(oldTag))
    if (!exists) forEachElement(src, (el) => { if (el.tags.includes(oldTag)) { exists = true; return true } })
    if (!exists) return s
    const ws = cloneWs(s)
    if (!ws) return s
    forEachElement(ws, (el) => { el.tags = el.tags.map(t => t === oldTag ? newTag : t) })
    for (const rel of ws.model.relationships) { rel.tags = rel.tags.map(t => t === oldTag ? newTag : t) }
    const elStyle = ws.views.configuration.styles.elements.find(es => es.tag === oldTag)
    if (elStyle) elStyle.tag = newTag
    const relStyle = ws.views.configuration.styles.relationships.find(rs => rs.tag === oldTag)
    if (relStyle) relStyle.tag = newTag
    return {
      ...pushUndo(s),
      workspace: ws,
      activeTagFilter: s.activeTagFilter.map((t) => (t === oldTag ? newTag : t)),
    }
  }),

  removeTagGlobal: (tag) => set((s) => {
    if (BUILTIN_TAGS.has(tag)) return s // Built-in tags cannot be removed
    if (!s.workspace) return s
    // Quick existence check on the pre-clone workspace to avoid unnecessary cloning
    const src = s.workspace
    let exists = src.views.configuration.styles.elements.some(es => es.tag === tag)
      || src.views.configuration.styles.relationships.some(rs => rs.tag === tag)
      || src.model.relationships.some(r => r.tags.includes(tag))
    if (!exists) forEachElement(src, (el) => { if (el.tags.includes(tag)) { exists = true; return true } })
    if (!exists) return s
    const ws = cloneWs(s)
    if (!ws) return s
    forEachElement(ws, (el) => { el.tags = el.tags.filter(t => t !== tag) })
    for (const rel of ws.model.relationships) { rel.tags = rel.tags.filter(t => t !== tag) }
    ws.views.configuration.styles.elements = ws.views.configuration.styles.elements.filter(es => es.tag !== tag)
    ws.views.configuration.styles.relationships = ws.views.configuration.styles.relationships.filter(rs => rs.tag !== tag)
    return {
      ...pushUndo(s),
      workspace: ws,
      activeTagFilter: s.activeTagFilter.filter((t) => t !== tag),
    }
  }),

  toggleMinimap: () => set((s) => { s.minimapEnabled = !s.minimapEnabled }),
  toggleSnapToGrid: () => set((s) => { s.snapToGrid = !s.snapToGrid }),
  setMultiSelectMode: (on) => set({ multiSelectMode: on }),

  // ─── Views Panel ─────────────────────────────────────────────────

  setViewsPanelOpen: (open) => set({ viewsPanelOpen: open }),
  toggleViewsPanel: () => set((s) => { s.viewsPanelOpen = !s.viewsPanelOpen }),

  // ─── UI Toggles ─────────────────────────────────────────────────

  toggleLeftPanel: () => set((s) => { s.leftPanelOpen = !s.leftPanelOpen }),
  toggleRightPanel: () => set((s) => { s.rightPanelOpen = !s.rightPanelOpen }),
  setLeftPanelOpen: (open) => set({ leftPanelOpen: open }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open, commandPaletteOpen: false }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open, searchOpen: false }),
  setCanvasSettingsOpen: (open) => set({ canvasSettingsOpen: open, commandPaletteOpen: false }),
  setAddElementPanelOpen: (open) => set({ addElementPanelOpen: open, commandPaletteOpen: false }),
  setHighlighterPanelOpen: (open) => set({ highlighterPanelOpen: open, commandPaletteOpen: false }),
  setTagFilterMode: (mode) => set({ tagFilterMode: mode }),
  setStatusFilterMode: (mode) => set({ statusFilterMode: mode }),
  setTechFilterMode: (mode) => set({ techFilterMode: mode }),
  setTeamFilterMode: (mode) => set({ teamFilterMode: mode }),
  setCreateViewDialogOpen: (open) => set({ createViewDialogOpen: open, commandPaletteOpen: false }),
  confirmDelete: (message, onConfirm) => set({ pendingDelete: { message, onConfirm } }),
  cancelDelete: () => set({ pendingDelete: null }),
  setPresentationMode: (on) => set({ presentationMode: on }),
})))
