import { lazy, Suspense, useEffect, useState, useCallback } from 'react'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import LoadingDot from '@/components/shared/LoadingDot'
import { useWorkspaceStore, getAllViews } from '@/store/workspace'
import { downloadFile, downloadBlob, exportCanvasAsPNG, exportCanvasAsSVG, copyCanvasAsPNG, copyTextToClipboard, type ExportTheme } from '@/lib/exportUtils'
import { serializeDSL } from '@/lib/dsl'
import { createBlankWorkspace } from '@/lib/templates'
import { saveDSLFile } from '@/lib/fileIO'
import { announce } from '@/lib/announce'
import SaveIndicator from '@/components/layout/SaveIndicator'
import ViewSwitcher, { ViewSwitcherPanel, LEVEL_BADGE } from '@/components/layout/ViewSwitcher'
import {
  Download,
  Command,
  Undo2,
  Redo2,
  MoreHorizontal,
  ChevronDown,
  Plus,
  FolderSymlink,
  LayoutGrid,
  Sparkles,
} from 'lucide-react'
import { useSettingsStore } from '@/store/settings'

import { listDSLFiles, readDSLFile, writeDSLFile, getCurrentDirHandle, slugifyName } from '@/lib/folderIO'
import { parseDSL } from '@/lib/dsl'
import { useNavigate } from 'react-router-dom'
import { WorkspaceTile } from '@/components/welcome/WelcomeLeaves'
import { parseWorkspaceDocument } from '@/lib/workspaceDocument'

interface WsEntry {
  filename: string
  label: string
  scope?: string
  elementCounts: { type: string; count: number }[]
  viewCount: number
}

const ExportDialog = lazy(() => import('@/components/dialogs/ExportDialog'))
const CommandPalette = lazy(() => import('@/components/command-palette/CommandPalette'))
const CreateViewDialog = lazy(() => import('@/components/views/CreateViewDialog'))
const ScopePickerDialog = lazy(() => import('@/components/shared/ScopePickerDialog'))

export default function FloatingTopPill() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const undo = useWorkspaceStore((s) => s.undo)
  const redo = useWorkspaceStore((s) => s.redo)
  const canUndo = useWorkspaceStore((s) => s.undoStack.length > 0)
  const canRedo = useWorkspaceStore((s) => s.redoStack.length > 0)

  const commandPaletteOpen = useWorkspaceStore((s) => s.commandPaletteOpen)
  const showUndoRedo = useSettingsStore((s) => s.showUndoRedo)

  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [copyToast, setCopyToast] = useState<string | null>(null)
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false)
  const createViewDialogOpen = useWorkspaceStore((s) => s.createViewDialogOpen)
  const setCreateViewDialogOpen = useWorkspaceStore((s) => s.setCreateViewDialogOpen)
  // showCreateView: local trigger (from ViewSwitcher button) OR global store trigger (command palette)
  const showCreateView = createViewDialogOpen
  const setShowCreateView = setCreateViewDialogOpen
  const [showNewWorkspace, setShowNewWorkspace] = useState(false)
  const [hamburgerOpen, setHamburgerOpen] = useState(false)
  const [wsPickerOpen, setWsPickerOpen] = useState(false)
  const [wsFiles, setWsFiles] = useState<WsEntry[]>([])
  const isMobile = useBreakpoint() === 'mobile'
  const navigate = useNavigate()
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)
  const activeFilename = useWorkspaceStore((s) => s.activeWorkspaceFilename)

  const openWsPicker = useCallback(async () => {
    const filenames = await listDSLFiles()
    setWsPickerOpen(true)
    setViewDropdownOpen(false)
    setExportDialogOpen(false)
    // Load entries with basic stats (non-blocking per file)
    const entries = await Promise.all(filenames.map(async (filename): Promise<WsEntry> => {
      const label = filename.replace(/\.dsl$/, '')
      try {
        const file = await readDSLFile(filename)
        if (!file) return { filename, label, elementCounts: [], viewCount: 0 }
        const { workspace: ws } = parseDSL(file.content)
        if (!ws) return { filename, label, elementCounts: [], viewCount: 0 }
        const counts: Record<string, number> = {}
        counts['person'] = ws.model.people.length
        for (const s of ws.model.softwareSystems) {
          counts['system'] = (counts['system'] ?? 0) + 1
          for (const c of s.containers) {
            counts['container'] = (counts['container'] ?? 0) + 1
            counts['component'] = (counts['component'] ?? 0) + c.components.length
          }
        }
        const elementCounts = Object.entries(counts).map(([type, count]) => ({ type, count }))
        const allViews = [...ws.views.systemLandscapeViews, ...ws.views.systemContextViews, ...ws.views.containerViews, ...ws.views.componentViews]
        return { filename, label, scope: ws.scope, elementCounts, viewCount: allViews.length }
      } catch {
        return { filename, label, elementCounts: [], viewCount: 0 }
      }
    }))
    setWsFiles(entries)
  }, [])

  const handleSwitchWorkspace = useCallback(async (filename: string): Promise<void> => {
    setWsPickerOpen(false)
    const file = await readDSLFile(filename)
    if (!file) return
    const { workspace } = parseWorkspaceDocument({
      content: file.content,
      fallbackName: filename.replace(/\.dsl$/, ''),
      sidecarJson: file.sidecarJson,
    })
    loadWorkspace(workspace)
    useWorkspaceStore.getState().setActiveWorkspaceFilename(filename)
  }, [loadWorkspace])

  const handleManageWorkspaces = useCallback(() => {
    setWsPickerOpen(false)
    const slug = getCurrentDirHandle()?.name ?? ''
    useWorkspaceStore.getState().closeWorkspace()
    navigate(slug ? `/collection/${slug}` : '/collection', { replace: true })
  }, [navigate])

  const handleChangeCollection = useCallback(() => {
    setWsPickerOpen(false)
    useWorkspaceStore.getState().closeWorkspace()
    navigate('/', { replace: true })
  }, [navigate])

  // Update browser title to reflect current location (before early return — hooks must not be called conditionally)
  useEffect(() => {
    if (!workspace) return
    const wsName = workspace.name ?? 'workspace'
    const views = getAllViews(workspace)
    const activeView = views.find((v) => v.key === activeViewKey)
    const viewTitle = activeView?.title ?? activeViewKey ?? ''
    const viewType = activeView ? ` (${LEVEL_BADGE[activeView.type] ?? activeView.type})` : ''
    const parts = viewTitle
      ? [`${viewTitle}${viewType}`, wsName]
      : [wsName]
    document.title = `${parts.join(' — ')} | c4hero`
  }, [workspace, activeViewKey])

  if (!workspace) return null

  const wsName = workspace.name ?? 'workspace'

  async function handleExport(format: 'dsl' | 'png' | 'svg', theme: ExportTheme = 'dark') {
    if (!workspace) return
    switch (format) {
      case 'dsl':
        await saveDSLFile(serializeDSL(workspace), `${wsName}.dsl`)
        break
      case 'png': {
        const blob = await exportCanvasAsPNG(theme)
        if (blob) downloadBlob(blob, `${wsName}-${theme}.png`)
        break
      }
      case 'svg': {
        const svg = exportCanvasAsSVG(theme)
        if (svg) downloadFile(svg, `${wsName}-${theme}.svg`, 'image/svg+xml')
        break
      }
    }
  }

  async function handleCopy(type: 'png-dark' | 'png-light' | 'png-current' | 'dsl') {
    if (!workspace) return
    let ok = false
    if (type === 'png-dark') ok = await copyCanvasAsPNG('dark')
    else if (type === 'png-light') ok = await copyCanvasAsPNG('light')
    else if (type === 'png-current') ok = await copyCanvasAsPNG('current')
    else if (type === 'dsl') ok = await copyTextToClipboard(serializeDSL(workspace))
    const themeLabel = type === 'png-dark' ? 'dark' : type === 'png-light' ? 'light' : 'current'
    const label = type === 'dsl' ? 'DSL' : `PNG (${themeLabel})`
    const msg = ok ? `Copied ${label}` : 'Copy failed'
    setCopyToast(msg)
    announce(msg)
    setTimeout(() => setCopyToast(null), 2000)
  }

  return (
    <>
      <div
        data-canvas-fit-chrome="top"
        data-canvas-chrome="top-pill"
        style={{
          position: 'fixed',
          top: 'max(14px, calc(env(safe-area-inset-top, 0px) + 8px))',
          left: 0,
          right: 0,
          zIndex: 50,
          display: 'flex',
          justifyContent: 'center',
          padding: '0 14px',
          pointerEvents: 'none',
        }}
      >
      {/* Column: pill on top, slide-down panels below — inherit same natural width */}
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '100%', minWidth: 0, width: 'fit-content' }}>
      <div
        className="glass-panel"
        data-shade-open={viewDropdownOpen || exportDialogOpen || commandPaletteOpen || wsPickerOpen ? 'true' : undefined}
        style={{
          pointerEvents: 'auto',
          maxWidth: '100%',
          height: 44,
          display: 'flex',
          alignItems: 'center',
          minWidth: 0,
          // Clip button backgrounds to the pill's rounded corners so an active
          // button's fill follows the pill's curve flush against its border.
          overflow: 'hidden',
        }}
      >
        {/* Logo — click to go home */}
        <button
          onClick={() => { useWorkspaceStore.getState().closeWorkspace(); navigate('/', { replace: true }) }}
          title="Close workspace"
          aria-label="Close workspace"
          className="hover-subtle"
          style={{
            padding: '0 12px',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            borderRight: '1px solid var(--color-border)',
            cursor: 'pointer',
            border: 'none',
            transition: 'background 0.12s',
            flexShrink: 0,
          }}
        >
          <img src="/c4-logo.png" alt="c4hero" style={{ width: 24, height: 24 }} />
        </button>

        {/* Workspace name — click to open switcher */}
        {!isMobile && (
          <button
            onClick={() => wsPickerOpen ? setWsPickerOpen(false) : openWsPicker()}
            className="hover-subtle"
            data-active={wsPickerOpen ? 'true' : undefined}
            style={{
              padding: '0 10px',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRight: '1px solid var(--color-border)',
              minWidth: 0,
              overflow: 'hidden',
              flexShrink: 1,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                fontSize: 'var(--text-base)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 120,
              }}
            >
              {wsName}
            </span>
            <ChevronDown size={12} style={{ opacity: 0.5, flexShrink: 0, transform: wsPickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
          </button>
        )}

        {/* View switcher */}
        <ViewSwitcher
          isMobile={isMobile}
          open={viewDropdownOpen}
          onToggle={() => { setViewDropdownOpen((o) => !o); setExportDialogOpen(false); setWsPickerOpen(false); useWorkspaceStore.getState().setCommandPaletteOpen(false) }}
          onClose={() => { setViewDropdownOpen(false) }}
          onShowCreateView={() => setShowCreateView(true)}
        />

        {/* Save status indicator */}
        <SaveIndicator />

        {/* Mobile: hamburger / Desktop: action buttons */}
        {isMobile ? (
          <button
            onClick={() => setHamburgerOpen((o) => !o)}
            className="btn-icon"
            style={{ width: 40, height: 44, borderRadius: 0, minWidth: 40, flexShrink: 0 }}
            title="More actions"
            aria-label="More actions"
            aria-expanded={hamburgerOpen}
            aria-haspopup="true"
          >
            <MoreHorizontal size={16} />
          </button>
        ) : (
          <>
            {/* Undo/Redo (conditional) */}
            {showUndoRedo && (
              <>
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  className="btn-icon"
                  style={{
                    width: 36,
                    height: '100%',
                    borderRadius: 0,
                    minWidth: 36,
                    minHeight: 44,
                    opacity: canUndo ? 1 : 0.3,
                  }}
                  title="Undo (Ctrl+Z)"
                  aria-label="Undo"
                >
                  <Undo2 size={14} />
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  className="btn-icon"
                  style={{
                    width: 36,
                    height: '100%',
                    borderRadius: 0,
                    minWidth: 36,
                    minHeight: 44,
                    opacity: canRedo ? 1 : 0.3,
                    borderRight: '1px solid var(--color-border)',
                  }}
                  title="Redo (Ctrl+Shift+Z)"
                  aria-label="Redo"
                >
                  <Redo2 size={14} />
                </button>
              </>
            )}

            {/* AI assistant now lives in the canvas tool rail (left) */}

            {/* Export */}
            <button
              onClick={() => { setExportDialogOpen(o => !o); useWorkspaceStore.getState().setCommandPaletteOpen(false); setViewDropdownOpen(false); setWsPickerOpen(false) }}
              className="btn-icon"
              data-active={exportDialogOpen ? 'true' : undefined}
              style={{ width: 40, height: 44, borderRadius: 0, minWidth: 40, minHeight: 44 }}
              title="Export"
              aria-label="Export"
            >
              <Download size={15} />
            </button>

            {/* Keyboard shortcuts */}
            <button
              className="btn-icon"
              data-active={commandPaletteOpen ? 'true' : undefined}
              style={{
                width: 40,
                height: 44,
                borderRadius: 0,
                borderTopRightRadius: 'var(--radius-lg)',
                borderBottomRightRadius: 'var(--radius-lg)',
                minWidth: 40,
                minHeight: 44,
              }}
              title="Command palette (⌘K)"
              aria-label="Command palette"
              onClick={() => { const open = !useWorkspaceStore.getState().commandPaletteOpen; useWorkspaceStore.getState().setCommandPaletteOpen(open); if (open) { setExportDialogOpen(false); setViewDropdownOpen(false); setWsPickerOpen(false) } }}
            >
              <Command size={15} />
            </button>


          </>
        )}
      </div>
      {/* Slide-down shades — siblings in the column, inherit exact pill width */}
      {hamburgerOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 54, pointerEvents: 'auto' }}
            onClick={() => setHamburgerOpen(false)}
          />
          <div
            role="menu"
            className="glass-flyout"
            style={{
              pointerEvents: 'auto',
              alignSelf: 'flex-end',
              zIndex: 60,
              marginTop: 4,
              minWidth: 180,
              padding: '4px 0',
            }}
          >
            <MenuItemRow icon={FolderSymlink} label="Workspaces…" onClick={() => { setHamburgerOpen(false); openWsPicker() }} />
            <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
            <MenuItemRow icon={Sparkles} label="AI assistant…" onClick={() => { setHamburgerOpen(false); useWorkspaceStore.getState().setAiPanelOpen(true) }} />
            <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
            <MenuItemRow icon={Download} label="Export…" onClick={() => { setHamburgerOpen(false); setExportDialogOpen(true); setWsPickerOpen(false); useWorkspaceStore.getState().setCommandPaletteOpen(false) }} />
            <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
            <MenuItemRow
              icon={Command}
              label="Command palette"
              onClick={() => { setHamburgerOpen(false); useWorkspaceStore.getState().setCommandPaletteOpen(true); setExportDialogOpen(false) }}
            />
            {showUndoRedo && (
              <>
                <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
                <MenuItemRow
                  icon={Undo2}
                  label="Undo"
                  onClick={() => { setHamburgerOpen(false); undo() }}
                  disabled={!canUndo}
                />
                <MenuItemRow
                  icon={Redo2}
                  label="Redo"
                  onClick={() => { setHamburgerOpen(false); redo() }}
                  disabled={!canRedo}
                />
              </>
            )}
          </div>
        </>
      )}
      {viewDropdownOpen && (
        <ViewSwitcherPanel
          onClose={() => { setViewDropdownOpen(false) }}
          onShowCreateView={() => setShowCreateView(true)}
        />
      )}
      {wsPickerOpen && (
        <WorkspaceSwitcherPanel
          entries={wsFiles}
          activeFilename={activeFilename}
          currentName={workspace?.name ?? ''}
          currentDescription={workspace?.description ?? ''}
          onUpdateMeta={(patch) => useWorkspaceStore.getState().updateWorkspaceMeta(patch)}
          onSelect={handleSwitchWorkspace}
          onNewWorkspace={() => { setWsPickerOpen(false); setShowNewWorkspace(true) }}
          onManageWorkspaces={handleManageWorkspaces}
          onChangeCollection={handleChangeCollection}
          onClose={() => setWsPickerOpen(false)}
        />
      )}
      {exportDialogOpen && (
        <Suspense fallback={<LoadingDot />}>
          <ExportDialog
            onExport={handleExport}
            onCopy={handleCopy}
            onClose={() => setExportDialogOpen(false)}
          />
        </Suspense>
      )}
      {commandPaletteOpen && <Suspense fallback={<LoadingDot />}><CommandPalette /></Suspense>}
      </div>{/* end column */}
      </div>{/* end outer row */}

      {showCreateView && <Suspense fallback={<LoadingDot />}><CreateViewDialog onClose={() => setShowCreateView(false)} /></Suspense>}
      {/* CanvasSettingsDialog is rendered in FloatingToolRail via canvasSettingsOpen store state */}
      {showNewWorkspace && (
        <Suspense fallback={<LoadingDot />}>
          <ScopePickerDialog
            onConfirm={async (scope, name, openAfter, description) => {
              setShowNewWorkspace(false)
              const ws = createBlankWorkspace(scope)
              ws.name = name.trim() || 'workspace'
              if (description.trim()) ws.description = description.trim()
              const filename = `${slugifyName(ws.name) || 'workspace'}.dsl`
              const ok = await writeDSLFile(filename, serializeDSL(ws))
              if (openAfter) {
                loadWorkspace(ws)
                if (ok) useWorkspaceStore.getState().setActiveWorkspaceFilename(filename)
              }
            }}
            onCancel={() => setShowNewWorkspace(false)}
          />
        </Suspense>
      )}
      {copyToast && (
        <div style={{
          position: 'fixed',
          bottom: 'max(72px, calc(env(safe-area-inset-bottom, 0px) + 72px))',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          background: 'var(--glass-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '8px 16px',
          fontSize: 'var(--text-base)',
          color: 'var(--color-text-primary)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {copyToast}
        </div>
      )}
    </>
  )
}



// ─── Workspace Switcher Panel ─────────────────────────────────────────────────

function WorkspaceSwitcherPanel({
  entries,
  activeFilename,
  currentName,
  currentDescription,
  onUpdateMeta,
  onSelect,
  onNewWorkspace,
  onManageWorkspaces,
  onChangeCollection,
  onClose,
}: {
  entries: WsEntry[]
  activeFilename: string | null
  currentName: string
  currentDescription: string
  onUpdateMeta: (patch: { name?: string; description?: string }) => void
  onSelect: (filename: string) => Promise<void>
  onNewWorkspace: () => void
  onManageWorkspaces: () => void
  onChangeCollection: () => void
  onClose: () => void
}) {
  const hasFolderHandle = !!getCurrentDirHandle()
  const [editName, setEditName] = useState(currentName)
  const [editDesc, setEditDesc] = useState(currentDescription)

  // Sync local state when the current workspace changes
  useEffect(() => { setEditName(currentName) }, [currentName])
  useEffect(() => { setEditDesc(currentDescription) }, [currentDescription])

  function commitName() {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== currentName) {
      onUpdateMeta({ name: trimmed })
    } else {
      setEditName(currentName)
    }
  }

  function commitDescription() {
    if (editDesc !== currentDescription) {
      onUpdateMeta({ description: editDesc })
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 54, pointerEvents: 'auto',
          background: 'transparent', border: 'none', padding: 0, cursor: 'default',
        }}
      />
      <div className="shade-panel" style={{ zIndex: 55, display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box' }}>

        {/* Current workspace properties — editable */}
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>
            Current workspace
          </span>
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
            placeholder="Untitled workspace"
            style={{
              padding: '8px 10px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              background: 'var(--glass-overlay-xs)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />
          <textarea
            value={editDesc}
            onChange={e => setEditDesc(e.target.value)}
            onBlur={commitDescription}
            placeholder="Add a description…"
            rows={2}
            style={{
              padding: '8px 10px', borderRadius: 8, fontSize: 12,
              background: 'var(--glass-overlay-xs)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
              outline: 'none', resize: 'none', fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 10px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', flex: 1 }}>
            Workspaces
            {entries.length > 0 && (
              <span style={{ background: 'var(--glass-overlay-sm)', borderRadius: 99, padding: '1px 7px', marginLeft: 6, fontWeight: 600 }}>
                {entries.length}
              </span>
            )}
          </span>
        </div>

        {/* Scrollable card grid — max ~3 rows before scrolling */}
        <div style={{ overflowY: 'auto', maxHeight: 280, padding: '0 14px 14px' }}>
          {entries.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>
              No workspaces in this collection
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {entries.map(entry => {
                const totalElements = entry.elementCounts.reduce((s, e) => s + e.count, 0)
                return (
                  <WorkspaceTile
                    key={entry.filename}
                    label={entry.label}
                    scope={entry.scope}
                    elementCount={totalElements}
                    viewCount={entry.viewCount}
                    isActive={entry.filename === activeFilename}
                    onClick={() => { void onSelect(entry.filename) }}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ borderTop: '1px solid var(--color-border)', display: 'flex' }}>
          <button
            onClick={onNewWorkspace}
            className="hover-subtle"
            style={{
              flex: 1, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)',
              border: 'none', cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            New Workspace
          </button>
          <div style={{ width: 1, background: 'var(--color-border)', margin: '8px 0' }} />
          <button
            onClick={onManageWorkspaces}
            className="hover-subtle"
            style={{
              flex: 1, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)',
              border: 'none', cursor: 'pointer',
            }}
          >
            <LayoutGrid size={14} />
            Manage
          </button>
          {hasFolderHandle && (
            <>
              <div style={{ width: 1, background: 'var(--color-border)', margin: '8px 0' }} />
              <button
                onClick={onChangeCollection}
                className="hover-subtle"
                style={{
                  flex: 1, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 7,
                  fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                <FolderSymlink size={14} />
                Change Collection
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function MenuItemRow({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      role="menuitem"
      className="flyout-item"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 12px',
        fontSize: 'var(--text-base)',
        color: disabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        borderRadius: 0,
      }}
    >
      <Icon size={14} />
      {label}
    </button>
  )
}
