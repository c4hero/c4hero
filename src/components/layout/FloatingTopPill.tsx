import { useEffect, useRef, useState } from 'react'
import { useWorkspaceStore, getAllViews, getBreadcrumb } from '@/store/workspace'
import { exportAsJSON, downloadFile, downloadBlob, exportCanvasAsPNG, exportCanvasAsSVG, copyCanvasAsPNG, copyTextToClipboard, type ExportTheme } from '@/lib/exportUtils'
import { serializeDSL } from '@/lib/dsl'
import { saveDSLFile, getCurrentFileHandle } from '@/lib/fileIO'
import type { View } from '@/types/model'
import CreateViewDialog from '@/components/views/CreateViewDialog'
import ExportDialog from '@/components/dialogs/ExportDialog'
import {
  ChevronDown,
  ChevronRight,
  Download,
  Command,

  Undo2,
  Redo2,

  LayoutGrid,
  MoreHorizontal,
  TriangleAlert,
} from 'lucide-react'
import { useSettingsStore } from '@/store/settings'
import CanvasSettingsDialog from '@/components/settings/CanvasSettingsDialog'

const VIEW_TYPE_LABELS: Record<string, string> = {
  systemLandscape: 'System Landscape',
  systemContext: 'System Context',
  container: 'Container',
  component: 'Component',
}

const LEVEL_BADGE: Record<string, string> = {
  systemLandscape: 'L1',
  systemContext: 'L2',
  container: 'L3',
  component: 'L4',
}

export default function FloatingTopPill() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const viewHistory = useWorkspaceStore((s) => s.viewHistory)
  const setActiveView = useWorkspaceStore((s) => s.setActiveView)
  const navigateBack = useWorkspaceStore((s) => s.navigateBack)
  const undo = useWorkspaceStore((s) => s.undo)
  const redo = useWorkspaceStore((s) => s.redo)
  const canUndo = useWorkspaceStore((s) => s.canUndo)
  const canRedo = useWorkspaceStore((s) => s.canRedo)
  const toggleViewsPanel = useWorkspaceStore((s) => s.toggleViewsPanel)
  // Dirty state: any workspace mutation resets undoStack; treat undoStack.length > 0 as "dirty"
  const isDirty = useWorkspaceStore((s) => s.undoStack.length > 0)
  const lastSavedUndoLength = useWorkspaceStore((s) => s.lastSavedUndoLength)

  const showUndoRedo = useSettingsStore((s) => s.showUndoRedo)

  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [copyToast, setCopyToast] = useState<string | null>(null)
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false)
  const [showCreateView, setShowCreateView] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [hasFileHandle, setHasFileHandle] = useState(() => getCurrentFileHandle() !== null)
  const [hamburgerOpen, setHamburgerOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 640)
  // Track undo stack length at last save to determine dirty state
  const savedUndoLengthRef = useRef(0)
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout>>(null)

  // Sync hasFileHandle whenever it may change
  useEffect(() => {
    setHasFileHandle(getCurrentFileHandle() !== null)
  }, [saveStatus])

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  if (!workspace) return null

  const views = getAllViews(workspace)
  const breadcrumb = activeViewKey
    ? getBreadcrumb(workspace, viewHistory, activeViewKey)
    : []

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

  const viewsByType = views.reduce<Record<string, View[]>>((acc, view) => {
    if (!acc[view.type]) acc[view.type] = []
    acc[view.type].push(view)
    return acc
  }, {})

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
    setCopyToast(ok ? `Copied ${label}` : 'Copy failed')
    setTimeout(() => setCopyToast(null), 2000)
  }

  async function handleSave() {
    if (!workspace) return
    setSaveStatus('saving')
    const dsl = serializeDSL(workspace)
    const ok = await saveDSLFile(dsl, `${wsName}.dsl`)
    if (ok) {
      const n = useWorkspaceStore.getState().undoStack.length
      savedUndoLengthRef.current = n
      useWorkspaceStore.getState().setLastSavedUndoLength(n)
      setSaveStatus('saved')
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current)
      savedFlashTimer.current = setTimeout(() => setSaveStatus('idle'), 2000)
    } else {
      setSaveStatus('error')
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current)
      savedFlashTimer.current = setTimeout(() => setSaveStatus('idle'), 3000)
    }
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
      <div
        style={{
          pointerEvents: 'auto',
          maxWidth: '100%',
          height: 44,
          display: 'flex',
          alignItems: 'center',
          borderRadius: 12,
          border: '1px solid var(--color-border)',
          background: 'rgba(13, 17, 23, 0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.03)',
          minWidth: 0,
          overflow: 'visible',
        }}
      >
        {/* Logo — click to go home */}
        <button
          onClick={() => useWorkspaceStore.getState().closeWorkspace()}
          title="Close workspace"
          aria-label="Close workspace"
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
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <img src="/c4-logo.svg" alt="c4hero" style={{ width: 24, height: 24 }} />
        </button>

        {/* Workspace name */}
        <div
          style={{
            padding: '0 10px',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            borderRight: '1px solid var(--color-border)',
            minWidth: 0,
            overflow: 'hidden',
            flexShrink: 1,
          }}
        >
          <span
            style={{
              fontSize: 13,
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
        </div>

        {/* View switcher */}
        <div style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'visible' }}>
          <button
            onClick={() => setViewDropdownOpen((o) => !o)}
            style={{
              padding: '0 12px',
              height: 44,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRight: '1px solid var(--color-border)',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              background: 'transparent',
              cursor: 'pointer',
              transition: 'background 0.12s',
              minWidth: 0,
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            {breadcrumb.length > 1 && (
              <>
                {breadcrumb.slice(0, -1).map((crumb, i) => (
                  <span key={crumb.key} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {i > 0 && <ChevronRight size={10} style={{ color: 'var(--color-text-muted)' }} />}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const steps = breadcrumb.length - 1 - i
                        for (let s = 0; s < steps; s++) navigateBack()
                        setViewDropdownOpen(false)
                      }}
                      style={{
                        fontSize: 12,
                        color: 'var(--color-text-muted)',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      {crumb.label}
                    </button>
                  </span>
                ))}
                <ChevronRight size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
              </>
            )}
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: isMobile ? 80 : 120,
                minWidth: 0,
              }}
            >
              {activeView?.title ?? activeViewKey ?? 'No view'}
            </span>
            {activeView && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 5px',
                  borderRadius: 4,
                  background: 'rgba(88,166,255,0.15)',
                  color: 'var(--color-accent)',
                  letterSpacing: '0.05em',
                  flexShrink: 0,
                }}
              >
                {LEVEL_BADGE[activeView.type] ?? ''}
              </span>
            )}
            <ChevronDown size={12} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          </button>

          {/* View dropdown */}
          {viewDropdownOpen && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                onClick={() => setViewDropdownOpen(false)}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 50,
                  marginTop: 4,
                  minWidth: 200,
                  background: 'var(--color-surface-1)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  padding: '4px 0',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
                }}
              >
                {Object.entries(viewsByType).map(([type, typeViews]) => (
                  <div key={type}>
                    <div
                      style={{
                        padding: '4px 12px 2px',
                        fontSize: 9,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {VIEW_TYPE_LABELS[type] ?? type}
                    </div>
                    {typeViews.map((v) => (
                      <button
                        key={v.key}
                        onClick={() => {
                          setActiveView(v.key)
                          setViewDropdownOpen(false)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          width: '100%',
                          padding: '6px 12px 6px 20px',
                          fontSize: 13,
                          color: v.key === activeViewKey ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                          background: v.key === activeViewKey ? 'var(--color-surface-3)' : 'transparent',
                          cursor: 'pointer',
                          transition: 'background 0.1s',
                          boxShadow: v.key === activeViewKey ? 'inset 2px 0 0 var(--color-accent)' : 'none',
                        }}
                        onMouseEnter={(e) => {
                          if (v.key !== activeViewKey) e.currentTarget.style.background = 'var(--color-surface-2)'
                        }}
                        onMouseLeave={(e) => {
                          if (v.key !== activeViewKey) e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        {v.title ?? v.key}
                      </button>
                    ))}
                  </div>
                ))}

                <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
                <button
                  onClick={() => {
                    setViewDropdownOpen(false)
                    toggleViewsPanel()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: '7px 12px',
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                    background: 'transparent',
                    cursor: 'pointer',
                    gap: 6,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-2)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <LayoutGrid size={12} />
                  Manage views
                </button>
                <button
                  onClick={() => {
                    setViewDropdownOpen(false)
                    setShowCreateView(true)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: '7px 12px',
                    fontSize: 12,
                    color: 'var(--color-accent)',
                    background: 'transparent',
                    cursor: 'pointer',
                    gap: 6,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-2)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  + New view
                </button>
              </div>
            </>
          )}
        </div>

        {/* Save status indicator */}
        {(() => {
          const currentUndoLength = useWorkspaceStore.getState().undoStack.length
          const isFileDirty = isDirty && currentUndoLength !== savedUndoLengthRef.current && currentUndoLength !== lastSavedUndoLength
          const dotColor =
            saveStatus === 'saving' ? 'var(--color-info)'
            : saveStatus === 'saved' ? 'var(--color-success)'
            : saveStatus === 'error' ? 'var(--color-error)'
            : !hasFileHandle ? 'var(--color-text-muted)'
            : isFileDirty ? 'var(--color-warning)'
            : 'var(--color-success)'
          const dotGlow =
            saveStatus === 'saving' ? '0 0 6px var(--color-info)'
            : saveStatus === 'saved' ? '0 0 6px var(--color-success)'
            : saveStatus === 'error' ? '0 0 6px var(--color-error)'
            : !hasFileHandle ? 'none'
            : isFileDirty ? '0 0 6px var(--color-warning)'
            : '0 0 6px var(--color-success)'
          const tooltip =
            saveStatus === 'saving' ? 'Saving…'
            : saveStatus === 'saved' ? 'Saved to file'
            : saveStatus === 'error' ? 'Save failed — click to retry'
            : !hasFileHandle ? 'No file linked — click to save to a .dsl file'
            : isFileDirty ? 'Unsaved changes — click to save'
            : 'All changes saved'
          const showWarningIcon = !hasFileHandle && saveStatus === 'idle'
          return (
            <button
              onClick={handleSave}
              style={{
                width: showWarningIcon ? 40 : 36,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                borderRight: '1px solid var(--color-border)',
                flexShrink: 0,
                color: showWarningIcon ? 'var(--color-warning)' : undefined,
              }}
              title={tooltip}
              aria-label={tooltip}
            >
              {showWarningIcon ? (
                <TriangleAlert size={14} style={{ filter: 'drop-shadow(0 0 4px var(--color-warning))' }} />
              ) : (
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: dotColor,
                    boxShadow: dotGlow,
                    transition: 'background 0.3s, box-shadow 0.3s',
                  }}
                />
              )}
            </button>
          )
        })()}

        {/* Mobile: hamburger / Desktop: action buttons */}
        {isMobile ? (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setHamburgerOpen((o) => !o)}
              className="btn-icon"
              style={{ width: 40, height: 44, borderRadius: 0, minWidth: 40 }}
              title="More actions"
              aria-label="More actions"
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
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    zIndex: 60,
                    marginTop: 4,
                    minWidth: 180,
                    background: 'var(--color-surface-1)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                    padding: '4px 0',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
                  }}
                >
                  <MenuItemRow icon={Download} label="Export…" onClick={() => { setHamburgerOpen(false); setExportDialogOpen(true) }} />
                  <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
                  <MenuItemRow
                    icon={Command}
                    label="Command palette"
                    onClick={() => { setHamburgerOpen(false); useWorkspaceStore.getState().setCommandPaletteOpen(true) }}
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
              onClick={() => setExportDialogOpen(true)}
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
              onClick={() => useWorkspaceStore.getState().setCommandPaletteOpen(true)}
            >
              <Command size={15} />
            </button>


          </>
        )}
      </div>
      </div>

      {showCreateView && <CreateViewDialog onClose={() => setShowCreateView(false)} />}
      {showSettings && <CanvasSettingsDialog onClose={() => setShowSettings(false)} />}
      {exportDialogOpen && (
        <ExportDialog
          onExport={handleExport}
          onCopy={handleCopy}
          onClose={() => setExportDialogOpen(false)}
        />
      )}
      {copyToast && (
        <div style={{
          position: 'fixed',
          bottom: 'max(72px, calc(env(safe-area-inset-bottom, 0px) + 72px))',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          background: 'rgba(13,17,23,0.92)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: '8px 16px',
          fontSize: 13,
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
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '8px 12px',
        fontSize: 13,
        color: disabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
        background: 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--color-surface-3)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <Icon size={14} />
      {label}
    </button>
  )
}
