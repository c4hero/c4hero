import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type {
  Workspace, ModelElement, Relationship, View, Group,
  Person, SoftwareSystem, Container, Component,
  ViewType,
} from '@/types/model'

// ─── Undo History ────────────────────────────────────────────────────

const MAX_UNDO = 50

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

  // UI
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  searchOpen: boolean
  presentationMode: boolean

  // Canvas settings
  activeTagFilter: string | null
  minimapEnabled: boolean
  snapToGrid: boolean

  // Workspace lifecycle
  loadWorkspace: (workspace: Workspace) => void
  closeWorkspace: () => void

  // Navigation
  setActiveView: (key: string) => void
  drillInto: (elementId: string) => void
  navigateBack: () => void

  // Selection
  selectElements: (ids: string[]) => void
  selectRelationship: (id: string) => void
  clearSelection: () => void

  // Element CRUD
  addPerson: (name: string, position?: { x: number; y: number }) => string
  addSoftwareSystem: (name: string, position?: { x: number; y: number }) => string
  addContainer: (systemId: string, name: string, position?: { x: number; y: number }) => string
  addComponent: (containerId: string, name: string, position?: { x: number; y: number }) => string
  updateElement: (id: string, patch: Partial<Pick<ModelElement, 'name' | 'description' | 'tags' | 'status' | 'owner' | 'url'>>) => void
  updateElementTechnology: (id: string, technology: string) => void
  deleteElement: (id: string) => void

  // Group CRUD
  addGroup: (name: string, elementIds?: string[]) => string
  deleteGroup: (id: string) => void

  // Relationship CRUD
  addRelationship: (sourceId: string, destinationId: string, description?: string, technology?: string) => string
  updateRelationship: (id: string, patch: Partial<Pick<Relationship, 'description' | 'technology' | 'interactionStyle' | 'lineStyle' | 'tags'>>) => void
  deleteRelationship: (id: string) => void

  // View management
  addView: (type: ViewType, scopeId?: string, title?: string) => string
  deleteView: (key: string) => void
  updateNodePosition: (nodeId: string, x: number, y: number) => void

  // Undo/Redo
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // View element management
  toggleElementInView: (viewKey: string, elementId: string) => void
  setLayoutDirection: (viewKey: string, direction: 'TB' | 'BT' | 'LR' | 'RL') => void

  // Canvas settings
  setActiveTagFilter: (tag: string | null) => void
  toggleMinimap: () => void
  toggleSnapToGrid: () => void

  // UI toggles
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  setLeftPanelOpen: (open: boolean) => void
  setRightPanelOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  setPresentationMode: (on: boolean) => void
}

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

/** Add an element to the current view */
function addToCurrentView(ws: Workspace, activeViewKey: string | null, elementId: string, position?: { x: number; y: number }) {
  if (!activeViewKey) return
  const allViews = [
    ...ws.views.systemLandscapeViews,
    ...ws.views.systemContextViews,
    ...ws.views.containerViews,
    ...ws.views.componentViews,
  ]
  const view = allViews.find(v => v.key === activeViewKey)
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
  leftPanelOpen: true,
  rightPanelOpen: true,
  searchOpen: false,
  presentationMode: false,
  activeTagFilter: null,
  minimapEnabled: true,
  snapToGrid: false,
  undoStack: [],
  redoStack: [],

  // ─── Workspace Lifecycle ────────────────────────────────────────

  loadWorkspace: (workspace) => {
    const firstView = getFirstViewKey(workspace)
    set({
      workspace,
      activeViewKey: firstView,
      viewHistory: [],
      selectedElementIds: [],
      selectedRelationshipId: null,
      undoStack: [],
      redoStack: [],
    })
  },

  closeWorkspace: () =>
    set({
      workspace: null,
      activeViewKey: null,
      viewHistory: [],
      selectedElementIds: [],
      selectedRelationshipId: null,
      undoStack: [],
      redoStack: [],
    }),

  // ─── Navigation ─────────────────────────────────────────────────

  setActiveView: (key) => set({ activeViewKey: key, selectedElementIds: [], selectedRelationshipId: null }),

  drillInto: (elementId) => set((s) => {
    if (!s.workspace || !s.activeViewKey) return s
    const childView = findChildView(s.workspace, elementId)
    if (!childView) return s
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

  selectElements: (ids) => set({ selectedElementIds: ids, selectedRelationshipId: null }),
  selectRelationship: (id) => set({ selectedRelationshipId: id, selectedElementIds: [] }),
  clearSelection: () => set({ selectedElementIds: [], selectedRelationshipId: null }),

  // ─── Element CRUD ───────────────────────────────────────────────

  addPerson: (name, position) => {
    const id = nanoid(8)
    set((s) => {
      const ws = cloneWs(s)
      if (!ws) return s
      const person: Person = { id, type: 'person', name, tags: ['Person'], properties: {} }
      ws.model.people.push(person)
      addToCurrentView(ws, s.activeViewKey, id, position)
      return { ...pushUndo(s), workspace: ws, selectedElementIds: [id], selectedRelationshipId: null }
    })
    return id
  },

  addSoftwareSystem: (name, position) => {
    const id = nanoid(8)
    set((s) => {
      const ws = cloneWs(s)
      if (!ws) return s
      const system: SoftwareSystem = { id, type: 'softwareSystem', name, tags: ['Software System'], properties: {}, containers: [] }
      ws.model.softwareSystems.push(system)
      addToCurrentView(ws, s.activeViewKey, id, position)
      return { ...pushUndo(s), workspace: ws, selectedElementIds: [id], selectedRelationshipId: null }
    })
    return id
  },

  addContainer: (systemId, name, position) => {
    const id = nanoid(8)
    set((s) => {
      const ws = cloneWs(s)
      if (!ws) return s
      const system = ws.model.softwareSystems.find(sys => sys.id === systemId)
      if (!system) return s
      const container: Container = { id, type: 'container', name, tags: ['Container'], properties: {}, components: [] }
      system.containers.push(container)
      addToCurrentView(ws, s.activeViewKey, id, position)
      return { ...pushUndo(s), workspace: ws, selectedElementIds: [id], selectedRelationshipId: null }
    })
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
          const comp: Component = { id, type: 'component', name, tags: ['Component'], properties: {} }
          container.components.push(comp)
          addToCurrentView(ws, s.activeViewKey, id, position)
          return { ...pushUndo(s), workspace: ws, selectedElementIds: [id], selectedRelationshipId: null }
        }
      }
      return s
    })
    return id
  },

  updateElement: (id, patch) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    const update = (el: ModelElement) => {
      if (el.id !== id) return false
      if (patch.name !== undefined) el.name = patch.name
      if (patch.description !== undefined) el.description = patch.description
      if (patch.tags !== undefined) el.tags = patch.tags
      if (patch.status !== undefined) el.status = patch.status
      if (patch.owner !== undefined) el.owner = patch.owner
      if (patch.url !== undefined) el.url = patch.url
      return true
    }
    for (const p of ws.model.people) { if (update(p)) break }
    for (const sys of ws.model.softwareSystems) {
      if (update(sys)) break
      for (const c of sys.containers) {
        if (update(c)) break
        for (const comp of c.components) { if (update(comp)) break }
      }
    }
    return { ...pushUndo(s), workspace: ws }
  }),

  updateElementTechnology: (id, technology) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    for (const sys of ws.model.softwareSystems) {
      for (const c of sys.containers) {
        if (c.id === id) { c.technology = technology; return { ...pushUndo(s), workspace: ws } }
        for (const comp of c.components) {
          if (comp.id === id) { comp.technology = technology; return { ...pushUndo(s), workspace: ws } }
        }
      }
    }
    return s
  }),

  deleteElement: (id) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    // Remove from people
    ws.model.people = ws.model.people.filter(p => p.id !== id)
    // Remove from systems (and their containers/components)
    ws.model.softwareSystems = ws.model.softwareSystems.filter(sys => {
      if (sys.id === id) return false
      sys.containers = sys.containers.filter(c => {
        if (c.id === id) return false
        c.components = c.components.filter(comp => comp.id !== id)
        return true
      })
      return true
    })
    // Remove related relationships
    ws.model.relationships = ws.model.relationships.filter(
      r => r.sourceId !== id && r.destinationId !== id
    )
    // Remove from all views
    const removeFromViews = (views: View[]) => {
      for (const v of views) {
        v.elements = v.elements.filter(e => e.id !== id)
        v.relationships = v.relationships.filter(r => {
          const rel = ws.model.relationships.find(mr => mr.id === r.id)
          return rel !== undefined
        })
      }
    }
    removeFromViews(ws.views.systemLandscapeViews)
    removeFromViews(ws.views.systemContextViews)
    removeFromViews(ws.views.containerViews)
    removeFromViews(ws.views.componentViews)
    return {
      ...pushUndo(s),
      workspace: ws,
      selectedElementIds: s.selectedElementIds.filter(eid => eid !== id),
      selectedRelationshipId: null,
    }
  }),

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

  deleteGroup: (id) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    ws.model.groups = ws.model.groups.filter(g => g.id !== id)
    return { ...pushUndo(s), workspace: ws }
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
        const allViews = [
          ...ws.views.systemLandscapeViews,
          ...ws.views.systemContextViews,
          ...ws.views.containerViews,
          ...ws.views.componentViews,
        ]
        const view = allViews.find(v => v.key === s.activeViewKey)
        if (view) {
          view.relationships.push({ id })
        }
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

  deleteRelationship: (id) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    ws.model.relationships = ws.model.relationships.filter(r => r.id !== id)
    // Remove from all views
    const removeFromViews = (views: View[]) => {
      for (const v of views) {
        v.relationships = v.relationships.filter(r => r.id !== id)
      }
    }
    removeFromViews(ws.views.systemLandscapeViews)
    removeFromViews(ws.views.systemContextViews)
    removeFromViews(ws.views.containerViews)
    removeFromViews(ws.views.componentViews)
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
    ws.views.systemLandscapeViews = ws.views.systemLandscapeViews.filter(v => v.key !== key)
    ws.views.systemContextViews = ws.views.systemContextViews.filter(v => v.key !== key)
    ws.views.containerViews = ws.views.containerViews.filter(v => v.key !== key)
    ws.views.componentViews = ws.views.componentViews.filter(v => v.key !== key)
    const newActiveKey = s.activeViewKey === key ? getFirstViewKey(ws) : s.activeViewKey
    return { ...pushUndo(s), workspace: ws, activeViewKey: newActiveKey }
  }),

  updateNodePosition: (nodeId, x, y) => set((s) => {
    if (!s.workspace || !s.activeViewKey) return s
    const ws = structuredClone(s.workspace)
    const allViews = [
      ...ws.views.systemLandscapeViews,
      ...ws.views.systemContextViews,
      ...ws.views.containerViews,
      ...ws.views.componentViews,
    ]
    const view = allViews.find(v => v.key === s.activeViewKey)
    if (view) {
      const el = view.elements.find(e => e.id === nodeId)
      if (el) { el.x = x; el.y = y; el.pinned = true }
    }
    // Don't push undo for every drag position — too noisy
    return { workspace: ws }
  }),

  // ─── Undo / Redo ───────────────────────────────────────────────

  undo: () => set((s) => {
    if (s.undoStack.length === 0 || !s.workspace) return s
    const undoStack = [...s.undoStack]
    const previous = undoStack.pop()!
    const redoStack = [...s.redoStack, structuredClone(s.workspace)]
    return { workspace: previous, undoStack, redoStack, selectedElementIds: [], selectedRelationshipId: null }
  }),

  redo: () => set((s) => {
    if (s.redoStack.length === 0 || !s.workspace) return s
    const redoStack = [...s.redoStack]
    const next = redoStack.pop()!
    const undoStack = [...s.undoStack, structuredClone(s.workspace)]
    return { workspace: next, undoStack, redoStack, selectedElementIds: [], selectedRelationshipId: null }
  }),

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  // ─── View Element Management ────────────────────────────────────

  toggleElementInView: (viewKey, elementId) => set((s) => {
    const ws = cloneWs(s)
    if (!ws) return s
    const allViews = [
      ...ws.views.systemLandscapeViews,
      ...ws.views.systemContextViews,
      ...ws.views.containerViews,
      ...ws.views.componentViews,
    ]
    const view = allViews.find(v => v.key === viewKey)
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
    const allViews = [
      ...ws.views.systemLandscapeViews,
      ...ws.views.systemContextViews,
      ...ws.views.containerViews,
      ...ws.views.componentViews,
    ]
    const view = allViews.find(v => v.key === viewKey)
    if (!view) return s
    view.autoLayout = { ...view.autoLayout, direction }
    // Reset positions and pinned flags to trigger full re-layout
    for (const el of view.elements) {
      el.x = undefined
      el.y = undefined
      el.pinned = undefined
    }
    return { ...pushUndo(s), workspace: ws }
  }),

  // ─── Canvas Settings ──────────────────────────────────────────

  setActiveTagFilter: (tag) => set({ activeTagFilter: tag }),
  toggleMinimap: () => set((s) => ({ minimapEnabled: !s.minimapEnabled })),
  toggleSnapToGrid: () => set((s) => ({ snapToGrid: !s.snapToGrid })),

  // ─── UI Toggles ─────────────────────────────────────────────────

  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setLeftPanelOpen: (open) => set({ leftPanelOpen: open }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setPresentationMode: (on) => set({ presentationMode: on }),
}))

// ─── Selectors ───────────────────────────────────────────────────────

function getFirstViewKey(workspace: Workspace): string | null {
  const allViews = getAllViews(workspace)
  return allViews[0]?.key ?? null
}

export function getAllViews(workspace: Workspace): View[] {
  return [
    ...workspace.views.systemLandscapeViews,
    ...workspace.views.systemContextViews,
    ...workspace.views.containerViews,
    ...workspace.views.componentViews,
  ]
}

export function getActiveView(workspace: Workspace, key: string): View | undefined {
  return getAllViews(workspace).find((v) => v.key === key)
}

export function buildElementMap(workspace: Workspace): Map<string, ModelElement> {
  const map = new Map<string, ModelElement>()
  for (const person of workspace.model.people) {
    map.set(person.id, person)
  }
  for (const system of workspace.model.softwareSystems) {
    map.set(system.id, system)
    for (const container of system.containers) {
      map.set(container.id, container)
      for (const component of container.components) {
        map.set(component.id, component)
      }
    }
  }
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
  const map = buildElementMap(workspace)
  return map.get(selectedIds[0])
}

export function getRelationshipById(
  workspace: Workspace,
  id: string,
): Relationship | undefined {
  return workspace.model.relationships.find(r => r.id === id)
}

function findChildView(workspace: Workspace, elementId: string): View | undefined {
  const elementMap = buildElementMap(workspace)
  const element = elementMap.get(elementId)
  if (!element) return undefined

  if (element.type === 'softwareSystem') {
    return workspace.views.containerViews.find(v => v.softwareSystemId === elementId)
      ?? workspace.views.systemContextViews.find(v => v.softwareSystemId === elementId)
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
