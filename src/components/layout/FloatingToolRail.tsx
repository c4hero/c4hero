import { forwardRef, lazy, Suspense, useEffect, useRef, useState } from 'react'
import LoadingDot from '@/components/shared/LoadingDot'
import { useReactFlow } from '@xyflow/react'
import { useWorkspaceStore, getActiveView } from '@/store/workspace'
import type { LayoutDirection } from '@/types/model'
import {
  Plus,
  ArrowDown,
  ArrowUp,
  ArrowRight,
  ArrowLeft,
  LayoutDashboard,
  Maximize2,
  Settings,
  MousePointerClick,
} from 'lucide-react'
import { useArrowNav } from '@/hooks/useArrowNav'
import { useFlyoutFocus } from '@/hooks/useFlyoutFocus'
import AddElementPanel from '@/components/layout/AddElementPanel'

const CanvasSettingsDialog = lazy(() => import('@/components/settings/CanvasSettingsDialog'))

const DIRECTION_ICONS: Record<LayoutDirection, React.ReactNode> = {
  TB: <ArrowDown size={14} />,
  BT: <ArrowUp size={14} />,
  LR: <ArrowRight size={14} />,
  RL: <ArrowLeft size={14} />,
}

const DIRECTION_LABELS: Record<LayoutDirection, string> = {
  TB: 'Top to bottom',
  BT: 'Bottom to top',
  LR: 'Left to right',
  RL: 'Right to left',
}

export default function FloatingToolRail() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const resetAndRelayout = useWorkspaceStore((s) => s.resetAndRelayout)



  const reactFlow = useReactFlow()
  const multiSelectMode = useWorkspaceStore((s) => s.multiSelectMode)
  const setMultiSelectMode = useWorkspaceStore((s) => s.setMultiSelectMode)
  const addPanelOpen = useWorkspaceStore((s) => s.addElementPanelOpen)
  const setAddPanelOpen = useWorkspaceStore((s) => s.setAddElementPanelOpen)
  const [arrangePanelOpen, setArrangePanelOpen] = useState(false)

  const canvasSettingsOpen = useWorkspaceStore((s) => s.canvasSettingsOpen)
  const setCanvasSettingsOpen = useWorkspaceStore((s) => s.setCanvasSettingsOpen)

  const arrangeFlyoutRef = useRef<HTMLDivElement>(null)

  const addElementFlyoutRef = useRef<HTMLDivElement>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const arrangeBtnRef = useRef<HTMLButtonElement>(null)
  useArrowNav(arrangeFlyoutRef)

  // Track which trigger to return focus to on close
  const lastOpenPanel = useRef<'add' | 'arrange' | 'align' | null>(null)

  // Escape key closes any open flyout
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setAddPanelOpen(false)
        setArrangePanelOpen(false)

      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setAddPanelOpen, setArrangePanelOpen])

  // Outside-click closes any open flyout. Document-level listener works across
  // stacking contexts (the tool rail is z:50 like other floating UI, so a fixed
  // overlay inside it cannot catch clicks on sibling panels).
  useEffect(() => {
    if (!addPanelOpen && !arrangePanelOpen) return
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (addPanelOpen) {
        const inFlyout = addElementFlyoutRef.current?.contains(target)
        const onTrigger = addBtnRef.current?.contains(target)
        if (!inFlyout && !onTrigger) setAddPanelOpen(false)
      }
      if (arrangePanelOpen) {
        const inFlyout = arrangeFlyoutRef.current?.contains(target)
        const onTrigger = arrangeBtnRef.current?.contains(target)
        if (!inFlyout && !onTrigger) setArrangePanelOpen(false)
      }
    }
    // Use pointerdown in the capture phase so nothing else can stop propagation
    // before we see the event.
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [addPanelOpen, arrangePanelOpen, setAddPanelOpen, setArrangePanelOpen])

  // Focus management: move focus into flyout when opened, return to trigger when closed
  useFlyoutFocus(addPanelOpen, addElementFlyoutRef, addBtnRef, lastOpenPanel, 'add')
  useFlyoutFocus(arrangePanelOpen, arrangeFlyoutRef, arrangeBtnRef, lastOpenPanel, 'arrange')


  if (!workspace) return null

  const view = activeViewKey ? getActiveView(workspace, activeViewKey) : undefined
  const currentDirection = view?.autoLayout?.direction ?? 'TB'

  function handleAutoArrange(direction?: LayoutDirection) {
    if (!activeViewKey) return
    resetAndRelayout(activeViewKey, direction)
    setArrangePanelOpen(false)
    // Wait for the new layout to be applied (positions recomputed + nodes
    // re-measured) before fitting the viewport to the freshly arranged graph.
    setTimeout(() => reactFlow.fitView({ duration: 300, padding: 0.2 }), 120)
  }

  return (
    <>
    <div
      className="glass-panel"
      role="toolbar"
      aria-label="Canvas tools"
      style={{
        position: 'fixed',
        left: 14,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 0',
        borderRadius: 'var(--radius-xl)',
      }}
    >
      {/* Add element */}
      <div style={{ position: 'relative' }}>
        <RailBtn
          ref={addBtnRef}
          icon={<Plus size={16} />}
          label="Add element"
          active={addPanelOpen}
          expanded={addPanelOpen}
          onClick={() => { setAddPanelOpen(!addPanelOpen); setArrangePanelOpen(false) }}
        />
        {addPanelOpen && (
          <div ref={addElementFlyoutRef}>
            <AddElementPanel onClose={() => setAddPanelOpen(false)} />
          </div>
        )}
      </div>

      {/* Auto-arrange */}
      <RailSep />
      <div style={{ position: 'relative' }}>
        <RailBtn
          ref={arrangeBtnRef}
          icon={<LayoutDashboard size={16} />}
          label="Auto-arrange"
          active={arrangePanelOpen}
          expanded={arrangePanelOpen}
          onClick={() => { setArrangePanelOpen((o) => !o); setAddPanelOpen(false) }}
        />
        {arrangePanelOpen && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 49 }}
              onClick={() => setArrangePanelOpen(false)}
            />
            <div
              ref={arrangeFlyoutRef}
              role="menu"
              className="glass-flyout"
              style={{
                position: 'absolute',
                left: 56,
                top: 0,
                zIndex: 50,
                padding: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                minWidth: 160,
              }}
            >
              <div className="flyout-label">
                Auto-arrange
              </div>
              {(['TB', 'LR', 'BT', 'RL'] as LayoutDirection[]).map((dir) => (
                <button
                  key={dir}
                  className="flyout-item"
                  data-active={currentDirection === dir}
                  onClick={() => handleAutoArrange(dir)}
                >
                  <span style={{ color: currentDirection === dir ? 'var(--color-accent)' : 'var(--color-text-muted)', display: 'flex' }}>
                    {DIRECTION_ICONS[dir]}
                  </span>
                  {DIRECTION_LABELS[dir]}
                  {currentDirection === dir && (
                    <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-accent)' }}>
                      current
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Multi-select actions now live in the contextual MultiSelectBar */}

      {/* Multi-select mode toggle */}
      <RailSep />
      <RailBtn
        icon={<MousePointerClick size={16} />}
        label={multiSelectMode ? 'Multi-select: ON (tap to turn off)' : 'Multi-select (tap multiple nodes)'}
        active={multiSelectMode}
        onClick={() => setMultiSelectMode(!multiSelectMode)}
      />

      {/* Zoom to fit */}
      <RailSep />
      <RailBtn
        icon={<Maximize2 size={16} />}
        label="Zoom to fit"
        onClick={() => reactFlow.fitView({ duration: 300, padding: 0.2 })}
      />
      <RailSep />
      <RailBtn
        icon={<Settings size={16} />}
        label="Canvas settings"
        onClick={() => setCanvasSettingsOpen(true)}
      />
    </div>
    {canvasSettingsOpen && <Suspense fallback={<LoadingDot />}><CanvasSettingsDialog onClose={() => setCanvasSettingsOpen(false)} /></Suspense>}
    </>
  )
}

// ─── Rail primitives ──────────────────────────────────────────────────

function RailSep() {
  return (
    <div
      style={{
        width: 28,
        height: 1,
        background: 'var(--color-border)',
        margin: '4px 8px',
      }}
    />
  )
}

const RailBtn = forwardRef<HTMLButtonElement, {
  icon: React.ReactNode
  label: string
  color?: string
  active?: boolean
  expanded?: boolean
  onClick?: () => void
}>(function RailBtn({ icon, label, color, active, expanded, onClick }, ref) {
  return (
    <button
      ref={ref}
      title={label}
      aria-label={label}
      aria-expanded={expanded}
      aria-haspopup={expanded !== undefined ? 'true' : undefined}
      onClick={onClick}
      className="hover-lift-inactive"
      data-active={active ? 'true' : undefined}
      style={{
        width: 44,
        height: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        margin: '1px 4px',
        ...(active ? { background: 'var(--color-accent-active)' } : {}),
        color: active ? 'var(--color-accent)' : color ?? 'var(--color-text-muted)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.12s, color 0.12s',
        border: 'none',
      }}
    >
      {icon}
    </button>
  )
})
