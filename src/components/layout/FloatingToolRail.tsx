import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { useEscapeKey } from '@/hooks/useEscapeKey'
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
  Sparkles,
} from 'lucide-react'
import { useAiSettingsStore, isAiReady } from '@/store/ai-settings'
import { missingInfoGaps } from '@/lib/ai'
import { viewScopeIds } from '@/components/ai/sweepModel'
import { useArrowNav } from '@/hooks/useArrowNav'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { useFlyoutFocus } from '@/hooks/useFlyoutFocus'
import AddElementPanel from '@/components/layout/AddElementPanel'
import { fitContentNodesToViewport } from '@/lib/fitViewport'
import CanvasSettingsDialog from '@/components/settings/CanvasSettingsDialog'

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

  const setAiPanelOpen = useWorkspaceStore((s) => s.setAiPanelOpen)
  const setAiSettingsOpen = useWorkspaceStore((s) => s.setAiSettingsOpen)
  // The assistant renders on aiPanelOpen OR aiSettingsOpen, so the button must
  // reflect/toggle either — otherwise it can't dismiss a settings-opened panel.
  const aiOpen = useWorkspaceStore((s) => s.aiPanelOpen || s.aiSettingsOpen)
  const aiReady = useAiSettingsStore(isAiReady)
  // Launcher visibility. When off, the assistant is still reachable from the
  // command palette (I) and the app menu — hiding the button doesn't disable AI.
  const showLauncher = useAiSettingsStore((s) => s.enabled)
  const [aiHover, setAiHover] = useState(false)
  // Pending quick-fixes the assistant can resolve — surfaced as a count badge on
  // the AI button so the work waiting inside is visible without opening it.
  // Scoped to the *current view* (matching the assistant's default "this view"
  // scope), not the whole model.
  const pendingCount = useMemo(() => {
    if (!aiReady || !workspace) return 0
    const v = activeViewKey ? getActiveView(workspace, activeViewKey) : undefined
    return missingInfoGaps(workspace, viewScopeIds(v)).length
  }, [aiReady, workspace, activeViewKey])

  const reactFlow = useReactFlow()
  const breakpoint = useBreakpoint()
  // The tool rail is a vertical column on the left at desktop sizes and a
  // horizontal row near the bottom on phones. The Zoom-to-fit math needs
  // this signal so it reserves space on the correct edge — without it,
  // mobile fits leave the diagram squeezed into the bottom-right.
  const fitChromeSide = breakpoint === 'mobile' ? 'bottom' : 'left'
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

  // Escape key closes any open flyout (active only while one is open).
  useEscapeKey(addPanelOpen || arrangePanelOpen, () => {
    setAddPanelOpen(false)
    setArrangePanelOpen(false)
  })

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
    setTimeout(() => fitContentNodesToViewport(reactFlow), 120)
  }

  return (
    <>
    <div
      data-canvas-chrome="tool-rail-wrap"
      style={{
        position: 'fixed',
        left: 14,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        // Stretch so the AI button matches the tool rail's width.
        alignItems: 'stretch',
        gap: 10,
      }}
    >
      {/* AI assistant — its own button above the tool rail, shown only when the
          launcher is enabled (Show AI assistant). Two states: a filled accent
          background while the dialog is open, and a status dot (green = key set,
          grey = needs setup). Hidden entirely when the launcher is turned off. */}
      {showLauncher && (
      <button
        type="button"
        className="glass-panel"
        title={aiOpen ? 'Hide AI assistant (I)' : aiReady ? 'AI assistant (I)' : 'AI assistant — set up your key (I)'}
        aria-label={pendingCount > 0 ? `AI assistant — ${pendingCount} pending` : 'AI assistant'}
        aria-pressed={aiOpen}
        data-active={aiOpen ? 'true' : undefined}
        onClick={() => {
          const s = useWorkspaceStore.getState()
          if (s.aiPanelOpen || s.aiSettingsOpen) { setAiPanelOpen(false); setAiSettingsOpen(false) }
          else setAiPanelOpen(true)
        }}
        onPointerEnter={() => setAiHover(true)}
        onPointerLeave={() => setAiHover(false)}
        style={{
          position: 'relative',
          minWidth: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-lg)',
          cursor: 'pointer',
          // Self-contained hover so it reads consistently: keep the glass fill
          // and brighten on hover. The shared hover-lift class instead *replaces*
          // the background, which made this standalone glass button flicker.
          transition: 'filter 0.12s ease, color 0.12s ease, background 0.12s ease',
          filter: aiHover ? 'brightness(1.18)' : undefined,
          // Open = solid accent fill with a dark icon (clearly "on"); closed =
          // accent icon when ready, muted when off.
          color: aiOpen ? 'var(--color-bg-primary)' : aiReady ? 'var(--color-accent)' : 'var(--color-text-muted)',
          background: aiOpen ? 'var(--color-accent)' : undefined,
          borderColor: aiOpen ? 'var(--color-accent)' : undefined,
        }}
      >
        <Sparkles size={18} style={{ pointerEvents: 'none' }} />
        {aiReady && pendingCount > 0 && !aiOpen ? (
          <span style={{ pointerEvents: 'none', position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#22c55e', color: '#05300f', fontSize: 11, fontWeight: 800, lineHeight: 1, border: '2px solid var(--color-bg-primary)' }}>
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        ) : (
          <span style={{ pointerEvents: 'none', position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: '50%', background: aiReady ? '#22c55e' : 'var(--color-text-muted)', border: `2px solid ${aiOpen ? 'var(--color-accent)' : 'var(--glass-bg-heavy)'}` }} />
        )}
      </button>
      )}

    <div
      className="glass-panel"
      role="toolbar"
      aria-label="Canvas tools"
      data-canvas-fit-chrome={fitChromeSide}
      data-canvas-chrome="tool-rail"
      style={{
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
        {addPanelOpen && breakpoint !== 'mobile' && (
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
              data-flyout="arrange"
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
        onClick={() => fitContentNodesToViewport(reactFlow)}
      />
      <RailSep />
      <RailBtn
        icon={<Settings size={16} />}
        label="Canvas settings"
        onClick={() => setCanvasSettingsOpen(true)}
      />
    </div>
    </div>
    {addPanelOpen && breakpoint === 'mobile' && (
      <div ref={addElementFlyoutRef} data-mobile-add-flyout>
        <AddElementPanel onClose={() => setAddPanelOpen(false)} />
      </div>
    )}
    {canvasSettingsOpen && <CanvasSettingsDialog onClose={() => setCanvasSettingsOpen(false)} />}
    </>
  )
}

// ─── Rail primitives ──────────────────────────────────────────────────

function RailSep() {
  // Inline dimensions are for the default (vertical / column) orientation.
  // On narrow viewports the rail flips to a horizontal row near the bottom
  // edge — the mobile media query in index.css swaps these dimensions so
  // the separator becomes a thin vertical line between row buttons.
  return (
    <div
      className="rail-sep"
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
        // No horizontal margin: keeps the rail the same width as the 44px AI
        // button above it. The stretch wrapper then matches them exactly.
        margin: '1px 0',
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
