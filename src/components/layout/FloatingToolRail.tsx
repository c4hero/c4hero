import { forwardRef, useEffect, useRef, useState } from 'react'
import CanvasSettingsDialog from '@/components/settings/CanvasSettingsDialog'
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
  Layers,
  Trash2,
  AlignStartVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  AlignCenterVertical,
  AlignCenterHorizontal,
  Settings,
} from 'lucide-react'
import { useArrowNav } from '@/hooks/useArrowNav'
import AddElementPanel from '@/components/layout/AddElementPanel'

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
  const selectedElementIds = useWorkspaceStore((s) => s.selectedElementIds)
  const addGroup = useWorkspaceStore((s) => s.addGroup)
  const selectGroup = useWorkspaceStore((s) => s.selectGroup)
  const deleteElement = useWorkspaceStore((s) => s.deleteElement)
  const updateNodePosition = useWorkspaceStore((s) => s.updateNodePosition)
  const reactFlow = useReactFlow()
  const [addPanelOpen, setAddPanelOpen] = useState(false)
  const [arrangePanelOpen, setArrangePanelOpen] = useState(false)
  const [alignPanelOpen, setAlignPanelOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const arrangeFlyoutRef = useRef<HTMLDivElement>(null)
  const alignFlyoutRef = useRef<HTMLDivElement>(null)
  const addElementFlyoutRef = useRef<HTMLDivElement>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const arrangeBtnRef = useRef<HTMLButtonElement>(null)
  const alignBtnRef = useRef<HTMLButtonElement>(null)
  useArrowNav(arrangeFlyoutRef)
  useArrowNav(alignFlyoutRef)

  // Track which trigger to return focus to on close
  const lastOpenPanel = useRef<'add' | 'arrange' | 'align' | null>(null)

  // Escape key closes any open flyout
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setAddPanelOpen(false)
        setArrangePanelOpen(false)
        setAlignPanelOpen(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Focus management: move focus into flyout when opened, return to trigger when closed
  const prevAddOpen = useRef(false)
  const prevArrangeOpen = useRef(false)
  const prevAlignOpen = useRef(false)

  useEffect(() => {
    if (addPanelOpen && !prevAddOpen.current) {
      lastOpenPanel.current = 'add'
      // Focus first focusable element inside the add element flyout
      requestAnimationFrame(() => {
        const container = addElementFlyoutRef.current
        if (container) {
          const focusable = container.querySelector<HTMLElement>(
            'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
          focusable?.focus()
        }
      })
    } else if (!addPanelOpen && prevAddOpen.current && lastOpenPanel.current === 'add') {
      addBtnRef.current?.focus()
      lastOpenPanel.current = null
    }
    prevAddOpen.current = addPanelOpen
  }, [addPanelOpen])

  useEffect(() => {
    if (arrangePanelOpen && !prevArrangeOpen.current) {
      lastOpenPanel.current = 'arrange'
      requestAnimationFrame(() => {
        const container = arrangeFlyoutRef.current
        if (container) {
          const focusable = container.querySelector<HTMLElement>(
            'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
          focusable?.focus()
        }
      })
    } else if (!arrangePanelOpen && prevArrangeOpen.current && lastOpenPanel.current === 'arrange') {
      arrangeBtnRef.current?.focus()
      lastOpenPanel.current = null
    }
    prevArrangeOpen.current = arrangePanelOpen
  }, [arrangePanelOpen])

  useEffect(() => {
    if (alignPanelOpen && !prevAlignOpen.current) {
      lastOpenPanel.current = 'align'
      requestAnimationFrame(() => {
        const container = alignFlyoutRef.current
        if (container) {
          const focusable = container.querySelector<HTMLElement>(
            'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
          focusable?.focus()
        }
      })
    } else if (!alignPanelOpen && prevAlignOpen.current && lastOpenPanel.current === 'align') {
      alignBtnRef.current?.focus()
      lastOpenPanel.current = null
    }
    prevAlignOpen.current = alignPanelOpen
  }, [alignPanelOpen])

  if (!workspace) return null

  const view = activeViewKey ? getActiveView(workspace, activeViewKey) : undefined
  const currentDirection = view?.autoLayout?.direction ?? 'TB'

  function handleAlign(mode: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') {
    if (selectedElementIds.length < 2) return
    const rfNodes = reactFlow.getNodes().filter(n => selectedElementIds.includes(n.id))
    if (rfNodes.length < 2) return

    switch (mode) {
      case 'left': {
        const minX = Math.min(...rfNodes.map(n => n.position.x))
        for (const n of rfNodes) updateNodePosition(n.id, minX, n.position.y)
        break
      }
      case 'center-x': {
        const avgX = rfNodes.reduce((sum, n) => sum + n.position.x + (n.measured?.width ?? 200) / 2, 0) / rfNodes.length
        for (const n of rfNodes) updateNodePosition(n.id, avgX - (n.measured?.width ?? 200) / 2, n.position.y)
        break
      }
      case 'right': {
        const maxRight = Math.max(...rfNodes.map(n => n.position.x + (n.measured?.width ?? 200)))
        for (const n of rfNodes) updateNodePosition(n.id, maxRight - (n.measured?.width ?? 200), n.position.y)
        break
      }
      case 'top': {
        const minY = Math.min(...rfNodes.map(n => n.position.y))
        for (const n of rfNodes) updateNodePosition(n.id, n.position.x, minY)
        break
      }
      case 'center-y': {
        const avgY = rfNodes.reduce((sum, n) => sum + n.position.y + (n.measured?.height ?? 100) / 2, 0) / rfNodes.length
        for (const n of rfNodes) updateNodePosition(n.id, n.position.x, avgY - (n.measured?.height ?? 100) / 2)
        break
      }
      case 'bottom': {
        const maxBottom = Math.max(...rfNodes.map(n => n.position.y + (n.measured?.height ?? 100)))
        for (const n of rfNodes) updateNodePosition(n.id, n.position.x, maxBottom - (n.measured?.height ?? 100))
        break
      }
    }
  }

  function handleAutoArrange(direction?: LayoutDirection) {
    if (!activeViewKey) return
    resetAndRelayout(activeViewKey, direction)
    setArrangePanelOpen(false)
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
          onClick={() => { setAddPanelOpen((o) => !o); setArrangePanelOpen(false) }}
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

      {/* Multi-select actions */}
      {selectedElementIds.length >= 2 && (
        <>
          <RailSep />

          {/* Align */}
          <div style={{ position: 'relative' }}>
            <RailBtn
              ref={alignBtnRef}
              icon={<AlignCenterVertical size={16} />}
              label="Align"
              active={alignPanelOpen}
              expanded={alignPanelOpen}
              onClick={() => { setAlignPanelOpen((o) => !o); setAddPanelOpen(false); setArrangePanelOpen(false) }}
            />
            {alignPanelOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                  onClick={() => setAlignPanelOpen(false)}
                />
                <div
                  ref={alignFlyoutRef}
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
                    minWidth: 170,
                  }}
                >
                  <div className="flyout-label">
                    Align {selectedElementIds.length} elements
                  </div>
                  <AlignMenuItem icon={<AlignStartVertical size={14} />} label="Align left" onClick={() => { handleAlign('left'); setAlignPanelOpen(false) }} />
                  <AlignMenuItem icon={<AlignCenterVertical size={14} />} label="Align center (X)" onClick={() => { handleAlign('center-x'); setAlignPanelOpen(false) }} />
                  <AlignMenuItem icon={<AlignEndVertical size={14} />} label="Align right" onClick={() => { handleAlign('right'); setAlignPanelOpen(false) }} />
                  <div style={{ height: 1, background: 'var(--color-border)', margin: '2px 6px' }} />
                  <AlignMenuItem icon={<AlignStartHorizontal size={14} />} label="Align top" onClick={() => { handleAlign('top'); setAlignPanelOpen(false) }} />
                  <AlignMenuItem icon={<AlignCenterHorizontal size={14} />} label="Align middle (Y)" onClick={() => { handleAlign('center-y'); setAlignPanelOpen(false) }} />
                  <AlignMenuItem icon={<AlignEndHorizontal size={14} />} label="Align bottom" onClick={() => { handleAlign('bottom'); setAlignPanelOpen(false) }} />
                </div>
              </>
            )}
          </div>

          {/* Group */}
          <RailBtn
            icon={<Layers size={16} />}
            label={`Group ${selectedElementIds.length} elements`}
            onClick={() => {
              const id = addGroup('New Group', selectedElementIds)
              selectGroup(id)
            }}
          />

          {/* Delete */}
          <RailBtn
            icon={<Trash2 size={16} />}
            label={`Delete ${selectedElementIds.length} elements`}
            color="var(--color-error)"
            onClick={() => {
              for (const id of selectedElementIds) deleteElement(id)
            }}
          />
        </>
      )}

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
        onClick={() => setShowSettings(true)}
      />
    </div>
    {showSettings && <CanvasSettingsDialog onClose={() => setShowSettings(false)} />}
    </>
  )
}

// ─── Align menu item ──────────────────────────────────────────────────

function AlignMenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="flyout-item" onClick={onClick}>
      <span style={{ color: 'var(--color-text-muted)', display: 'flex' }}>{icon}</span>
      {label}
    </button>
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
        background: active ? 'rgba(88,166,255,0.12)' : 'transparent',
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
