import type { LucideIcon } from 'lucide-react'
import {
  UserRound, Globe, Box, Puzzle, Layers, Undo2, Redo2, Trash2,
  MousePointer, LayoutDashboard, Maximize2, ZoomIn, ZoomOut,
  LayoutGrid, Search, Save, Settings, Monitor,
  Presentation, FolderOpen, Image, FileCode, Copy, Plus,
  Highlighter, MousePointerClick, RotateCcw, CircleHelp, Sparkles,
} from 'lucide-react'
import { useWorkspaceStore, getCreatableTypes, getActiveView, getAllViews, isFocalScopeElement } from '@/store/workspace'
import { computeCascadeImpact } from '@/store/workspace-helpers'
import { formatImpactSummary } from '@/lib/impactMessage'
import { serializeDSL } from '@/lib/dsl'
import { saveDSLFile, writeSidecarToHandle } from '@/lib/fileIO'
import { downloadFile, downloadBlob, exportCanvasAsPNG, exportCanvasAsSVG } from '@/lib/exportUtils'
import { extractSidecar, serializeSidecar } from '@/lib/sidecar'
import { fitContentNodesToViewport } from '@/lib/fitViewport'
import type { ReactFlowInstance } from '@xyflow/react'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl+'

export interface Command {
  id: string
  label: string
  category: 'create' | 'edit' | 'view' | 'export' | 'navigation' | 'ai'
  icon: LucideIcon
  shortcut?: string
  keywords?: string[]
  when?: () => boolean
  execute: () => void | Promise<void>
}

export function getCommands(reactFlow: ReactFlowInstance | null): Command[] {
  const store = () => useWorkspaceStore.getState()

  const commands: Command[] = [
    // ─── Create ──────────────────────────────────────────
    {
      id: 'add-person',
      label: 'Add Person',
      category: 'create',
      icon: UserRound,
      shortcut: '⇧P',
      keywords: ['new', 'person', 'user', 'actor'],
      when: () => {
        const s = store()
        return !!s.workspace && getCreatableTypes(s.workspace, s.activeViewKey).canCreatePerson
      },
      execute: () => { store().addPerson('New Person') },
    },
    {
      id: 'add-system',
      label: 'Add Software System',
      category: 'create',
      icon: Globe,
      shortcut: '⇧S',
      keywords: ['new', 'system', 'software'],
      when: () => {
        const s = store()
        return !!s.workspace && getCreatableTypes(s.workspace, s.activeViewKey).canCreateSystem
      },
      execute: () => { store().addSoftwareSystem('New System') },
    },
    {
      id: 'add-container',
      label: 'Add Container',
      category: 'create',
      icon: Box,
      shortcut: '⇧C',
      keywords: ['new', 'container', 'service', 'database'],
      when: () => {
        const s = store()
        return !!s.workspace && getCreatableTypes(s.workspace, s.activeViewKey).canCreateContainer !== null
      },
      execute: () => {
        const s = store()
        if (!s.workspace) return
        const ct = getCreatableTypes(s.workspace, s.activeViewKey)
        if (ct.canCreateContainer) s.addContainer(ct.canCreateContainer, 'New Container')
      },
    },
    {
      id: 'add-component',
      label: 'Add Component',
      category: 'create',
      icon: Puzzle,
      shortcut: '⇧O',
      keywords: ['new', 'component', 'module'],
      when: () => {
        const s = store()
        return !!s.workspace && getCreatableTypes(s.workspace, s.activeViewKey).canCreateComponent !== null
      },
      execute: () => {
        const s = store()
        if (!s.workspace) return
        const ct = getCreatableTypes(s.workspace, s.activeViewKey)
        if (ct.canCreateComponent) s.addComponent(ct.canCreateComponent, 'New Component')
      },
    },
    {
      id: 'group-selected',
      label: 'Group Selected Elements',
      category: 'create',
      icon: Layers,
      shortcut: '⇧G',
      keywords: ['group', 'combine'],
      when: () => store().selectedElementIds.length >= 2,
      execute: () => {
        const s = store()
        s.addGroup('New Group', s.selectedElementIds)
      },
    },

    // ─── Edit ────────────────────────────────────────────
    {
      id: 'undo',
      label: 'Undo',
      category: 'edit',
      icon: Undo2,
      shortcut: `${mod}Z`,
      when: () => store().canUndo(),
      execute: () => store().undo(),
    },
    {
      id: 'redo',
      label: 'Redo',
      category: 'edit',
      icon: Redo2,
      shortcut: `${mod}⇧Z`,
      when: () => store().canRedo(),
      execute: () => store().redo(),
    },
    {
      id: 'duplicate-selected',
      label: 'Duplicate Selected',
      category: 'edit',
      icon: Copy,
      shortcut: `${mod}D`,
      keywords: ['duplicate', 'copy', 'clone'],
      when: () => store().selectedElementIds.length > 0,
      execute: () => { store().duplicateElements(store().selectedElementIds) },
    },
    {
      id: 'delete-selected',
      label: 'Delete Selected from model',
      category: 'edit',
      icon: Trash2,
      shortcut: '⇧⌫',
      keywords: ['remove', 'delete'],
      when: () => store().selectedElementIds.length > 0 || store().selectedRelationshipId !== null,
      execute: () => {
        const s = store()
        if (s.selectedRelationshipId) {
          s.confirmDelete('Delete this relationship?', () => s.deleteRelationship(s.selectedRelationshipId!))
          return
        }
        if (!s.workspace || !s.activeViewKey) return
        const ids = s.selectedElementIds.filter(
          (id) => !isFocalScopeElement(s.workspace!, s.activeViewKey!, id),
        )
        if (ids.length === 0) return
        const impact = computeCascadeImpact(s.workspace, ids)
        s.confirmDelete(
          { message: formatImpactSummary(impact), impact },
          () => s.deleteElements(ids),
        )
      },
    },
    {
      id: 'select-all',
      label: 'Select All',
      category: 'edit',
      icon: MousePointer,
      shortcut: `${mod}A`,
      keywords: ['select', 'all'],
      when: () => {
        const s = store()
        if (!s.workspace || !s.activeViewKey) return false
        const view = getActiveView(s.workspace, s.activeViewKey)
        return !!view && view.elements.length > 0
      },
      execute: () => {
        const s = store()
        if (!s.workspace || !s.activeViewKey) return
        const view = getActiveView(s.workspace, s.activeViewKey)
        if (view) s.selectElements(view.elements.map(e => e.id))
      },
    },

    // ─── View ────────────────────────────────────────────
    {
      id: 'zoom-to-fit',
      label: 'Zoom to Fit',
      category: 'view',
      icon: Maximize2,
      shortcut: '0',
      keywords: ['fit', 'zoom', 'reset'],
      execute: () => { fitContentNodesToViewport(reactFlow) },
    },
    {
      id: 'zoom-in',
      label: 'Zoom In',
      category: 'view',
      icon: ZoomIn,
      shortcut: '+',
      execute: () => { reactFlow?.zoomIn({ duration: 200 }) },
    },
    {
      id: 'zoom-out',
      label: 'Zoom Out',
      category: 'view',
      icon: ZoomOut,
      shortcut: '−',
      execute: () => { reactFlow?.zoomOut({ duration: 200 }) },
    },
    {
      id: 'auto-arrange',
      label: 'Auto-Arrange',
      category: 'view',
      icon: LayoutDashboard,
      keywords: ['layout', 'arrange', 'organize'],
      shortcut: `${mod}⇧L`,
      when: () => !!store().activeViewKey,
      execute: () => {
        const s = store()
        if (!s.activeViewKey) return
        s.resetAndRelayout(s.activeViewKey)
        setTimeout(() => fitContentNodesToViewport(reactFlow), 120)
      },
    },
    {
      id: 'toggle-highlighter',
      label: 'Toggle Highlighter',
      category: 'view',
      icon: Highlighter,
      shortcut: 'H',
      keywords: ['filter', 'highlight', 'tag', 'tech', 'team', 'status'],
      when: () => !!store().workspace,
      execute: () => {
        const s = store()
        s.setHighlighterOpenFacet(s.highlighterOpenFacet ? null : 'tags')
      },
    },
    {
      id: 'restore-cleared-highlight-filters',
      label: 'Restore Highlighter Filters from Previous View',
      category: 'view',
      icon: RotateCcw,
      keywords: ['restore', 'highlight', 'filter', 'previous', 'undo'],
      when: () => !!store().lastClearedHighlightFilters,
      execute: () => store().restoreHighlightFilters(),
    },
    {
      id: 'toggle-multi-select',
      label: 'Toggle Multi-Select Mode',
      category: 'edit',
      icon: MousePointerClick,
      shortcut: 'M',
      keywords: ['multi', 'select', 'tap', 'multiple'],
      when: () => !!store().workspace,
      execute: () => store().setMultiSelectMode(!store().multiSelectMode),
    },
    {
      id: 'toggle-views-panel',
      label: 'Toggle Views Panel',
      category: 'view',
      icon: LayoutGrid,
      keywords: ['views', 'panel', 'sidebar'],
      execute: () => store().toggleViewsPanel(),
    },
    {
      id: 'new-view',
      label: 'New View',
      category: 'view',
      icon: Plus,
      keywords: ['create', 'add', 'view', 'diagram', 'new'],
      when: () => !!store().workspace,
      execute: () => store().setCreateViewDialogOpen(true),
    },
    {
      id: 'duplicate-view',
      label: 'Duplicate Current View',
      category: 'view',
      icon: Copy,
      keywords: ['duplicate', 'clone', 'copy', 'view'],
      when: () => !!store().workspace && !!store().activeViewKey,
      execute: () => {
        const s = store()
        if (s.activeViewKey) s.duplicateView(s.activeViewKey)
      },
    },
    {
      id: 'toggle-minimap',
      label: 'Toggle Minimap',
      category: 'view',
      icon: Monitor,
      keywords: ['minimap', 'overview'],
      execute: () => store().toggleMinimap(),
    },
    {
      id: 'toggle-snap-to-grid',
      label: 'Toggle Snap to Grid',
      category: 'view',
      icon: LayoutDashboard,
      keywords: ['snap', 'grid', 'align'],
      execute: () => store().toggleSnapToGrid(),
    },
    {
      id: 'presentation-mode',
      label: 'Presentation Mode',
      category: 'view',
      icon: Presentation,
      shortcut: 'P',
      keywords: ['fullscreen', 'present', 'focus'],
      execute: () => {
        const s = store()
        s.setPresentationMode(!s.presentationMode)
      },
    },
    {
      id: 'canvas-settings',
      label: 'Canvas Settings',
      category: 'view',
      icon: Settings,
      keywords: ['settings', 'preferences', 'config'],
      execute: () => { store().setCanvasSettingsOpen(true) },
    },
    {
      id: 'canvas-guide',
      label: 'Canvas Guide',
      category: 'view',
      icon: CircleHelp,
      keywords: ['help', 'tutorial', 'walkthrough', 'how to', 'getting started'],
      when: () => !!store().workspace,
      execute: () => { store().setCanvasGuideOpen(true) },
    },

    // ─── Navigation ──────────────────────────────────────
    {
      id: 'open-search',
      label: 'Search Elements & Views',
      category: 'navigation',
      icon: Search,
      shortcut: `${mod}F`,
      keywords: ['search', 'find', 'filter'],
      execute: () => store().setSearchOpen(true),
    },
    {
      id: 'navigate-back',
      label: 'Navigate Back',
      category: 'navigation',
      icon: FolderOpen,
      keywords: ['back', 'previous', 'parent'],
      when: () => store().viewHistory.length > 0,
      execute: () => store().navigateBack(),
    },
    {
      id: 'close-workspace',
      label: 'Close Workspace',
      category: 'navigation',
      icon: FolderOpen,
      keywords: ['close', 'home', 'welcome'],
      execute: () => store().closeWorkspace(),
    },

    // ─── Export ──────────────────────────────────────────
    {
      id: 'save',
      label: 'Save',
      category: 'export',
      icon: Save,
      shortcut: `${mod}S`,
      keywords: ['save', 'write'],
      execute: async () => {
        const s = store()
        if (!s.workspace) return
        const dsl = serializeDSL(s.workspace)
        await saveDSLFile(dsl, `${s.workspace.name ?? 'workspace'}.dsl`)
        const sidecar = extractSidecar(s.workspace)
        if (sidecar) writeSidecarToHandle(serializeSidecar(sidecar))
      },
    },
    {
      id: 'export-dsl',
      label: 'Export as Structurizr DSL',
      category: 'export',
      icon: FileCode,
      keywords: ['export', 'dsl', 'structurizr'],
      execute: async () => {
        const s = store()
        if (!s.workspace) return
        await saveDSLFile(serializeDSL(s.workspace), `${s.workspace.name ?? 'workspace'}.dsl`)
      },
    },
    {
      id: 'export-png',
      label: 'Export as PNG',
      category: 'export',
      icon: Image,
      keywords: ['export', 'png', 'image', 'screenshot'],
      execute: async () => {
        const s = store()
        if (!s.workspace) return
        const blob = await exportCanvasAsPNG()
        if (blob) downloadBlob(blob, `${s.workspace.name ?? 'workspace'}.png`)
      },
    },
    {
      id: 'export-svg',
      label: 'Export as SVG',
      category: 'export',
      icon: Image,
      keywords: ['export', 'svg', 'vector'],
      execute: () => {
        const s = store()
        if (!s.workspace) return
        const svg = exportCanvasAsSVG()
        if (svg) downloadFile(svg, `${s.workspace.name ?? 'workspace'}.svg`, 'image/svg+xml')
      },
    },
  ]

  // ─── AI assistant (BYOK) ───────────────────────────────
  commands.push(
    {
      id: 'ai-compose',
      label: 'AI: Describe — build or change the model…',
      category: 'ai',
      icon: Sparkles,
      keywords: ['ai', 'describe', 'generate', 'create', 'edit', 'change', 'modify', 'prompt'],
      execute: () => store().setAiPanelOpen(true, 'compose'),
    },
    {
      id: 'ai-interview',
      label: 'AI: Interview me about this view…',
      category: 'ai',
      icon: Sparkles,
      keywords: ['ai', 'interview', 'questions', 'voice', 'fill', 'gather'],
      when: () => !!store().workspace,
      execute: () => store().setAiPanelOpen(true, 'interview'),
    },
    {
      id: 'ai-review',
      label: 'AI: Review & tidy up the model…',
      category: 'ai',
      icon: Sparkles,
      keywords: ['ai', 'review', 'critique', 'feedback', 'audit', 'describe', 'tidy', 'fix'],
      when: () => !!store().workspace,
      execute: () => store().setAiPanelOpen(true, 'review'),
    },
    {
      id: 'ai-adr',
      label: 'AI: Draft ADR…',
      category: 'ai',
      icon: Sparkles,
      keywords: ['ai', 'adr', 'decision', 'record', 'document'],
      execute: () => store().setAiPanelOpen(true, 'adr'),
    },
    {
      id: 'ai-settings',
      label: 'AI: Settings…',
      category: 'ai',
      icon: Settings,
      keywords: ['ai', 'settings', 'api key', 'byok', 'anthropic', 'model'],
      execute: () => store().setAiSettingsOpen(true),
    },
  )

  // ─── Dynamic view navigation commands ──────────────────
  const s = store()
  if (s.workspace) {
    for (const view of getAllViews(s.workspace)) {
      commands.push({
        id: `view-${view.key}`,
        label: `Go to: ${view.title ?? view.key}`,
        category: 'navigation',
        icon: LayoutGrid,
        keywords: ['view', 'navigate', 'switch', view.type],
        when: () => store().activeViewKey !== view.key,
        execute: () => store().setActiveView(view.key),
      })
    }
  }

  return commands
}

const CATEGORY_ORDER: Command['category'][] = ['ai', 'create', 'edit', 'view', 'navigation', 'export']
const CATEGORY_LABELS: Record<Command['category'], string> = {
  ai: 'AI',
  create: 'Create',
  edit: 'Edit',
  view: 'View',
  navigation: 'Navigation',
  export: 'Export',
}

export { CATEGORY_ORDER, CATEGORY_LABELS }
