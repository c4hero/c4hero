import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type {
  Workspace, ModelElement, Relationship, View, Group,
  Person, SoftwareSystem, Container, Component,
  ViewType, ElementStatus,
} from '@/types/model'
import { announce } from '@/lib/announce'
import { validateScope } from '@/lib/scopeValidation'
import type { ScopeViolation } from '@/lib/scopeValidation'

// ─── Built-in Tags ──────────────────────────────────────────────────

/** Tags that always exist and whose styles cannot be removed */
export const BUILTIN_TAGS = new Set(['Element', 'Person', 'Software System', 'Container', 'Component'])

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
  presentationMode: boolean
  lastSavedUndoLength: number
  setLastSavedUndoLength: (n: number) => void

  // Focus request — set to an element ID to center the canvas on it, then cleared
  focusElementId: string | null
  clearFocusElement: () => void

  // Canvas settings
  activeTagFilter: string | null
  activeStatusFilter: ElementStatus | null
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

  // Group CRUD
  addGroup: (name: string, elementIds?: string[]) => string
  updateGroup: (id: string, patch: Partial<Pick<Group, 'name' | 'elementIds'>>) => void
  deleteGroup: (id: string) => void

  // Relationship CRUD
  addRelationship: (sourceId: string, destinationId: string, description?: string, technology?: string) => string
  updateRelationship: (id: string, patch: Partial<Pick<Relationship, 'description' | 'technology' | 'interactionStyle' | 'lineStyle' | 'tags'>>) => void
  reconnectRelationship: (id: string, newSourceId: string, newTargetId: string) => void
  deleteRelationship: (id: string) => void

  // View management
  addView: (type: ViewType, scopeId?: string, title?: string) => string
  deleteView: (key: string) => void
  renameView: (key: string, title: string) => void
  updateNodePosition: (nodeId: string, x: number, y: number) => void
  updateNodePositions: (updates: { id: string; x: number; y: number }[]) => void

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
  setActiveTagFilter: (tag: string | null) => void
  setActiveStatusFilter: (status: ElementStatus | null) => void
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
  setPresentationMode: (on: boolean) => void
}

// ─── Internal Helpers ────────────────────────────────────────────────

/** Push current workspace to undo stack before mutation */
function pushUndo(s: WorkspaceState): Partial<UndoState> {
  if (!s.workspace) return {}
  const undoStack = [...s.undoStack, structuredClone(s.workspace)].slice(-MAX_UNDO)
  return { undoStack, redoStack: [] }
}

/** Clone workspace for safe mutation */
function cloneWs(s: WorkspaceState): Workspace | null {
  return s.workspace ? structuredClone(s.workspace) : null
}

/** Get flat array of all views */
export function allViewsOf(ws: Workspace): View[] {
  return [
    ...ws.views.systemLandscapeViews,
    ...ws.views.systemContextViews,
    ...ws.views.containerViews,
    ...ws.views.componentViews,
  ]
}

/** Find a view by key inside a (possibly cloned) workspace */
function findView(ws: Workspace, key: string): View | undefined {
  return allViewsOf(ws).find(v => v.key === key)
}

/** Iterate every element in the model tree. Callback receives the element.
 *  Return true from callback to stop early. */
function forEachElement(ws: Workspace, fn: (el: ModelElement) => boolean | void): void {
  for (const p of ws.model.people) { if (fn(p)) return }
  for (const sys of ws.model.softwareSystems) {
    if (fn(sys)) return
    for (const c of sys.containers) {
      if (fn(c)) return
      for (const comp of c.components) { if (fn(comp)) return }
    }
  }
}

/** Find an element by ID in the model tree */
function findElement(ws: Workspace, id: string): ModelElement | undefined {
  let found: ModelElement | undefined
  forEachElement(ws, (el) => { if (el.id === id) { found = el; return true } })
  return found
}

type ElementPatch = Partial<Pick<ModelElement, 'name' | 'description' | 'tags' | 'status' | 'owner' | 'url'>>
  & { location?: 'Internal' | 'External' | 'Unspecified'; technology?: string }

/** Apply a patch to an element in-place. Shared by updateElement and updateElementLive. */
function applyElementPatch(ws: Workspace, id: string, patch: ElementPatch): void {
  forEachElement(ws, (el) => {
    if (el.id !== id) return false
    if (patch.name !== undefined) el.name = patch.name
    if (patch.description !== undefined) el.description = patch.description
    if (patch.tags !== undefined) el.tags = patch.tags
    if (patch.status !== undefined) el.status = patch.status
    if (patch.owner !== undefined) el.owner = patch.owner
    if (patch.url !== undefined) el.url = patch.url
    if (patch.location !== undefined && (el.type === 'person' || el.type === 'softwareSystem')) {
      (el as Person | SoftwareSystem).location = patch.location
    }
    if (patch.technology !== undefined && (el.type === 'container' || el.type === 'component')) {
      (el as Container | Component).technology = patch.technology
    }
    return true
  })
}

/** The four view-type array keys — used wherever we need to iterate or locate views by type */
const VIEW_ARRAY_KEYS = ['systemLandscapeViews', 'systemContextViews', 'containerViews', 'componentViews'] as const

/** Apply a callback to every view in the workspace (mutates views in place) */
function forEachView(ws: Workspace, fn: (v: View) => void): void {
  for (const key of VIEW_ARRAY_KEYS) {
    for (const v of ws.views[key]) fn(v)
  }
}

/** Return a name that doesn't collide with any existing element name. */
function uniqueElementName(base: string, ws: Workspace): string {
  const taken = new Set<string>()
  forEachElement(ws, (el) => { taken.add(el.name) })
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

/** Add an element to the current view */
function addToCurrentView(ws: Workspace, activeViewKey: string | null, elementId: string, position?: { x: number; y: number }) {
  if (!activeViewKey) return
  const view = findView(ws, activeViewKey)
  if (view && !view.elements.some(e => e.id === elementId)) {
    view.elements.push({ id: elementId, x: position?.x, y: position?.y })
  }
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
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
  pendingDelete: null,
  lastSavedUndoLength: 0,
  setLastSavedUndoLength: (n) => set({ lastSavedUndoLength: n }),
  presentationMode: false,
  viewsPanelOpen: false,
  focusElementId: null,
  clearFocusElement: () => set({ focusElementId: null }),
  activeTagFilter: null,
  activeStatusFilter: null,
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
  revalidateScope: () => set(s => ({
    scopeViolations: s.workspace ? validateScope(s.workspace) : [],
  })),

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
      undoStack: [],
      redoStack: [],
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
      undoStack: [],
      redoStack: [],
    }),

  updateWorkspaceMeta: (patch) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    if (patch.name !== undefined) ws.name = patch.name
    if (patch.description !== undefined) ws.description = patch.description
    return { ...pushUndo(s), workspace: ws }
  }),

  // ─── Navigation ─────────────────────────────────────────────────

  setActiveView: (key) => set({ activeViewKey: key, selectedElementIds: [], selectedRelationshipId: null }),

  drillInto: (elementId) => set((s) => {
    if (!s.workspace || !s.activeViewKey) return s
    const childView = findChildView(s.workspace, elementId)
    if (!childView) return s
    // No-op if the "child" view is the one we're already on. This happens when
    // drilling on a system inside its own systemContext view and no container
    // view exists — findChildView falls back to the same systemContext view.
    if (childView.key === s.activeViewKey) return s
    return {
      activeViewKey: childView.key,
      viewHistory: [...s.viewHistory, s.activeViewKey],
      selectedElementIds: [],
      selectedRelationshipId: null,
    }
  }),

  navigateBack: () => set((s) => {
    if (s.viewHistory.length === 0) return s
    const history = [...s.viewHistory]
    const previous = history.pop()!
    return {
      activeViewKey: previous,
      viewHistory: history,
      selectedElementIds: [],
      selectedRelationshipId: null,
    }
  }),

  // ─── Selection ──────────────────────────────────────────────────

  selectElements: (ids) => set({ selectedElementIds: ids, selectedRelationshipId: null, selectedGroupId: null }),
  selectRelationship: (id) => set({ selectedRelationshipId: id, selectedElementIds: [], selectedGroupId: null }),
  selectGroup: (id) => set({ selectedGroupId: id, selectedElementIds: [], selectedRelationshipId: null }),
  clearSelection: () => set({ selectedElementIds: [], selectedRelationshipId: null, selectedGroupId: null }),

  // ─── Element CRUD ───────────────────────────────────────────────

  addPerson: (name, position, location) => {
    const id = nanoid(8)
    set((s) => {
      const ws = cloneWs(s)
      if (!ws) return s
      const person: Person = { id, type: 'person', name: uniqueElementName(name, ws), tags: ['Person'], properties: {}, location: location ?? 'Internal' }
      ws.model.people.push(person)
      addToCurrentView(ws, s.activeViewKey, id, position)
      return { ...pushUndo(s), workspace: ws, focusElementId: id, selectedElementIds: [id], selectedRelationshipId: null, selectedGroupId: null }
    })
    announce('Person created')
    return id
  },

  addSoftwareSystem: (name, position, location) => {
    const id = nanoid(8)
    set((s) => {
      const ws = cloneWs(s)
      if (!ws) return s
      const system: SoftwareSystem = { id, type: 'softwareSystem', name: uniqueElementName(name, ws), tags: ['Software System'], properties: {}, containers: [], location: location ?? 'Internal' }
      ws.model.softwareSystems.push(system)
      addToCurrentView(ws, s.activeViewKey, id, position)
      return { ...pushUndo(s), workspace: ws, focusElementId: id, selectedElementIds: [id], selectedRelationshipId: null, selectedGroupId: null }
    })
    get().revalidateScope()
    announce('System created')
    return id
  },

  addContainer: (systemId, name, position, extraTag) => {
    const id = nanoid(8)
    set((s) => {
      const ws = cloneWs(s)
      if (!ws) return s
      const system = ws.model.softwareSystems.find(sys => sys.id === systemId)
      if (!system) return s
      const tags = extraTag ? ['Container', extraTag] : ['Container']
      const container: Container = { id, type: 'container', name: uniqueElementName(name, ws), tags, properties: {}, components: [] }
      system.containers.push(container)
      addToCurrentView(ws, s.activeViewKey, id, position)
      return { ...pushUndo(s), workspace: ws, focusElementId: id, selectedElementIds: [id], selectedRelationshipId: null, selectedGroupId: null }
    })
    get().revalidateScope()
    announce('Container created')
    return id
  },

  addComponent: (containerId, name, position) => {
    const id = nanoid(8)
    set((s) => {
      const ws = cloneWs(s)
      if (!ws) return s
      for (const sys of ws.model.softwareSystems) {
        const container = sys.containers.find(c => c.id === containerId)
        if (container) {
          const comp: Component = { id, type: 'component', name: uniqueElementName(name, ws), tags: ['Component'], properties: {} }
          container.components.push(comp)
          addToCurrentView(ws, s.activeViewKey, id, position)
          return { ...pushUndo(s), workspace: ws, focusElementId: id, selectedElementIds: [id], selectedRelationshipId: null, selectedGroupId: null }
        }
      }
      return s
    })
    announce('Component created')
    return id
  },

  updateElement: (id, patch) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    applyElementPatch(ws, id, patch)
    return { ...pushUndo(s), workspace: ws }
  }),

  updateElementLive: (id, patch) => set((s) => {
    if (!s.workspace) return s
    // Shallow-clone workspace, deep-clone only the model for live typing perf
    const ws = { ...s.workspace, model: structuredClone(s.workspace.model) }
    applyElementPatch(ws, id, patch)
    return { workspace: ws } // no undo push
  }),

  updateElementTechnology: (id, technology) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    applyElementPatch(ws, id, { technology })
    return { ...pushUndo(s), workspace: ws }
  }),

  deleteElement: (id) => {
    // Delegate to batch implementation
    useWorkspaceStore.getState().deleteElements([id])
  },

  deleteElements: (ids) => {
    set((s) => {
      const ws = cloneWs(s)
      if (!ws) return s
      const idSet = new Set(ids)
      ws.model.people = ws.model.people.filter(p => !idSet.has(p.id))
      ws.model.softwareSystems = ws.model.softwareSystems.filter(sys => {
        if (idSet.has(sys.id)) return false
        sys.containers = sys.containers.filter(c => {
          if (idSet.has(c.id)) return false
          c.components = c.components.filter(comp => !idSet.has(comp.id))
          return true
        })
        return true
      })
      ws.model.relationships = ws.model.relationships.filter(
        r => !idSet.has(r.sourceId) && !idSet.has(r.destinationId)
      )
      const survivingRelIds = new Set(ws.model.relationships.map(r => r.id))
      forEachView(ws, (v) => {
        v.elements = v.elements.filter(e => !idSet.has(e.id))
        v.relationships = v.relationships.filter(r => survivingRelIds.has(r.id))
      })
      ws.model.groups = ws.model.groups.map(g => ({
        ...g,
        elementIds: g.elementIds.filter(eid => !idSet.has(eid)),
      }))
      return {
        ...pushUndo(s),
        workspace: ws,
        selectedElementIds: [],
        selectedRelationshipId: null,
      }
    })
    announce(ids.length === 1 ? 'Element deleted' : `${ids.length} elements deleted`)
  },

  // ─── Group CRUD ─────────────────────────────────────────────────

  addGroup: (name, elementIds = []) => {
    const id = nanoid(8)
    set((s) => {
      const ws = cloneWs(s)
      if (!ws) return s
      const group: Group = { id, name, elementIds }
      ws.model.groups.push(group)
      return { ...pushUndo(s), workspace: ws }
    })
    return id
  },

  updateGroup: (id, patch) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    const group = ws.model.groups.find(g => g.id === id)
    if (!group) return s
    if (patch.name !== undefined) group.name = patch.name
    if (patch.elementIds !== undefined) group.elementIds = patch.elementIds
    return { ...pushUndo(s), workspace: ws }
  }),

  deleteGroup: (id) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    ws.model.groups = ws.model.groups.filter(g => g.id !== id)
    return { ...pushUndo(s), workspace: ws, selectedGroupId: s.selectedGroupId === id ? null : s.selectedGroupId }
  }),

  // ─── Relationship CRUD ──────────────────────────────────────────

  addRelationship: (sourceId, destinationId, description, technology) => {
    const id = nanoid(8)
    set((s) => {
      const ws = cloneWs(s)
      if (!ws) return s
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
      // Add to current view
      if (s.activeViewKey) {
        const view = findView(ws, s.activeViewKey)
        if (view) view.relationships.push({ id })
      }
      return { ...pushUndo(s), workspace: ws, selectedRelationshipId: id, selectedElementIds: [] }
    })
    return id
  },

  updateRelationship: (id, patch) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    const rel = ws.model.relationships.find(r => r.id === id)
    if (rel) {
      if (patch.description !== undefined) rel.description = patch.description
      if (patch.technology !== undefined) rel.technology = patch.technology
      if (patch.interactionStyle !== undefined) rel.interactionStyle = patch.interactionStyle
      if (patch.lineStyle !== undefined) rel.lineStyle = patch.lineStyle
      if (patch.tags !== undefined) rel.tags = patch.tags
    }
    return { ...pushUndo(s), workspace: ws }
  }),

  reconnectRelationship: (id, newSourceId, newTargetId) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    const rel = ws.model.relationships.find(r => r.id === id)
    if (rel) {
      rel.sourceId = newSourceId
      rel.destinationId = newTargetId
    }
    return { ...pushUndo(s), workspace: ws }
  }),

  deleteRelationship: (id) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
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
      const view: View = {
        type,
        key,
        title: title ?? `New ${type} view`,
        elements: [],
        relationships: [],
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
      return { ...pushUndo(s), workspace: ws, activeViewKey: key }
    })
    return key
  },

  deleteView: (key) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    // Find which array contains the key and only filter that one
    for (const arrKey of VIEW_ARRAY_KEYS) {
      const idx = ws.views[arrKey].findIndex(v => v.key === key)
      if (idx !== -1) {
        ws.views[arrKey].splice(idx, 1)
        break
      }
    }
    const newActiveKey = s.activeViewKey === key ? getFirstViewKey(ws) : s.activeViewKey
    return { ...pushUndo(s), workspace: ws, activeViewKey: newActiveKey }
  }),

  renameView: (key, title) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    for (const arr of [ws.views.systemLandscapeViews, ws.views.systemContextViews, ws.views.containerViews, ws.views.componentViews] as { key: string; title?: string }[][]) {
      const v = arr.find(v => v.key === key)
      if (v) { v.title = title; break }
    }
    return { ...pushUndo(s), workspace: ws }
  }),

  updateNodePosition: (nodeId, x, y) => set((s) => {
    if (!s.workspace || !s.activeViewKey) return s
    // Shallow-clone only the view arrays and the affected view/element — avoids cloning entire workspace on every drag
    const ws = { ...s.workspace }
    ws.views = { ...ws.views }
    for (const key of VIEW_ARRAY_KEYS) {
      const idx = ws.views[key].findIndex(v => v.key === s.activeViewKey)
      if (idx === -1) continue
      ws.views[key] = [...ws.views[key]]
      const view = { ...ws.views[key][idx] }
      view.elements = view.elements.map(e =>
        e.id === nodeId ? { ...e, x, y, pinned: true } : e
      )
      ws.views[key][idx] = view
      break
    }
    // Don't push undo for every drag position — too noisy
    return { workspace: ws }
  }),

  updateNodePositions: (updates) => set((s) => {
    if (!s.workspace || !s.activeViewKey) return s
    const updateMap = new Map(updates.map(u => [u.id, u]))
    const ws = { ...s.workspace }
    ws.views = { ...ws.views }
    for (const key of VIEW_ARRAY_KEYS) {
      const idx = ws.views[key].findIndex(v => v.key === s.activeViewKey)
      if (idx === -1) continue
      ws.views[key] = [...ws.views[key]]
      const view = { ...ws.views[key][idx] }
      view.elements = view.elements.map(e => {
        const u = updateMap.get(e.id)
        return u ? { ...e, x: u.x, y: u.y, pinned: true } : e
      })
      ws.views[key][idx] = view
      break
    }
    return { workspace: ws }
  }),

  // ─── Undo / Redo ───────────────────────────────────────────────

  undo: () => {
    set((s) => {
      if (s.undoStack.length === 0 || !s.workspace) return s
      const undoStack = [...s.undoStack]
      const previous = undoStack.pop()!
      const redoStack = [...s.redoStack, structuredClone(s.workspace)]
      return { workspace: previous, undoStack, redoStack, selectedElementIds: [], selectedRelationshipId: null }
    })
    announce('Undone')
  },

  redo: () => {
    set((s) => {
      if (s.redoStack.length === 0 || !s.workspace) return s
      const redoStack = [...s.redoStack]
      const next = redoStack.pop()!
      const undoStack = [...s.undoStack, structuredClone(s.workspace)]
      return { workspace: next, undoStack, redoStack, selectedElementIds: [], selectedRelationshipId: null }
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
      view.elements.push({ id: elementId })
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

  setActiveTagFilter: (tag) => set({ activeTagFilter: tag }),
  setActiveStatusFilter: (status) => set({ activeStatusFilter: status }),
  updateElementStyle: (style) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    const styles = ws.views.configuration.styles.elements
    const idx = styles.findIndex((es) => es.tag === style.tag)
    if (idx >= 0) {
      styles[idx] = { ...styles[idx], ...style }
    } else {
      styles.push(style)
    }
    return { ...pushUndo(s), workspace: ws }
  }),
  removeElementStyle: (tag) => set((s) => {
    if (BUILTIN_TAGS.has(tag)) return s // Built-in tag styles cannot be removed
    const ws = cloneWs(s)
    if (!ws) return s
    ws.views.configuration.styles.elements = ws.views.configuration.styles.elements.filter((es) => es.tag !== tag)
    return { ...pushUndo(s), workspace: ws }
  }),
  renameTag: (oldTag, newTag) => set((s) => {
    if (!newTag.trim() || oldTag === newTag) return s
    const ws = cloneWs(s)
    if (!ws) return s
    forEachElement(ws, (el) => { el.tags = el.tags.map(t => t === oldTag ? newTag : t) })
    for (const rel of ws.model.relationships) { rel.tags = rel.tags.map(t => t === oldTag ? newTag : t) }
    const style = ws.views.configuration.styles.elements.find(es => es.tag === oldTag)
    if (style) style.tag = newTag
    return { ...pushUndo(s), workspace: ws }
  }),

  removeTagGlobal: (tag) => set((s) => {
    if (BUILTIN_TAGS.has(tag)) return s // Built-in tags cannot be removed
    const ws = cloneWs(s)
    if (!ws) return s
    forEachElement(ws, (el) => { el.tags = el.tags.filter(t => t !== tag) })
    for (const rel of ws.model.relationships) { rel.tags = rel.tags.filter(t => t !== tag) }
    ws.views.configuration.styles.elements = ws.views.configuration.styles.elements.filter(es => es.tag !== tag)
    return { ...pushUndo(s), workspace: ws }
  }),

  toggleMinimap: () => set((s) => ({ minimapEnabled: !s.minimapEnabled })),
  toggleSnapToGrid: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
  setMultiSelectMode: (on) => set({ multiSelectMode: on }),

  // ─── Views Panel ─────────────────────────────────────────────────

  setViewsPanelOpen: (open) => set({ viewsPanelOpen: open }),
  toggleViewsPanel: () => set((s) => ({ viewsPanelOpen: !s.viewsPanelOpen })),

  // ─── UI Toggles ─────────────────────────────────────────────────

  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setLeftPanelOpen: (open) => set({ leftPanelOpen: open }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open, commandPaletteOpen: false }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open, searchOpen: false }),
  confirmDelete: (message, onConfirm) => set({ pendingDelete: { message, onConfirm } }),
  cancelDelete: () => set({ pendingDelete: null }),
  setPresentationMode: (on) => set({ presentationMode: on }),
}))

// ─── Selectors ───────────────────────────────────────────────────────

function getFirstViewKey(workspace: Workspace): string | null {
  return allViewsOf(workspace)[0]?.key ?? null
}

export function getAllViews(workspace: Workspace): View[] {
  return allViewsOf(workspace)
}

export function getActiveView(workspace: Workspace, key: string): View | undefined {
  return findView(workspace, key)
}

export function buildElementMap(workspace: Workspace): Map<string, ModelElement> {
  const map = new Map<string, ModelElement>()
  forEachElement(workspace, (el) => { map.set(el.id, el) })
  return map
}

export function buildRelationshipMap(workspace: Workspace): Map<string, Relationship> {
  const map = new Map<string, Relationship>()
  for (const rel of workspace.model.relationships) {
    map.set(rel.id, rel)
  }
  return map
}

export function getSelectedElement(
  workspace: Workspace,
  selectedIds: string[],
): ModelElement | undefined {
  if (selectedIds.length === 0) return undefined
  return findElement(workspace, selectedIds[0])
}

export function getRelationshipById(
  workspace: Workspace,
  id: string,
): Relationship | undefined {
  return workspace.model.relationships.find(r => r.id === id)
}

function findChildView(workspace: Workspace, elementId: string, currentViewKey?: string | null): View | undefined {
  const element = findElement(workspace, elementId)
  if (!element) return undefined

  if (element.type === 'softwareSystem') {
    // Prefer a container view; only fall back to a systemContext view if it's
    // not the one the user is already on (otherwise drilling is a no-op and
    // creates duplicate keys in the breadcrumb).
    const container = workspace.views.containerViews.find(v => v.softwareSystemId === elementId)
    if (container) return container
    const context = workspace.views.systemContextViews.find(v => v.softwareSystemId === elementId)
    if (context && context.key !== currentViewKey) return context
    return undefined
  }
  if (element.type === 'container') {
    return workspace.views.componentViews.find(v => v.containerId === elementId)
  }
  return undefined
}

export function canDrillInto(workspace: Workspace, elementId: string): boolean {
  return findChildView(workspace, elementId) !== undefined
}

export function getBreadcrumb(workspace: Workspace, viewHistory: string[], activeViewKey: string | null): { key: string; label: string }[] {
  const trail: { key: string; label: string }[] = []
  for (const key of viewHistory) {
    const view = getActiveView(workspace, key)
    if (view) trail.push({ key, label: view.title ?? view.key })
  }
  if (activeViewKey) {
    const view = getActiveView(workspace, activeViewKey)
    if (view) trail.push({ key: activeViewKey, label: view.title ?? activeViewKey })
  }
  return trail
}

/** Determine what element types can be created in the current view context */
export function getCreatableTypes(workspace: Workspace, activeViewKey: string | null): {
  canCreatePerson: boolean
  canCreateSystem: boolean
  canCreateContainer: string | null // systemId if applicable
  canCreateComponent: string | null // containerId if applicable
} {
  const result = { canCreatePerson: false, canCreateSystem: false, canCreateContainer: null as string | null, canCreateComponent: null as string | null }
  if (!activeViewKey) return result
  const view = getActiveView(workspace, activeViewKey)
  if (!view) return result

  switch (view.type) {
    case 'systemLandscape':
      result.canCreatePerson = true
      result.canCreateSystem = true
      break
    case 'systemContext':
      result.canCreatePerson = true
      result.canCreateSystem = true
      break
    case 'container':
      result.canCreatePerson = true
      result.canCreateSystem = true
      result.canCreateContainer = view.softwareSystemId ?? null
      break
    case 'component':
      result.canCreateContainer = view.softwareSystemId ?? null
      result.canCreateComponent = view.containerId ?? null
      break
  }
  return result
}
