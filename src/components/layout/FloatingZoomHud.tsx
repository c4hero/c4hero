import { useReactFlow, useViewport } from '@xyflow/react'
import { Minus, Plus, Maximize2 } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace'
import { useSettingsStore } from '@/store/settings'
import { fitContentNodesToViewport } from '@/lib/fitViewport'

export default function FloatingZoomHud() {
  const hasWorkspace = useWorkspaceStore((s) => s.workspace !== null)
  const showZoomControls = useSettingsStore((s) => s.showZoomControls)
  const reactFlow = useReactFlow()

  if (!hasWorkspace || !showZoomControls) return null

  return (
    <div
      className="glass-panel"
      style={{
        position: 'fixed',
        bottom: 'max(14px, calc(env(safe-area-inset-bottom, 0px) + 8px))',
        right: 14,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      <ZoomHudBtn title="Zoom out" onClick={() => reactFlow.zoomOut({ duration: 200 })}>
        <Minus size={13} />
      </ZoomHudBtn>

      <ZoomLabel />

      <ZoomHudBtn title="Zoom in" onClick={() => reactFlow.zoomIn({ duration: 200 })}>
        <Plus size={13} />
      </ZoomHudBtn>

      <div style={{ width: 1, height: 20, background: 'var(--color-border)' }} />

      <ZoomHudBtn title="Fit to screen" onClick={() => fitContentNodesToViewport(reactFlow)}>
        <Maximize2 size={13} />
      </ZoomHudBtn>
    </div>
  )
}

function ZoomHudBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode
  title?: string
  onClick?: () => void
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className="hover-lift"
      style={{
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-muted)',
        cursor: 'pointer',
        transition: 'background 0.12s, color 0.12s',
        border: 'none',
      }}
    >
      {children}
    </button>
  )
}

function ZoomLabel() {
  const { zoom } = useViewport()
  return (
    <span
      style={{
        padding: '0 8px',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        color: 'var(--color-text-muted)',
        borderLeft: '1px solid var(--color-border)',
        borderRight: '1px solid var(--color-border)',
        height: 32,
        display: 'flex',
        alignItems: 'center',
        minWidth: 44,
        justifyContent: 'center',
      }}
    >
      {Math.round(zoom * 100)}%
    </span>
  )
}
