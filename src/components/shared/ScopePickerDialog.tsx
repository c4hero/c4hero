import { useState } from 'react'
import type { WorkspaceScope } from '@/types/model'
import { Globe, Building2, FileQuestion } from 'lucide-react'

const OPTIONS: { value: WorkspaceScope; icon: React.ReactNode; label: string; sub: string }[] = [
  {
    value: 'softwaresystem',
    icon: <Building2 size={20} />,
    label: 'Software system',
    sub: 'One system, full drill-down: context → containers → components',
  },
  {
    value: 'landscape',
    icon: <Globe size={20} />,
    label: 'System landscape',
    sub: 'Map of multiple systems and people — no container details',
  },
  {
    value: 'none',
    icon: <FileQuestion size={20} />,
    label: 'Unscoped',
    sub: 'No restrictions — mix whatever you need',
  },
]

export default function ScopePickerDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (scope: WorkspaceScope, name: string) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<WorkspaceScope>('softwaresystem')
  const [name, setName] = useState('workspace')

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}
    >
      <div
        style={{ width: 400, borderRadius: 16, background: 'var(--color-bg-panel,#0f1923)', border: '1px solid var(--color-border)', padding: '28px 28px 24px', display: 'flex', flexDirection: 'column', gap: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>New workspace</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Choose the scope to enable validation.</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setSelected(o.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12,
                border: `1px solid ${selected === o.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
                background: selected === o.value ? 'rgba(88,166,255,0.07)' : 'rgba(255,255,255,0.02)',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ color: 'var(--color-accent)', flexShrink: 0 }}>{o.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{o.label}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{o.sub}</div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onConfirm(selected, name); if (e.key === 'Escape') onCancel() }}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14, fontWeight: 500, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border-hover,rgba(88,166,255,0.25))', color: 'var(--color-text-primary)', outline: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-surface" onClick={onCancel} style={{ padding: '8px 18px' }}>Cancel</button>
          <button
            onClick={() => onConfirm(selected, name)}
            disabled={!name.trim()}
            style={{ padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: name.trim() ? 'var(--color-accent)' : 'rgba(88,166,255,0.2)', color: name.trim() ? '#0d1117' : 'var(--color-text-muted)', border: 'none', cursor: name.trim() ? 'pointer' : 'default', transition: 'background 150ms' }}
          >
            Create workspace
          </button>
        </div>
      </div>
    </div>
  )
}
