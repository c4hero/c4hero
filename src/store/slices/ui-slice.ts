import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'

/** Pure UI state: panel/dialog open flags, canvas-mode toggles, and the
 *  pending-delete confirmation. Holds no workspace data. */
export type UiSlice = Pick<WorkspaceState,
  | 'leftPanelOpen' | 'rightPanelOpen'
  | 'searchOpen' | 'commandPaletteOpen'
  | 'canvasSettingsOpen' | 'addElementPanelOpen' | 'highlighterPanelOpen'
  | 'viewsPanelOpen' | 'createViewDialogOpen'
  | 'pendingDelete' | 'confirmDelete' | 'cancelDelete'
  | 'presentationMode' | 'setPresentationMode'
  | 'minimapEnabled' | 'snapToGrid' | 'toggleMinimap' | 'toggleSnapToGrid'
  | 'multiSelectMode' | 'setMultiSelectMode'
  | 'toggleLeftPanel' | 'toggleRightPanel'
  | 'setLeftPanelOpen' | 'setRightPanelOpen'
  | 'setSearchOpen' | 'setCommandPaletteOpen'
  | 'setCanvasSettingsOpen' | 'setAddElementPanelOpen' | 'setHighlighterPanelOpen'
  | 'setViewsPanelOpen' | 'toggleViewsPanel'
  | 'setCreateViewDialogOpen'
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
  addElementPanelOpen: false,
  highlighterPanelOpen: false,
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
  setAddElementPanelOpen: (open) => set({ addElementPanelOpen: open, commandPaletteOpen: false }),
  setHighlighterPanelOpen: (open) => set({ highlighterPanelOpen: open, commandPaletteOpen: false }),
  setViewsPanelOpen: (open) => set({ viewsPanelOpen: open }),
  toggleViewsPanel: () => set((s) => { s.viewsPanelOpen = !s.viewsPanelOpen }),
  setCreateViewDialogOpen: (open) => set({ createViewDialogOpen: open, commandPaletteOpen: false }),

  toggleMinimap: () => set((s) => { s.minimapEnabled = !s.minimapEnabled }),
  toggleSnapToGrid: () => set((s) => { s.snapToGrid = !s.snapToGrid }),
  setMultiSelectMode: (on) => set({ multiSelectMode: on }),
  setPresentationMode: (on) => set({ presentationMode: on }),

  confirmDelete: (message, onConfirm) => set({ pendingDelete: { message, onConfirm } }),
  cancelDelete: () => set({ pendingDelete: null }),
})
