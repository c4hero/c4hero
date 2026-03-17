import { useState } from 'react'
import { useWorkspaceStore, getAllViews, getBreadcrumb } from '@/store/workspace'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { exportAsJSON, downloadFile, downloadBlob, exportCanvasAsPNG, exportCanvasAsSVG } from '@/lib/exportUtils'
import { serializeDSL } from '@/lib/dsl'
import { saveDSLFile } from '@/lib/fileIO'
import {
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Download,
  Search,
  Undo2,
  Redo2,
  Maximize,
  Save,
} from 'lucide-react'

export default function TopBar() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const viewHistory = useWorkspaceStore((s) => s.viewHistory)
  const setActiveView = useWorkspaceStore((s) => s.setActiveView)
  const navigateBack = useWorkspaceStore((s) => s.navigateBack)
  const leftPanelOpen = useWorkspaceStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkspaceStore((s) => s.rightPanelOpen)
  const toggleLeftPanel = useWorkspaceStore((s) => s.toggleLeftPanel)
  const toggleRightPanel = useWorkspaceStore((s) => s.toggleRightPanel)
  const undo = useWorkspaceStore((s) => s.undo)
  const redo = useWorkspaceStore((s) => s.redo)
  const canUndo = useWorkspaceStore((s) => s.canUndo)
  const canRedo = useWorkspaceStore((s) => s.canRedo)
  const setSearchOpen = useWorkspaceStore((s) => s.setSearchOpen)
  const setPresentationMode = useWorkspaceStore((s) => s.setPresentationMode)
  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'

  const [exportMenuOpen, setExportMenuOpen] = useState(false)

  const views = workspace ? getAllViews(workspace) : []
  const breadcrumb = workspace && activeViewKey
    ? getBreadcrumb(workspace, viewHistory, activeViewKey)
    : []

  const wsName = workspace?.name ?? 'workspace'

  async function handleSave() {
    if (!workspace) return
    const dsl = serializeDSL(workspace)
    await saveDSLFile(dsl, `${wsName}.dsl`)
  }

  async function handleExport(format: 'dsl' | 'json' | 'png' | 'svg') {
    if (!workspace) return
    setExportMenuOpen(false)

    switch (format) {
      case 'dsl':
        downloadFile(serializeDSL(workspace), `${wsName}.dsl`, 'text/plain')
        break
      case 'json':
        downloadFile(exportAsJSON(workspace), `${wsName}.json`, 'application/json')
        break
      case 'png': {
        const blob = await exportCanvasAsPNG()
        if (blob) downloadBlob(blob, `${wsName}.png`)
        break
      }
      case 'svg': {
        const svg = exportCanvasAsSVG()
        if (svg) downloadFile(svg, `${wsName}.svg`, 'image/svg+xml')
        break
      }
    }
  }

  return (
    <header className="glass-panel-solid relative z-50 flex h-12 shrink-0 items-center justify-between border-b px-3 sm:px-4">
      {/* Left */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button onClick={toggleLeftPanel} className="btn-icon" title={leftPanelOpen ? 'Close left panel' : 'Open left panel'}>
          {leftPanelOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
        <div className="flex items-center gap-2">
          <img src="https://c4hero.com/c4-logo.svg" alt="c4hero" className="h-5 sm:h-6" />
          {!isMobile && workspace?.name && (
            <>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>/</span>
              <span className="max-w-[120px] truncate text-sm font-medium">{workspace.name}</span>
            </>
          )}
        </div>
        {!isMobile && workspace && (
          <div className="ml-2 flex items-center gap-0.5">
            <button onClick={undo} disabled={!canUndo()} className="btn-icon disabled:opacity-30" title="Undo (Ctrl+Z)">
              <Undo2 size={15} />
            </button>
            <button onClick={redo} disabled={!canRedo()} className="btn-icon disabled:opacity-30" title="Redo (Ctrl+Shift+Z)">
              <Redo2 size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Center: Breadcrumb + View selector */}
      {workspace && (
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1">
          {breadcrumb.length > 1 && !isMobile && (
            <div className="flex items-center gap-0.5">
              {breadcrumb.slice(0, -1).map((crumb, i) => (
                <div key={crumb.key} className="flex items-center gap-0.5">
                  {i > 0 && <ChevronRight size={12} style={{ color: 'var(--color-text-muted)' }} />}
                  <button
                    onClick={() => { const steps = breadcrumb.length - 1 - i; for (let s = 0; s < steps; s++) navigateBack() }}
                    className="rounded-md px-2 py-1 text-xs transition-colors duration-150 hover:bg-[var(--color-surface-3)]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {crumb.label}
                  </button>
                </div>
              ))}
              <ChevronRight size={12} style={{ color: 'var(--color-text-muted)' }} />
            </div>
          )}
          <div className="relative">
            <select
              value={activeViewKey ?? ''}
              onChange={(e) => setActiveView(e.target.value)}
              className="glass-panel appearance-none rounded-lg border py-1.5 pl-3 pr-8 text-xs font-semibold sm:text-sm"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {views.map((v) => (
                <option key={v.key} value={v.key}>{v.title ?? v.key}</option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
          </div>
        </div>
      )}

      {/* Right */}
      <div className="flex items-center gap-0.5">
        {!isMobile && workspace && (
          <>
            <button onClick={() => setSearchOpen(true)} className="btn-icon" title="Search (Ctrl+K)">
              <Search size={16} />
            </button>
            <button onClick={() => setPresentationMode(true)} className="btn-icon" title="Presentation mode (F)">
              <Maximize size={16} />
            </button>
            <button onClick={handleSave} className="btn-icon" title="Save (Ctrl+S)">
              <Save size={16} />
            </button>

            {/* Export dropdown */}
            <div className="relative">
              <button onClick={() => setExportMenuOpen(!exportMenuOpen)} className="btn-icon" title="Export">
                <Download size={16} />
              </button>
              {exportMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                  <div
                    className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border py-1 shadow-xl"
                    style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)' }}
                  >
                    <ExportItem label="Structurizr DSL" ext=".dsl" onClick={() => handleExport('dsl')} />
                    <ExportItem label="Workspace JSON" ext=".json" onClick={() => handleExport('json')} />
                    <div className="my-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
                    <ExportItem label="PNG Image" ext=".png" onClick={() => handleExport('png')} />
                    <ExportItem label="SVG Vector" ext=".svg" onClick={() => handleExport('svg')} />
                  </div>
                </>
              )}
            </div>
          </>
        )}
        <button onClick={toggleRightPanel} className="btn-icon" title={rightPanelOpen ? 'Close right panel' : 'Open right panel'}>
          {rightPanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </button>
      </div>
    </header>
  )
}

function ExportItem({ label, ext, onClick }: { label: string; ext: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors hover:bg-[var(--color-surface-3)]"
      style={{ color: 'var(--color-text-primary)' }}
    >
      <span>{label}</span>
      <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{ext}</span>
    </button>
  )
}
