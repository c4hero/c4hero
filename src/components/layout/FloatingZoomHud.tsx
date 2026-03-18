import { useReactFlow } from '@xyflow/react'
import { Minus, Plus, Maximize2 } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace'
import { useSettingsStore } from '@/store/settings'

export default function FloatingZoomHud() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const showZoomControls = useSettingsStore((s) => s.showZoomControls)
  const reactFlow = useReactFlow()

  if (!workspace || !showZoomControls) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'max(14px, calc(env(safe-area-inset-bottom, 0px) + 8px))',
        right: 14,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        borderRadius: 10,
        border: '1px solid var(--color-border)',
        background: 'rgba(13, 17, 23, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.03)',
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

      <ZoomHudBtn title="Fit to screen" onClick={() => reactFlow.fitView({ duration: 300, padding: 0.2 })}>
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
      style={{
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-muted)',
        background: 'transparent',
        cursor: 'pointer',
        transition: 'background 0.12s, color 0.12s',
        border: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
        e.currentTarget.style.color = 'var(--color-text-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--color-text-muted)'
      }}
    >
      {children}
    </button>
  )
}

function ZoomLabel() {
  const reactFlow = useReactFlow()
  const zoom = reactFlow.getZoom()
  return (
    <span
      style={{
        padding: '0 8px',
        fontSize: 11,
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
