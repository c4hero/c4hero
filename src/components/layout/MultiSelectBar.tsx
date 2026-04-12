import { useEffect, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useWorkspaceStore } from '@/store/workspace'
import type { Node } from '@xyflow/react'
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  Layers,
  Trash2,
  ChevronDown,
} from 'lucide-react'

export default function MultiSelectBar() {
  const selectedElementIds = useWorkspaceStore((s) => s.selectedElementIds)
  const addGroup = useWorkspaceStore((s) => s.addGroup)
  const selectGroup = useWorkspaceStore((s) => s.selectGroup)
  const deleteElements = useWorkspaceStore((s) => s.deleteElements)
  const confirmDelete = useWorkspaceStore((s) => s.confirmDelete)
  const updateNodePositions = useWorkspaceStore((s) => s.updateNodePositions)
  const reactFlow = useReactFlow()
  const [alignOpen, setAlignOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  const count = selectedElementIds.length

  // Recompute screen position of the centroid whenever selection changes
  useEffect(() => {
    if (count < 2) { setPos(null); return }
    const nodes = reactFlow.getNodes().filter(n => selectedElementIds.includes(n.id))
    if (nodes.length === 0) { setPos(null); return }

    const minX = Math.min(...nodes.map(n => n.position.x))
    const maxX = Math.max(...nodes.map(n => n.position.x + (n.measured?.width ?? 200)))
    const minY = Math.min(...nodes.map(n => n.position.y))

    const centerFlowX = (minX + maxX) / 2
    const topFlowY = minY

    const screen = reactFlow.flowToScreenPosition({ x: centerFlowX, y: topFlowY })
    setPos({ x: screen.x, y: screen.y })
  }, [selectedElementIds, count, reactFlow])

  if (count < 2 || !pos) return null

  const BAR_W = 340
  const BAR_H = 40
  const OFFSET_Y = 12 // gap above the top of the selection

  // Clamp so bar never goes off-screen
  const vpW = window.innerWidth
  const left = Math.max(8, Math.min(pos.x - BAR_W / 2, vpW - BAR_W - 8))
  const top = Math.max(64, pos.y - BAR_H - OFFSET_Y)

  // Align flyout: if the bar is near the top of the viewport, open the
  // flyout downward so it doesn't get clipped above.
  const ALIGN_FLYOUT_H = 220
  const alignOpenDownward = top < ALIGN_FLYOUT_H + 16

  function handleAlign(mode: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') {
    const rfNodes = reactFlow.getNodes().filter(n => selectedElementIds.includes(n.id))
    if (rfNodes.length < 2) return
    const positions = rfNodes.map(n => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      w: n.measured?.width ?? 200,
      h: n.measured?.height ?? 100,
    }))
    // Single-pass min/max computation for both axes (avoids 2-3× repeated .map() scans)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of positions) {
      if (p.x < minX) minX = p.x
      if (p.x + p.w > maxX) maxX = p.x + p.w
      if (p.y < minY) minY = p.y
      if (p.y + p.h > maxY) maxY = p.y + p.h
    }
    let refVal: number = 0
    switch (mode) {
      case 'left':     refVal = minX; break
      case 'right':    refVal = maxX; break
      case 'center-x': refVal = (minX + maxX) / 2; break
      case 'top':      refVal = minY; break
      case 'bottom':   refVal = maxY; break
      case 'center-y': refVal = (minY + maxY) / 2; break
    }
    const alignedPositions: { id: string; x: number; y: number }[] = []
    reactFlow.setNodes(nodes => nodes.map(n => {
      if (!selectedElementIds.includes(n.id)) return n
      const p = positions.find(p => p.id === n.id)!
      let updated: Node
      switch (mode) {
        case 'left':     updated = { ...n, position: { ...n.position, x: refVal } }; break
        case 'right':    updated = { ...n, position: { ...n.position, x: refVal - p.w } }; break
        case 'center-x': updated = { ...n, position: { ...n.position, x: refVal - p.w / 2 } }; break
        case 'top':      updated = { ...n, position: { ...n.position, y: refVal } }; break
        case 'bottom':   updated = { ...n, position: { ...n.position, y: refVal - p.h } }; break
        case 'center-y': updated = { ...n, position: { ...n.position, y: refVal - p.h / 2 } }; break
        default:         return n
      }
      alignedPositions.push({ id: n.id, x: updated.position.x, y: updated.position.y })
      return updated
    }))
    // Persist aligned positions to the store so they survive re-renders
    if (alignedPositions.length > 0) updateNodePositions(alignedPositions)
    setAlignOpen(false)
  }

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100%', padding: '0 10px',
    border: 'none', cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    fontSize: 'var(--text-sm)', gap: 5,
    transition: 'color 0.12s, background 0.12s',
    whiteSpace: 'nowrap',
  }

  const sep = <div style={{ width: 1, height: 18, background: 'var(--color-border)', flexShrink: 0 }} />

  return (
    <div style={{
      position: 'fixed',
      left,
      top,
      width: BAR_W,
      height: BAR_H,
      zIndex: 52,
      pointerEvents: 'auto',
      animation: 'fadeIn 0.15s ease both',
    }}>
      <div
        className="glass-panel-solid"
        style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center',
          borderRadius: 'var(--radius-md)',
          overflow: 'visible',
        }}
      >
        {/* Count badge */}
        <div style={{ padding: '0 10px', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-accent)', borderRight: '1px solid var(--color-border)', flexShrink: 0 }}>
          {count} selected
        </div>

        {/* Align dropdown */}
        <div style={{ position: 'relative', height: '100%', flexShrink: 0 }}>
          <button className="hover-lift" style={{ ...btnStyle, paddingRight: 8 }} onClick={() => setAlignOpen(o => !o)} title="Align elements">
            <AlignCenterVertical size={14} />
            <span>Align</span>
            <ChevronDown size={11} style={{ opacity: 0.6 }} />
          </button>
          {alignOpen && (
            <>
              <button
                type="button"
                aria-label="Close align menu"
                onClick={() => setAlignOpen(false)}
                style={{
                  position: 'fixed', inset: 0, zIndex: 53,
                  background: 'transparent', border: 'none', padding: 0, cursor: 'default',
                }}
              />
              <div className="glass-flyout" style={{
                position: 'absolute',
                ...(alignOpenDownward
                  ? { top: '100%', marginTop: 6 }
                  : { bottom: '100%', marginBottom: 6 }),
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 54,
                padding: 4,
                minWidth: 170,
              }}>
                <div style={{ padding: '4px 10px 6px', fontSize: 'var(--text-xxs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)' }}>
                  Align {count} elements
                </div>
                {[
                  { icon: <AlignStartVertical size={14} />,    label: 'Align left',      mode: 'left' as const },
                  { icon: <AlignCenterVertical size={14} />,   label: 'Align center X',  mode: 'center-x' as const },
                  { icon: <AlignEndVertical size={14} />,      label: 'Align right',     mode: 'right' as const },
                  null,
                  { icon: <AlignStartHorizontal size={14} />,  label: 'Align top',       mode: 'top' as const },
                  { icon: <AlignCenterHorizontal size={14} />, label: 'Align middle Y',  mode: 'center-y' as const },
                  { icon: <AlignEndHorizontal size={14} />,    label: 'Align bottom',    mode: 'bottom' as const },
                ].map((item, i) => item === null ? (
                  <div key={i} style={{ height: 1, background: 'var(--color-border)', margin: '2px 6px' }} />
                ) : (
                  <button key={item.mode} onClick={() => handleAlign(item.mode)} className="flyout-item">
                    <span style={{ color: 'var(--color-text-muted)', display: 'flex' }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {sep}

        {/* Group */}
        <button className="hover-lift" style={btnStyle} title={`Group ${count} elements`}
          onClick={() => { const id = addGroup('New Group', selectedElementIds); selectGroup(id) }}
        >
          <Layers size={14} />
          <span>Group</span>
        </button>

        {sep}

        {/* Delete */}
        <button className="hover-lift" style={{ ...btnStyle, color: 'var(--color-error)', paddingRight: 12 }}
          title={`Delete ${count} elements`}
          onClick={() => confirmDelete(`Delete ${count} elements?`, () => deleteElements(selectedElementIds))}
        >
          <Trash2 size={14} />
          <span>Delete</span>
        </button>
      </div>
    </div>
  )
}
