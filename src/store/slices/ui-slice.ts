import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'

/** Pure UI state: panel/dialog open flags, canvas-mode toggles, and the
 *  pending-delete confirmation. Holds no workspace data. */
export type UiSlice = Pick<WorkspaceState,
  | 'leftPanelOpen' | 'rightPanelOpen'
  | 'searchOpen' | 'commandPaletteOpen'
  | 'canvasSettingsOpen' | 'canvasGuideOpen' | 'addElementPanelOpen' | 'highlighterOpenFacet'
  | 'viewsPanelOpen' | 'createViewDialogOpen'
  | 'pendingDelete' | 'confirmDelete' | 'cancelDelete'
  | 'presentationMode' | 'setPresentationMode'
  | 'minimapEnabled' | 'snapToGrid' | 'toggleMinimap' | 'toggleSnapToGrid'
  | 'multiSelectMode' | 'setMultiSelectMode'
  | 'toggleLeftPanel' | 'toggleRightPanel'
  | 'setLeftPanelOpen' | 'setRightPanelOpen'
  | 'setSearchOpen' | 'setCommandPaletteOpen'
  | 'setCanvasSettingsOpen' | 'setCanvasGuideOpen' | 'setAddElementPanelOpen' | 'setHighlighterOpenFacet'
  | 'setViewsPanelOpen' | 'toggleViewsPanel'
  | 'setCreateViewDialogOpen'
  | 'aiPanelOpen' | 'aiPanelFeature' | 'setAiPanelOpen' | 'aiSettingsOpen' | 'setAiSettingsOpen'
>

export const createUiSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  UiSlice
> = (set) => ({
  leftPanelOpen: true,
  rightPanelOpen: true,
  searchOpen: false,
  commandPaletteOpen: false,
  canvasSettingsOpen: false,
  aiPanelOpen: false,
  aiPanelFeature: null,
  aiSettingsOpen: false,
  canvasGuideOpen: false,
  addElementPanelOpen: false,
  highlighterOpenFacet: null,
  viewsPanelOpen: false,
  createViewDialogOpen: false,
  pendingDelete: null,
  presentationMode: false,
  minimapEnabled: true,
  snapToGrid: false,
  multiSelectMode: false,

  toggleLeftPanel: () => set((s) => { s.leftPanelOpen = !s.leftPanelOpen }),
  toggleRightPanel: () => set((s) => { s.rightPanelOpen = !s.rightPanelOpen }),
  setLeftPanelOpen: (open) => set({ leftPanelOpen: open }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  // Mutually-exclusive panels: opening any non-Search/CommandPalette panel
  // closes the command palette so they don't stack.
  setSearchOpen: (open) => set({ searchOpen: open, commandPaletteOpen: false }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open, searchOpen: false }),
  setCanvasSettingsOpen: (open) => set({ canvasSettingsOpen: open, commandPaletteOpen: false }),
  setAiPanelOpen: (open, feature) => set({
    aiPanelOpen: open,
    aiPanelFeature: open ? (feature ?? null) : null,
    commandPaletteOpen: false,
  }),
  setAiSettingsOpen: (open) => set({ aiSettingsOpen: open, commandPaletteOpen: false }),
  setCanvasGuideOpen: (open) => set({ canvasGuideOpen: open, commandPaletteOpen: false }),
  setAddElementPanelOpen: (open) => set({ addElementPanelOpen: open, commandPaletteOpen: false }),
  setHighlighterOpenFacet: (facet) => set({ highlighterOpenFacet: facet, commandPaletteOpen: false }),
  setViewsPanelOpen: (open) => set({ viewsPanelOpen: open }),
  toggleViewsPanel: () => set((s) => { s.viewsPanelOpen = !s.viewsPanelOpen }),
  setCreateViewDialogOpen: (open) => set({ createViewDialogOpen: open, commandPaletteOpen: false }),

  toggleMinimap: () => set((s) => { s.minimapEnabled = !s.minimapEnabled }),
  toggleSnapToGrid: () => set((s) => { s.snapToGrid = !s.snapToGrid }),
  setMultiSelectMode: (on) => set({ multiSelectMode: on }),
  setPresentationMode: (on) => set({ presentationMode: on }),

  confirmDelete: (payload, onConfirm) => set({
    pendingDelete: typeof payload === 'string'
      ? { message: payload, onConfirm }
      : { message: payload.message, impact: payload.impact, onConfirm },
  }),
  cancelDelete: () => set({ pendingDelete: null }),
})
