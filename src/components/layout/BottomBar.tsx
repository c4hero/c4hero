import { useMemo } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useWorkspaceStore, getActiveView, buildElementMap } from '@/store/workspace'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { Minus, Plus, Maximize2, Grid3X3, Map } from 'lucide-react'

export default function BottomBar() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const activeTagFilter = useWorkspaceStore((s) => s.activeTagFilter)
  const setActiveTagFilter = useWorkspaceStore((s) => s.setActiveTagFilter)
  const snapToGrid = useWorkspaceStore((s) => s.snapToGrid)
  const toggleSnapToGrid = useWorkspaceStore((s) => s.toggleSnapToGrid)
  const minimapEnabled = useWorkspaceStore((s) => s.minimapEnabled)
  const toggleMinimap = useWorkspaceStore((s) => s.toggleMinimap)
  const breakpoint = useBreakpoint()

  const view = workspace && activeViewKey ? getActiveView(workspace, activeViewKey) : undefined

  const viewTags = useMemo(() => {
    if (!view || !workspace) return []
    const tags = new Set<string>()
    const elementMap = buildElementMap(workspace)
    for (const ve of view.elements) {
      const el = elementMap.get(ve.id)
      if (el) {
        for (const tag of el.tags) {
          if (!['Person', 'Software System', 'Container', 'Component', 'Element', 'Relationship'].includes(tag)) {
            tags.add(tag)
          }
        }
      }
    }
    return Array.from(tags).sort()
  }, [workspace, view])

  if (!workspace) return null

  return (
    <footer className="glass-panel-solid relative z-20 flex h-9 shrink-0 items-center justify-between border-t px-3">
      {/* Left: Tags */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {view && (
          <span className="shrink-0 text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
            {view.elements.length} element{view.elements.length !== 1 ? 's' : ''}
          </span>
        )}
        {viewTags.length > 0 && (
          <>
            <span className="text-[10px]" style={{ color: 'var(--color-border)' }}>|</span>
            {viewTags.slice(0, 8).map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium transition-all duration-150"
                style={{
                  background: activeTagFilter === tag ? 'var(--color-accent)' : 'var(--color-surface-3)',
                  color: activeTagFilter === tag ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
                }}
              >
                {tag}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Right: controls */}
      {breakpoint !== 'mobile' && (
        <div className="flex items-center gap-0.5">
          {/* Snap to grid toggle */}
          <button
            onClick={toggleSnapToGrid}
            className="btn-icon !min-h-6 !min-w-6 !p-1"
            title={`Snap to grid: ${snapToGrid ? 'ON' : 'OFF'}`}
            style={{ color: snapToGrid ? 'var(--color-accent)' : undefined }}
          >
            <Grid3X3 size={12} />
          </button>
          {/* Minimap toggle */}
          <button
            onClick={toggleMinimap}
            className="btn-icon !min-h-6 !min-w-6 !p-1"
            title={`Minimap: ${minimapEnabled ? 'ON' : 'OFF'}`}
            style={{ color: minimapEnabled ? 'var(--color-accent)' : undefined }}
          >
            <Map size={12} />
          </button>

          <span className="mx-1 text-[10px]" style={{ color: 'var(--color-border)' }}>|</span>

          {/* Zoom controls */}
          <ZoomControls />
        </div>
      )}
    </footer>
  )
}

function ZoomControls() {
  const reactFlow = useReactFlow()

  return (
    <>
      <button className="btn-icon !min-h-6 !min-w-6 !p-1" title="Zoom out" onClick={() => reactFlow.zoomOut({ duration: 200 })}>
        <Minus size={12} />
      </button>
      <ZoomDisplay />
      <button className="btn-icon !min-h-6 !min-w-6 !p-1" title="Zoom in" onClick={() => reactFlow.zoomIn({ duration: 200 })}>
        <Plus size={12} />
      </button>
      <button className="btn-icon !min-h-6 !min-w-6 !p-1 !ml-1" title="Fit to screen" onClick={() => reactFlow.fitView({ duration: 300, padding: 0.2 })}>
        <Maximize2 size={12} />
      </button>
    </>
  )
}

function ZoomDisplay() {
  const reactFlow = useReactFlow()
  const zoom = reactFlow.getZoom()
  return (
    <span className="min-w-[40px] text-center text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
      {Math.round(zoom * 100)}%
    </span>
  )
}
