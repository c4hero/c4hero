import { useState } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import type { ViewType } from '@/types/model'
import { X } from 'lucide-react'

const VIEW_TYPES: { value: ViewType; label: string }[] = [
  { value: 'systemLandscape', label: 'System Landscape' },
  { value: 'systemContext', label: 'System Context' },
  { value: 'container', label: 'Container' },
  { value: 'component', label: 'Component' },
]

export default function CreateViewDialog({ onClose }: { onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const addView = useWorkspaceStore((s) => s.addView)

  const [type, setType] = useState<ViewType>('systemLandscape')
  const [title, setTitle] = useState('')
  const [scopeId, setScopeId] = useState('')

  if (!workspace) return null

  const needsScope = type === 'systemContext' || type === 'container' || type === 'component'

  // Build scope options based on type
  const scopeOptions: { id: string; name: string }[] = []
  if (type === 'systemContext' || type === 'container') {
    for (const sys of workspace.model.softwareSystems) {
      scopeOptions.push({ id: sys.id, name: sys.name })
    }
  } else if (type === 'component') {
    for (const sys of workspace.model.softwareSystems) {
      for (const c of sys.containers) {
        scopeOptions.push({ id: c.id, name: `${sys.name} / ${c.name}` })
      }
    }
  }

  const handleCreate = () => {
    addView(type, needsScope ? scopeId || undefined : undefined, title || undefined)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 panel-backdrop" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-xl border p-5 shadow-2xl"
        style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Create View</h2>
          <button onClick={onClose} className="btn-icon !min-h-7 !min-w-7 !p-1"><X size={14} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Type
            </label>
            <select
              value={type}
              onChange={(e) => { setType(e.target.value as ViewType); setScopeId('') }}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              {VIEW_TYPES.map(vt => <option key={vt.value} value={vt.value}>{vt.label}</option>)}
            </select>
          </div>

          {needsScope && scopeOptions.length > 0 && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Scope
              </label>
              <select
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              >
                <option value="">Select...</option>
                {scopeOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. System Overview"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={needsScope && !scopeId && scopeOptions.length > 0}
            className="w-full rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-40"
            style={{ background: 'var(--color-accent)', color: 'var(--color-bg-primary)' }}
          >
            Create View
          </button>
        </div>
      </div>
    </div>
  )
}
