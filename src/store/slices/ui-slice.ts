import type { StateCreator } from 'zustand'
import type { Workspace } from '@/types/model'
import type { WorkspaceState } from '../workspace-types'
import { pushUndoSnapshot } from '../internals'

// Per-batch bookkeeping for setBatchApplying's no-op guard (single store instance).
let batchBaseWs: Workspace | null = null
let batchRedo: Workspace[] = []
let batchUndo: Workspace[] = []

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
  | 'aiPanelOpen' | 'aiPanelFeature' | 'setAiPanelOpen' | 'clearAiPanelFeature' | 'aiSettingsOpen' | 'setAiSettingsOpen'
  | 'aiPanelBusy' | 'setAiPanelBusy' | 'batchApplying' | 'setBatchApplying'
>

export const createUiSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  UiSlice
> = (set, get) => ({
  leftPanelOpen: true,
  rightPanelOpen: true,
  searchOpen: false,
  commandPaletteOpen: false,
  canvasSettingsOpen: false,
  aiPanelOpen: false,
  aiPanelFeature: null,
  aiSettingsOpen: false,
  // True while the assistant is mid-flow (interview/wizard/etc.) — selecting a
  // canvas node then must NOT close the panel and discard in-progress work.
  aiPanelBusy: false,
  // True only during an AI batch apply, so per-element view auto-switching is
  // suppressed (the panel navigates once afterwards instead of jumping per op).
  batchApplying: false,
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
  // The assistant lives in the bottom-left dock now, so opening it no longer
  // clears the selection / closes the inspector (they sit in different corners).
  setAiPanelOpen: (open, feature) => set((s) => {
    s.aiPanelOpen = open
    s.aiPanelFeature = open ? (feature ?? null) : null
    s.commandPaletteOpen = false
  }),
  setAiSettingsOpen: (open) => set((s) => {
    s.aiSettingsOpen = open
    s.commandPaletteOpen = false
    if (open) {
      s.aiPanelOpen = true
      s.aiPanelFeature = null
    }
  }),
  // Consume the one-shot deep-link feature (after the panel routes to it)
  // without closing the panel, so a stale feature can't fire again later.
  clearAiPanelFeature: () => set({ aiPanelFeature: null }),
  setAiPanelBusy: (busy) => set({ aiPanelBusy: busy }),
  setBatchApplying: (on) => {
    // Compare FINALIZED workspace refs across the batch (captured via get(), not
    // immer drafts — those are revoked between produce calls).
    if (on && !get().batchApplying) {
      // Snapshot the pre-apply state once when the batch begins; per-op snapshots
      // are then skipped, making the whole AI apply a single, reversible undo entry.
      // Capture BOTH stacks so a no-op batch restores exactly — popping the pushed
      // snapshot isn't enough, because at MAX_UNDO the up-front push also trims the
      // oldest entry, and that trimmed step would be lost.
      batchBaseWs = get().workspace ?? null
      batchRedo = get().redoStack.slice()
      batchUndo = get().undoStack.slice()
      set((s) => { pushUndoSnapshot(s); s.batchApplying = true })
    } else if (!on && get().batchApplying) {
      // If the batch changed nothing (all ops were no-ops/invalid), restore the
      // pre-batch undo/redo stacks — otherwise an AI apply or revert that did
      // nothing leaves a phantom undo entry (and may have trimmed a real one).
      const unchanged = get().workspace === batchBaseWs
      set((s) => {
        if (unchanged) { s.undoStack = batchUndo; s.redoStack = batchRedo }
        s.batchApplying = false
      })
      batchBaseWs = null; batchRedo = []; batchUndo = []
    } else {
      set((s) => { s.batchApplying = on })
    }
  },
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
