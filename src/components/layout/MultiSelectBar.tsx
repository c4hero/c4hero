import { useMemo, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useWorkspaceStore, isFocalScopeElement } from '@/store/workspace'
import { computeCascadeImpact } from '@/store/workspace-helpers'
import { formatImpactSummary } from '@/lib/impactMessage'
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
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const updateNodePositions = useWorkspaceStore((s) => s.updateNodePositions)
  const reactFlow = useReactFlow()
  const [alignOpen, setAlignOpen] = useState(false)
  const count = selectedElementIds.length

  const pos = useMemo(() => {
    if (count < 2) return null
    const nodes = reactFlow.getNodes().filter(n => selectedElementIds.includes(n.id))
    if (nodes.length === 0) return null

    const minX = Math.min(...nodes.map(n => n.position.x))
    const maxX = Math.max(...nodes.map(n => n.position.x + (n.measured?.width ?? 200)))
    const minY = Math.min(...nodes.map(n => n.position.y))

    const centerFlowX = (minX + maxX) / 2
    const topFlowY = minY

    return reactFlow.flowToScreenPosition({ x: centerFlowX, y: topFlowY })
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
    // Compute the aligned positions up front. Earlier the array was
    // populated INSIDE the reactFlow.setNodes(fn) callback, which RF runs
    // asynchronously / batched — by the time we read `alignedPositions`
    // for `updateNodePositions(...)`, it was still empty and the persist
    // step silently no-op'd.
    const aligned: { id: string; x: number; y: number; w: number; h: number }[] = positions.map((p) => {
      let x = p.x, y = p.y
      switch (mode) {
        case 'left':     x = refVal; break
        case 'right':    x = refVal - p.w; break
        case 'center-x': x = refVal - p.w / 2; break
        case 'top':      y = refVal; break
        case 'bottom':   y = refVal - p.h; break
        case 'center-y': y = refVal - p.h / 2; break
      }
      return { id: p.id, x, y, w: p.w, h: p.h }
    })

    // Aligning collapses one axis. If two nodes happened to share (or be
    // close on) the OTHER axis, they now sit on top of each other. Sort
    // by the preserved axis and push later nodes forward by their own
    // size + a gap whenever they would overlap a predecessor's bbox.
    // Order is preserved so this feels like a stable nudge, not a shuffle.
    const GAP = 24
    const horizontal = mode === 'top' || mode === 'bottom' || mode === 'center-y'
    const sorted = [...aligned].sort((a, b) => horizontal ? a.x - b.x : a.y - b.y)
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const cur = sorted[i]
      if (horizontal) {
        const minX = prev.x + prev.w + GAP
        if (cur.x < minX) cur.x = minX
      } else {
        const minY = prev.y + prev.h + GAP
        if (cur.y < minY) cur.y = minY
      }
    }
    const alignedPositions = aligned.map(({ id, x, y }) => ({ id, x, y }))
    const alignedById = new Map(alignedPositions.map((p) => [p.id, p]))
    reactFlow.setNodes((nodes) => nodes.map((n) => {
      const aligned = alignedById.get(n.id)
      if (!aligned) return n
      return { ...n, position: { ...n.position, x: aligned.x, y: aligned.y } }
    }))
    // Persist aligned positions to the store so they survive re-renders.
    updateNodePositions(alignedPositions)
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
    <div
      data-canvas-chrome="multi-select-bar"
      style={{
        position: 'fixed',
        left,
        top,
        width: BAR_W,
        height: BAR_H,
        zIndex: 52,
        pointerEvents: 'auto',
        animation: 'fadeIn 0.15s ease both',
      }}
    >
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

        {/* Delete from model */}
        <button className="hover-lift" style={{ ...btnStyle, color: 'var(--color-error)', paddingRight: 12 }}
          title={`Delete ${count} elements from the model`}
          onClick={() => {
            if (!workspace || !activeViewKey) return
            const ids = selectedElementIds.filter(
              (id) => !isFocalScopeElement(workspace, activeViewKey, id),
            )
            if (ids.length === 0) return
            const impact = computeCascadeImpact(workspace, ids)
            confirmDelete({ message: formatImpactSummary(impact), impact }, () => deleteElements(ids))
          }}
        >
          <Trash2 size={14} />
          <span>Delete from model</span>
        </button>
      </div>
    </div>
  )
}
