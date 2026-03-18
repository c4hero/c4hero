import { useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useWorkspaceStore } from '@/store/workspace'
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
  const deleteElement = useWorkspaceStore((s) => s.deleteElement)
  const reactFlow = useReactFlow()
  const [alignOpen, setAlignOpen] = useState(false)

  const count = selectedElementIds.length
  if (count < 2) return null

  function handleAlign(mode: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') {
    const rfNodes = reactFlow.getNodes().filter(n => selectedElementIds.includes(n.id))
    if (rfNodes.length < 2) return
    let refVal: number
    const positions = rfNodes.map(n => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      w: (n.measured?.width ?? 200),
      h: (n.measured?.height ?? 100),
    }))
    switch (mode) {
      case 'left':    refVal = Math.min(...positions.map(p => p.x)); break
      case 'right':   refVal = Math.max(...positions.map(p => p.x + p.w)); break
      case 'center-x': refVal = (Math.min(...positions.map(p => p.x)) + Math.max(...positions.map(p => p.x + p.w))) / 2; break
      case 'top':     refVal = Math.min(...positions.map(p => p.y)); break
      case 'bottom':  refVal = Math.max(...positions.map(p => p.y + p.h)); break
      case 'center-y': refVal = (Math.min(...positions.map(p => p.y)) + Math.max(...positions.map(p => p.y + p.h))) / 2; break
    }
    reactFlow.setNodes(nodes => nodes.map(n => {
      if (!selectedElementIds.includes(n.id)) return n
      const p = positions.find(p => p.id === n.id)!
      switch (mode) {
        case 'left':    return { ...n, position: { ...n.position, x: refVal } }
        case 'right':   return { ...n, position: { ...n.position, x: refVal - p.w } }
        case 'center-x': return { ...n, position: { ...n.position, x: refVal - p.w / 2 } }
        case 'top':     return { ...n, position: { ...n.position, y: refVal } }
        case 'bottom':  return { ...n, position: { ...n.position, y: refVal - p.h } }
        case 'center-y': return { ...n, position: { ...n.position, y: refVal - p.h / 2 } }
        default:        return n
      }
    }))
    setAlignOpen(false)
  }

  const btnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '0 10px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    fontSize: 12,
    gap: 5,
    transition: 'color 0.12s, background 0.12s',
  }

  const sep = <div style={{ width: 1, height: 18, background: 'var(--color-border)', flexShrink: 0 }} />

  return (
    // Outer wrapper mirrors FloatingTopPill: left:0, right:0, padding:'0 14px'
    <div style={{
      position: 'fixed',
      top: 'max(58px, calc(env(safe-area-inset-top, 0px) + 52px))',
      left: 0,
      right: 0,
      zIndex: 48,
      display: 'flex',
      justifyContent: 'center',
      padding: '0 14px',
      pointerEvents: 'none',
      animation: 'slideDownFromBar 0.18s cubic-bezier(0.16, 1, 0.3, 1) both',
    }}>
    <div style={{
      pointerEvents: 'auto',
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      height: 36,
      borderRadius: '0 0 10px 10px',
      border: '1px solid var(--color-border)',
      borderTop: 'none',
      background: 'rgba(22, 48, 68, 0.96)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
      overflow: 'hidden',
    }}>
      {/* Count badge */}
      <div style={{ padding: '0 12px', fontSize: 12, fontWeight: 600, color: 'var(--color-accent)', borderRight: '1px solid var(--color-border)' }}>
        {count} selected
      </div>

      {/* Align dropdown */}
      <div style={{ position: 'relative', height: '100%' }}>
        <button
          style={{ ...btnStyle, paddingRight: 8 }}
          onClick={() => setAlignOpen(o => !o)}
          title="Align elements"
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent' }}
        >
          <AlignCenterVertical size={14} />
          <span>Align</span>
          <ChevronDown size={11} style={{ opacity: 0.6 }} />
        </button>
        {alignOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setAlignOpen(false)} />
            <div style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 50,
              marginTop: 4,
              background: 'rgba(13,17,23,0.97)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
              padding: 4,
              minWidth: 170,
            }}>
              <div style={{ padding: '4px 10px 6px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)' }}>
                Align {count} elements
              </div>
              {[
                { icon: <AlignStartVertical size={14} />, label: 'Align left',       mode: 'left' as const },
                { icon: <AlignCenterVertical size={14} />, label: 'Align center X',  mode: 'center-x' as const },
                { icon: <AlignEndVertical size={14} />, label: 'Align right',        mode: 'right' as const },
                null,
                { icon: <AlignStartHorizontal size={14} />, label: 'Align top',     mode: 'top' as const },
                { icon: <AlignCenterHorizontal size={14} />, label: 'Align middle Y', mode: 'center-y' as const },
                { icon: <AlignEndHorizontal size={14} />, label: 'Align bottom',    mode: 'bottom' as const },
              ].map((item, i) => item === null ? (
                <div key={i} style={{ height: 1, background: 'var(--color-border)', margin: '2px 6px' }} />
              ) : (
                <button key={item.mode} onClick={() => handleAlign(item.mode)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer', border: 'none' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-2)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                >
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
      <button
        style={btnStyle}
        title={`Group ${count} elements`}
        onClick={() => { const id = addGroup('New Group', selectedElementIds); selectGroup(id) }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent' }}
      >
        <Layers size={14} />
        <span>Group</span>
      </button>

      {sep}

      {/* Delete */}
      <button
        style={{ ...btnStyle, color: 'var(--color-error)', paddingRight: 12 }}
        title={`Delete ${count} elements`}
        onClick={() => { for (const id of selectedElementIds) deleteElement(id) }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <Trash2 size={14} />
        <span>Delete</span>
      </button>
    </div>
    </div>
  )
}
