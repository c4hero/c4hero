import { useEffect, useMemo, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useWorkspaceStore, isFocalScopeElement, getActiveView, buildRelationshipMap } from '@/store/workspace'
import { computeCascadeImpact } from '@/store/workspace-helpers'
import { formatImpactSummary } from '@/lib/impactMessage'
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  MoveHorizontal,
  MoveVertical,
  ArrowRight,
  ArrowDown,
  Layers,
  Lock,
  LockOpen,
  Trash2,
  ChevronDown,
} from 'lucide-react'

type AlignMode = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom'
type LayoutAxis = 'horizontal' | 'vertical'
type LayoutPosition = { id: string; x: number; y: number; w: number; h: number }
type AlignMenuItem =
  | { kind: 'align'; icon: React.ReactNode; label: string; mode: AlignMode }
  | { kind: 'action'; icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }
  | null

const MIN_DISTRIBUTE_GAP = 24
const MIN_PATH_GAP = 120

function numericSize(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function centerX(position: LayoutPosition): number {
  return position.x + position.w / 2
}

function centerY(position: LayoutPosition): number {
  return position.y + position.h / 2
}

function quotedAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export default function MultiSelectBar() {
  const selectedElementIds = useWorkspaceStore((s) => s.selectedElementIds)
  const addGroup = useWorkspaceStore((s) => s.addGroup)
  const selectGroup = useWorkspaceStore((s) => s.selectGroup)
  const deleteElements = useWorkspaceStore((s) => s.deleteElements)
  const confirmDelete = useWorkspaceStore((s) => s.confirmDelete)
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const updateNodePositions = useWorkspaceStore((s) => s.updateNodePositions)
  const setElementsLocked = useWorkspaceStore((s) => s.setElementsLocked)
  const reactFlow = useReactFlow()
  const [alignOpen, setAlignOpen] = useState(false)
  const [primaryPointerDown, setPrimaryPointerDown] = useState(false)
  const count = selectedElementIds.length

  const lockedIds = useMemo(() => {
    if (!workspace || !activeViewKey || selectedElementIds.length === 0) return new Set<string>()
    const view = getActiveView(workspace, activeViewKey)
    if (!view) return new Set<string>()
    // A locked view freezes the whole selection: Align/Distribute/Straighten
    // have nothing they may move.
    if (view.locked) return new Set(selectedElementIds)
    const selected = new Set(selectedElementIds)
    return new Set(view.elements.filter((el) => selected.has(el.id) && el.locked).map((el) => el.id))
  }, [workspace, activeViewKey, selectedElementIds])

  // One button, two jobs: lock the selection unless it's already all locked,
  // in which case the obvious next action is to release it.
  const allLocked = selectedElementIds.length > 0 && lockedIds.size === selectedElementIds.length
  const someLocked = lockedIds.size > 0 && !allLocked

  useEffect(() => {
    const release = () => setPrimaryPointerDown(false)
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('[data-canvas-chrome="multi-select-bar"]')) return
      setPrimaryPointerDown(true)
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('pointerup', release, true)
    document.addEventListener('pointercancel', release, true)
    window.addEventListener('blur', release)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('pointerup', release, true)
      document.removeEventListener('pointercancel', release, true)
      window.removeEventListener('blur', release)
    }
  }, [])

  useEffect(() => {
    if (count < 2 || primaryPointerDown) return
    window.getSelection()?.removeAllRanges()
  }, [count, primaryPointerDown])

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

  if (count < 2 || !pos || primaryPointerDown) return null

  const BAR_W = Math.min(430, Math.max(340, window.innerWidth - 16))
  const BAR_H = 40
  const OFFSET_Y = 12 // gap above the top of the selection

  // Clamp so bar never goes off-screen
  const vpW = window.innerWidth
  const left = Math.max(8, Math.min(pos.x - BAR_W / 2, vpW - BAR_W - 8))
  const top = Math.max(64, pos.y - BAR_H - OFFSET_Y)

  // Align flyout: if the bar is near the top of the viewport, open the
  // flyout downward so it doesn't get clipped above.
  const ALIGN_FLYOUT_H = 360
  const alignOpenDownward = top < ALIGN_FLYOUT_H + 16

  function getSelectedLayoutPositions(): LayoutPosition[] {
    // Locked nodes are excluded outright — they don't participate in the
    // alignment/distribution math and applyLayoutPositions never learns
    // their id, so it can't force their on-screen position either.
    const rfNodes = reactFlow.getNodes().filter(n => selectedElementIds.includes(n.id) && !lockedIds.has(n.id))
    const zoom = reactFlow.getZoom() || 1
    return rfNodes.map(n => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      ...(() => {
        const element = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${quotedAttributeValue(n.id)}"]`)
        const rect = element?.getBoundingClientRect()
        const renderedWidth = rect && rect.width > 0 ? rect.width / zoom : undefined
        const renderedHeight = rect && rect.height > 0 ? rect.height / zoom : undefined
        return {
          w: renderedWidth ?? n.measured?.width ?? numericSize(n.style?.width) ?? 200,
          h: renderedHeight ?? n.measured?.height ?? numericSize(n.style?.height) ?? 100,
        }
      })(),
    }))
  }

  function applyLayoutPositions(positions: Array<{ id: string; x: number; y: number }>) {
    const byId = new Map(positions.map((p) => [p.id, p]))
    reactFlow.setNodes((nodes) => nodes.map((n) => {
      const next = byId.get(n.id)
      if (!next) return n
      return { ...n, position: { ...n.position, x: next.x, y: next.y } }
    }))
    updateNodePositions(positions)
    setAlignOpen(false)
  }

  function handleAlign(mode: AlignMode) {
    const positions = getSelectedLayoutPositions()
    if (positions.length < 2) return
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
    applyLayoutPositions(alignedPositions)
  }

  function handleDistribute(axis: LayoutAxis) {
    const positions = getSelectedLayoutPositions()
    if (positions.length < 3) return
    const horizontal = axis === 'horizontal'
    const sorted = [...positions].sort((a, b) => horizontal ? centerX(a) - centerX(b) : centerY(a) - centerY(b))

    if (horizontal) {
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      const totalWidth = sorted.reduce((sum, p) => sum + p.w, 0)
      const span = (last.x + last.w) - first.x
      const gap = Math.max(MIN_DISTRIBUTE_GAP, (span - totalWidth) / (sorted.length - 1))
      let cursor = first.x
      const distributed = sorted.map((p) => {
        const x = cursor
        cursor += p.w + gap
        return { id: p.id, x, y: p.y }
      })
      applyLayoutPositions(distributed)
      return
    }

    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const totalHeight = sorted.reduce((sum, p) => sum + p.h, 0)
    const span = (last.y + last.h) - first.y
    const gap = Math.max(MIN_DISTRIBUTE_GAP, (span - totalHeight) / (sorted.length - 1))
    let cursor = first.y
    const distributed = sorted.map((p) => {
      const y = cursor
      cursor += p.h + gap
      return { id: p.id, x: p.x, y }
    })
    applyLayoutPositions(distributed)
  }

  function getRelationshipPathOrder(): string[] | null {
    if (!workspace || !activeViewKey) return null
    const activeView = getActiveView(workspace, activeViewKey)
    if (!activeView) return null

    const selected = new Set(selectedElementIds)
    const relationshipMap = buildRelationshipMap(workspace)
    const edges = activeView.relationships
      .map((viewRelationship) => relationshipMap.get(viewRelationship.id))
      .filter((relationship): relationship is NonNullable<typeof relationship> =>
        !!relationship && selected.has(relationship.sourceId) && selected.has(relationship.destinationId),
      )
    if (edges.length < selected.size - 1) return null

    const outgoing = new Map<string, string>()
    const incoming = new Map<string, string>()
    for (const edge of edges) {
      if (outgoing.has(edge.sourceId) || incoming.has(edge.destinationId)) return null
      outgoing.set(edge.sourceId, edge.destinationId)
      incoming.set(edge.destinationId, edge.sourceId)
    }

    const starts = selectedElementIds.filter((id) => selected.has(id) && !incoming.has(id))
    if (starts.length !== 1) return null

    const order: string[] = []
    const seen = new Set<string>()
    let cursor: string | undefined = starts[0]
    while (cursor && !seen.has(cursor)) {
      order.push(cursor)
      seen.add(cursor)
      cursor = outgoing.get(cursor)
    }

    return order.length === selected.size ? order : null
  }

  function handleStraighten(axis: LayoutAxis) {
    const positions = getSelectedLayoutPositions()
    if (positions.length < 2) return
    const horizontal = axis === 'horizontal'
    const byId = new Map(positions.map((p) => [p.id, p]))
    const pathOrder = getRelationshipPathOrder()
    const ordered = pathOrder
      ? pathOrder.map((id) => byId.get(id)).filter((p): p is LayoutPosition => !!p)
      : [...positions].sort((a, b) => horizontal ? centerX(a) - centerX(b) : centerY(a) - centerY(b))

    if (ordered.length < 2) return

    if (horizontal) {
      const minX = Math.min(...positions.map((p) => p.x))
      const maxX = Math.max(...positions.map((p) => p.x + p.w))
      const minY = Math.min(...positions.map((p) => p.y))
      const maxY = Math.max(...positions.map((p) => p.y + p.h))
      const totalWidth = ordered.reduce((sum, p) => sum + p.w, 0)
      const gap = Math.max(MIN_PATH_GAP, ((maxX - minX) - totalWidth) / (ordered.length - 1))
      const totalSpan = totalWidth + gap * (ordered.length - 1)
      const targetCenterY = (minY + maxY) / 2
      let cursor = (minX + maxX) / 2 - totalSpan / 2
      const straightened = ordered.map((p) => {
        const x = cursor
        cursor += p.w + gap
        return { id: p.id, x, y: targetCenterY - p.h / 2 }
      })
      applyLayoutPositions(straightened)
      return
    }

    const minX = Math.min(...positions.map((p) => p.x))
    const maxX = Math.max(...positions.map((p) => p.x + p.w))
    const minY = Math.min(...positions.map((p) => p.y))
    const maxY = Math.max(...positions.map((p) => p.y + p.h))
    const totalHeight = ordered.reduce((sum, p) => sum + p.h, 0)
    const gap = Math.max(MIN_PATH_GAP, ((maxY - minY) - totalHeight) / (ordered.length - 1))
    const totalSpan = totalHeight + gap * (ordered.length - 1)
    const targetCenterX = (minX + maxX) / 2
    let cursor = (minY + maxY) / 2 - totalSpan / 2
    const straightened = ordered.map((p) => {
      const y = cursor
      cursor += p.h + gap
      return { id: p.id, x: targetCenterX - p.w / 2, y }
    })
    applyLayoutPositions(straightened)
  }

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100%', padding: '0 10px',
    flexShrink: 0,
    border: 'none', cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    fontSize: 'var(--text-sm)', gap: 5,
    transition: 'color 0.12s, background 0.12s',
    whiteSpace: 'nowrap',
  }

  const alignMenuItems: AlignMenuItem[] = [
    { kind: 'align', icon: <AlignStartVertical size={14} />,    label: 'Align left',      mode: 'left' },
    { kind: 'align', icon: <AlignCenterVertical size={14} />,   label: 'Align center X',  mode: 'center-x' },
    { kind: 'align', icon: <AlignEndVertical size={14} />,      label: 'Align right',     mode: 'right' },
    null,
    { kind: 'align', icon: <AlignStartHorizontal size={14} />,  label: 'Align top',       mode: 'top' },
    { kind: 'align', icon: <AlignCenterHorizontal size={14} />, label: 'Align middle Y',  mode: 'center-y' },
    { kind: 'align', icon: <AlignEndHorizontal size={14} />,    label: 'Align bottom',    mode: 'bottom' },
    null,
    { kind: 'action', icon: <MoveHorizontal size={14} />, label: 'Distribute horizontally', onClick: () => handleDistribute('horizontal'), disabled: count < 3 },
    { kind: 'action', icon: <MoveVertical size={14} />, label: 'Distribute vertically', onClick: () => handleDistribute('vertical'), disabled: count < 3 },
    null,
    { kind: 'action', icon: <ArrowRight size={14} />, label: 'Straighten path horizontal', onClick: () => handleStraighten('horizontal') },
    { kind: 'action', icon: <ArrowDown size={14} />, label: 'Straighten path vertical', onClick: () => handleStraighten('vertical') },
  ]

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
                {alignMenuItems.map((item, i) => item === null ? (
                  <div key={i} style={{ height: 1, background: 'var(--color-border)', margin: '2px 6px' }} />
                ) : (
                  <button
                    key={item.kind === 'align' ? item.mode : item.label}
                    onClick={item.kind === 'align' ? () => handleAlign(item.mode) : item.onClick}
                    className="flyout-item"
                    disabled={item.kind === 'action' ? item.disabled : false}
                  >
                    <span className="flyout-item-icon">{item.icon}</span>
                    <span className="flyout-item-label">{item.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {sep}

        {/* Lock / unlock */}
        <button
          className="hover-lift"
          style={{ ...btnStyle, color: (allLocked || someLocked) ? 'var(--color-accent)' : btnStyle.color }}
          aria-pressed={someLocked ? 'mixed' : allLocked}
          title={allLocked
            ? `Unlock ${count} elements`
            : someLocked
              ? `${lockedIds.size} of ${count} elements are locked — click to lock the rest`
              : `Lock ${count} elements in place — Auto-arrange and dragging leave them alone`}
          onClick={() => {
            if (!activeViewKey) return
            setElementsLocked(activeViewKey, selectedElementIds, !allLocked)
          }}
        >
          {(allLocked || someLocked) ? <Lock size={14} /> : <LockOpen size={14} />}
          <span>{allLocked ? 'Unlock' : 'Lock'}</span>
        </button>

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
          aria-label={`Delete ${count} elements from the model`}
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
