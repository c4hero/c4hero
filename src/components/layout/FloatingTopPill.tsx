import { lazy, Suspense, useEffect, useState, useCallback } from 'react'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import LoadingDot from '@/components/shared/LoadingDot'
import { useWorkspaceStore, getAllViews } from '@/store/workspace'
import { exportAsJSON, downloadFile, downloadBlob, exportCanvasAsPNG, exportCanvasAsSVG, copyCanvasAsPNG, copyTextToClipboard, type ExportTheme } from '@/lib/exportUtils'
import { serializeDSL } from '@/lib/dsl'
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
  FileText,
} from 'lucide-react'
import { useSettingsStore } from '@/store/settings'
import { scopeLabel } from '@/lib/scopeValidation'
import { listDSLFiles, readDSLFile, getCurrentDirHandle } from '@/lib/folderIO'
import { parseDSL, serializeDSL as _serializeDSL } from '@/lib/dsl'
import { parseSidecar, applySidecar } from '@/lib/sidecar'
import { useNavigate } from 'react-router-dom'

const ExportDialog = lazy(() => import('@/components/dialogs/ExportDialog'))
const CommandPalette = lazy(() => import('@/components/command-palette/CommandPalette'))
const CreateViewDialog = lazy(() => import('@/components/views/CreateViewDialog'))
const CanvasSettingsDialog = lazy(() => import('@/components/settings/CanvasSettingsDialog'))

export default function FloatingTopPill() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const undo = useWorkspaceStore((s) => s.undo)
  const redo = useWorkspaceStore((s) => s.redo)
  const canUndo = useWorkspaceStore((s) => s.canUndo)
  const canRedo = useWorkspaceStore((s) => s.canRedo)

  const commandPaletteOpen = useWorkspaceStore((s) => s.commandPaletteOpen)

  const showUndoRedo = useSettingsStore((s) => s.showUndoRedo)

  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [copyToast, setCopyToast] = useState<string | null>(null)
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false)
  const [showCreateView, setShowCreateView] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [hamburgerOpen, setHamburgerOpen] = useState(false)
  const [wsPickerOpen, setWsPickerOpen] = useState(false)
  const [wsFiles, setWsFiles] = useState<string[]>([])
  const isMobile = useBreakpoint() === 'mobile'
  const navigate = useNavigate()
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)
  const activeFilename = useWorkspaceStore((s) => s.activeWorkspaceFilename)

  const openWsPicker = useCallback(async () => {
    const files = await listDSLFiles()
    setWsFiles(files)
    setWsPickerOpen(true)
    setViewDropdownOpen(false)
    setExportDialogOpen(false)
  }, [])

  const handleSwitchWorkspace = useCallback(async (filename: string) => {
    setWsPickerOpen(false)
    const file = await readDSLFile(filename)
    if (!file) return
    const { workspace } = parseDSL(file.content)
    if (!workspace) return
    if (!workspace.name) workspace.name = filename.replace(/\.dsl$/, '')
    if (file.sidecarJson) {
      const sidecar = parseSidecar(file.sidecarJson)
      if (sidecar) applySidecar(workspace, sidecar)
    }
    loadWorkspace(workspace)
    useWorkspaceStore.getState().setActiveWorkspaceFilename(filename)
  }, [loadWorkspace])

  const handleChangeCollection = useCallback(() => {
    setWsPickerOpen(false)
    useWorkspaceStore.getState().closeWorkspace()
    navigate('/collection', { replace: true })
  }, [navigate])

  if (!workspace) return null

  const views = getAllViews(workspace)
  const activeView = views.find((v) => v.key === activeViewKey)
  const wsName = workspace.name ?? 'workspace'

  // Update browser title to reflect current location
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const viewTitle = activeView?.title ?? activeViewKey ?? ''
    const viewType = activeView ? ` (${LEVEL_BADGE[activeView.type] ?? activeView.type})` : ''
    const parts = viewTitle
      ? [`${viewTitle}${viewType}`, wsName]
      : [wsName]
    document.title = `${parts.join(' — ')} | c4hero`
  }, [activeView, activeViewKey, wsName])

  async function handleExport(format: 'dsl' | 'json' | 'png' | 'svg', theme: ExportTheme = 'dark') {
    if (!workspace) return
    switch (format) {
      case 'dsl':
        await saveDSLFile(serializeDSL(workspace), `${wsName}.dsl`)
        break
      case 'json':
        downloadFile(exportAsJSON(workspace), `${wsName}.json`, 'application/json')
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

  async function handleCopy(type: 'png-dark' | 'png-light' | 'dsl') {
    if (!workspace) return
    let ok = false
    if (type === 'png-dark') ok = await copyCanvasAsPNG('dark')
    else if (type === 'png-light') ok = await copyCanvasAsPNG('light')
    else if (type === 'dsl') ok = await copyTextToClipboard(serializeDSL(workspace))
    const label = type === 'dsl' ? 'DSL' : `PNG (${type === 'png-dark' ? 'dark' : 'light'})`
    const msg = ok ? `Copied ${label}` : 'Copy failed'
    setCopyToast(msg)
    announce(msg)
    setTimeout(() => setCopyToast(null), 2000)
  }

  return (
    <>
      <div
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
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '100%', minWidth: 0 }}>
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
          overflow: 'visible',
        }}
      >
        {/* Logo — click to go home */}
        <button
          onClick={() => useWorkspaceStore.getState().closeWorkspace()}
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
            background: 'transparent',
            border: 'none',
            transition: 'background 0.12s',
            flexShrink: 0,
          }}
        >
          <img src="/c4-logo.svg" alt="c4hero" style={{ width: 24, height: 24 }} />
        </button>

        {/* Workspace name — click to open switcher */}
        <button
          onClick={() => wsPickerOpen ? setWsPickerOpen(false) : openWsPicker()}
          className="hover-subtle"
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
            background: wsPickerOpen ? 'rgba(255,255,255,0.04)' : 'transparent',
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
          {workspace.scope && workspace.scope !== 'none' && (
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-accent)', background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.2)', padding: '2px 7px', borderRadius: '99px', flexShrink: 0 }}>
              {scopeLabel(workspace.scope)}
            </span>
          )}
          <ChevronDown size={12} style={{ opacity: 0.5, flexShrink: 0, transform: wsPickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
        </button>

        {/* View switcher */}
        <ViewSwitcher
          isMobile={isMobile}
          open={viewDropdownOpen}
          onToggle={() => { setViewDropdownOpen((o) => !o); setExportDialogOpen(false); useWorkspaceStore.getState().setCommandPaletteOpen(false) }}
          onClose={() => { setViewDropdownOpen(false) }}
          onShowCreateView={() => setShowCreateView(true)}
        />

        {/* Save status indicator */}
        <SaveIndicator />

        {/* Mobile: hamburger / Desktop: action buttons */}
        {isMobile ? (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setHamburgerOpen((o) => !o)}
              className="btn-icon"
              style={{ width: 40, height: 44, borderRadius: 0, minWidth: 40 }}
              title="More actions"
              aria-label="More actions"
              aria-expanded={hamburgerOpen}
              aria-haspopup="true"
            >
              <MoreHorizontal size={16} />
            </button>
            {hamburgerOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                  onClick={() => setHamburgerOpen(false)}
                />
                <div
                  role="menu"
                  className="glass-flyout"
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    zIndex: 60,
                    marginTop: 4,
                    minWidth: 180,
                    padding: '4px 0',
                  }}
                >
                  <MenuItemRow icon={Download} label="Export…" onClick={() => { setHamburgerOpen(false); setExportDialogOpen(true); useWorkspaceStore.getState().setCommandPaletteOpen(false) }} />
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
                        disabled={!canUndo()}
                      />
                      <MenuItemRow
                        icon={Redo2}
                        label="Redo"
                        onClick={() => { setHamburgerOpen(false); redo() }}
                        disabled={!canRedo()}
                      />
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Undo/Redo (conditional) */}
            {showUndoRedo && (
              <>
                <button
                  onClick={undo}
                  disabled={!canUndo()}
                  className="btn-icon"
                  style={{
                    width: 36,
                    height: '100%',
                    borderRadius: 0,
                    minWidth: 36,
                    minHeight: 44,
                    opacity: canUndo() ? 1 : 0.3,
                  }}
                  title="Undo (Ctrl+Z)"
                  aria-label="Undo"
                >
                  <Undo2 size={14} />
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo()}
                  className="btn-icon"
                  style={{
                    width: 36,
                    height: '100%',
                    borderRadius: 0,
                    minWidth: 36,
                    minHeight: 44,
                    opacity: canRedo() ? 1 : 0.3,
                    borderRight: '1px solid var(--color-border)',
                  }}
                  title="Redo (Ctrl+Shift+Z)"
                  aria-label="Redo"
                >
                  <Redo2 size={14} />
                </button>
              </>
            )}

            {/* Export */}
            <button
              onClick={() => { setExportDialogOpen(o => !o); useWorkspaceStore.getState().setCommandPaletteOpen(false); setViewDropdownOpen(false) }}
              className="btn-icon"
              style={{ width: 40, height: 44, borderRadius: 0, minWidth: 40, minHeight: 44 }}
              title="Export"
              aria-label="Export"
            >
              <Download size={15} />
            </button>

            {/* Keyboard shortcuts */}
            <button
              className="btn-icon"
              style={{
                width: 40,
                height: 44,
                borderRadius: 0,
                minWidth: 40,
                minHeight: 44,
              }}
              title="Command palette (⌘K)"
              aria-label="Command palette"
              onClick={() => { const open = !useWorkspaceStore.getState().commandPaletteOpen; useWorkspaceStore.getState().setCommandPaletteOpen(open); if (open) { setExportDialogOpen(false); setViewDropdownOpen(false) } }}
            >
              <Command size={15} />
            </button>


          </>
        )}
      </div>
      {/* Slide-down shades — siblings in the column, inherit exact pill width */}
      {viewDropdownOpen && (
        <ViewSwitcherPanel
          onClose={() => { setViewDropdownOpen(false) }}
          onShowCreateView={() => setShowCreateView(true)}
        />
      )}
      {wsPickerOpen && (
        <WorkspaceSwitcherPanel
          files={wsFiles}
          activeFilename={activeFilename}
          onSelect={handleSwitchWorkspace}
          onNewWorkspace={() => { setWsPickerOpen(false); /* TODO: trigger new workspace flow */ }}
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
      {showSettings && <Suspense fallback={<LoadingDot />}><CanvasSettingsDialog onClose={() => setShowSettings(false)} /></Suspense>}
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
  files,
  activeFilename,
  onSelect,
  onNewWorkspace,
  onChangeCollection,
  onClose,
}: {
  files: string[]
  activeFilename: string | null
  onSelect: (filename: string) => void
  onNewWorkspace: () => void
  onChangeCollection: () => void
  onClose: () => void
}) {
  const hasFolderHandle = !!getCurrentDirHandle()

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 48 }} onClick={onClose} />
      <div
        className="shade-panel"
        style={{ padding: '16px 16px 0', minWidth: 280, maxWidth: 400, zIndex: 49 }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>
            Workspaces {files.length > 0 && <span style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 99, padding: '1px 6px', marginLeft: 4 }}>{files.length}</span>}
          </span>
        </div>

        {/* Workspace cards grid */}
        {files.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>
            No workspaces in this collection
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 4 }}>
            {files.map(filename => {
              const isActive = filename === activeFilename
              const label = filename.replace(/\.dsl$/, '')
              return (
                <button
                  key={filename}
                  onClick={() => onSelect(filename)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    gap: 8, padding: 0, borderRadius: 10, overflow: 'hidden',
                    border: isActive ? '2px solid var(--color-accent)' : '2px solid var(--color-border)',
                    background: 'transparent', cursor: 'pointer',
                    transition: 'border-color 150ms',
                  }}
                >
                  {/* Thumbnail area */}
                  <div style={{
                    width: '100%', aspectRatio: '16/9',
                    background: 'rgba(0,0,0,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderBottom: '1px solid var(--color-border)',
                  }}>
                    <FileText size={20} style={{ opacity: 0.2, color: 'var(--color-text-primary)' }} />
                  </div>
                  {/* Label */}
                  <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                    {isActive && (
                      <span style={{ fontSize: 10, color: 'var(--color-accent)', fontWeight: 600 }}>Active</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Divider + footer actions */}
        <div style={{ borderTop: '1px solid var(--color-border)', display: 'flex', gap: 0 }}>
          <button
            onClick={onNewWorkspace}
            className="hover-subtle"
            style={{
              flex: 1, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)',
              background: 'transparent', border: 'none', cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            New Workspace
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
                  background: 'transparent', border: 'none', cursor: 'pointer',
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
