import { useState } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import type { ViewType } from '@/types/model'
import { X } from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'

const ALL_VIEW_TYPES: { value: ViewType; label: string }[] = [
  { value: 'systemLandscape', label: 'System Landscape' },
  { value: 'systemContext', label: 'System Context' },
  { value: 'container', label: 'Container' },
  { value: 'component', label: 'Component' },
]

function allowedViewTypes(scope: string | undefined) {
  if (scope === 'landscape') return ALL_VIEW_TYPES.filter(vt => vt.value === 'systemLandscape' || vt.value === 'systemContext')
  if (scope === 'softwaresystem') return ALL_VIEW_TYPES.filter(vt => vt.value !== 'systemLandscape')
  return ALL_VIEW_TYPES
}

export default function CreateViewDialog({ onClose }: { onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const addView = useWorkspaceStore((s) => s.addView)
  // Optional pre-populated defaults (used by the zoom-in "Customize…" flow).
  const defaults = useWorkspaceStore((s) => s.createViewDefaults)
  const setCreateViewDefaults = useWorkspaceStore((s) => s.setCreateViewDefaults)

  const viewTypes = allowedViewTypes(workspace?.scope)
  // Seed state from `defaults` when provided, otherwise fall back to the first
  // allowed view type. The initial-state functions are only called once, so a
  // later change to `defaults` won't reseed; the Customize… flow sets defaults
  // BEFORE opening the dialog, so this is correct.
  const [type, setType] = useState<ViewType>(() => defaults?.type ?? viewTypes[0].value)
  const [title, setTitle] = useState('')
  const [scopeId, setScopeId] = useState<string>(() => defaults?.scopeId ?? '')

  if (!workspace) return null

  const needsScope = type === 'systemContext' || type === 'container' || type === 'component'

  // In a softwareSystem-scoped workspace, only one system is allowed to have
  // containers/components (see scopeValidation.ts) — that system IS the
  // workspace's focal system. Letting the user create a Context or Container
  // view scoped to a *different* system silently widens the workspace's
  // documentation surface beyond the single-system contract. Restrict the
  // scope picker to the focal system when we can identify it.
  const focalSystemId = workspace.scope === 'softwaresystem'
    ? (() => {
        const withContainers = workspace.model.softwareSystems.filter(s => s.containers.length > 0)
        return withContainers.length === 1 ? withContainers[0].id : undefined
      })()
    : undefined

  // Build scope options based on type
  const scopeOptions: { id: string; name: string }[] = []
  if (type === 'systemContext' || type === 'container') {
    for (const sys of workspace.model.softwareSystems) {
      if (focalSystemId && sys.id !== focalSystemId) continue
      scopeOptions.push({ id: sys.id, name: sys.name })
    }
  } else if (type === 'component') {
    for (const sys of workspace.model.softwareSystems) {
      for (const c of sys.containers) {
        scopeOptions.push({ id: c.id, name: `${sys.name} / ${c.name}` })
      }
    }
  }

  // A view that needs a scope can't be created without one. The dialog must
  // refuse to dispatch `addView` with an undefined scope — otherwise we'd end
  // up with a Context/Container/Component view that has no anchor, which is
  // invalid data the rest of the app has to defend against forever.
  const scopeMissing = needsScope && !scopeId
  const noScopeChoicesAvailable = needsScope && scopeOptions.length === 0
  const missingScopeKind = type === 'component' ? 'container' : 'system'

  const handleCreate = () => {
    if (scopeMissing) return
    addView(type, needsScope ? scopeId : undefined, title || undefined)
    setCreateViewDefaults(null) // consume the zoom defaults so the next open starts fresh
    onClose()
  }

  const handleClose = () => {
    setCreateViewDefaults(null)
    onClose()
  }

  return (
    <DialogShell
      onClose={handleClose}
      ariaLabel="Create View"
      className="relative w-full max-w-sm rounded-xl border p-5 shadow-2xl"
      style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)' }}
    >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Create View</h2>
          <button onClick={handleClose} className="btn-icon !min-h-7 !min-w-7 !p-1" aria-label="Close dialog"><X size={14} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="cv-type" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Type
            </label>
            <select
              id="cv-type"
              value={type}
              onChange={(e) => { setType(e.target.value as ViewType); setScopeId('') }}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              {viewTypes.map(vt => <option key={vt.value} value={vt.value}>{vt.label}</option>)}
            </select>
          </div>

          {needsScope && scopeOptions.length > 0 && (
            <div>
              <label htmlFor="cv-scope" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Scope
                <span aria-hidden="true" style={{ color: 'var(--color-error)', marginLeft: 4 }}>*</span>
                <span className="sr-only">required</span>
              </label>
              <select
                id="cv-scope"
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                required
                aria-required="true"
                aria-invalid={!scopeId}
                aria-describedby={!scopeId ? 'cv-scope-error' : undefined}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{
                  background: 'var(--color-surface-2)',
                  borderColor: !scopeId ? 'var(--color-border-error)' : 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                }}
              >
                <option value="">Select...</option>
                {scopeOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {!scopeId && (
                <div
                  id="cv-scope-error"
                  className="mt-1 text-[11px]"
                  style={{ color: 'var(--color-error-text)' }}
                >
                  Pick a {missingScopeKind} for this view.
                </div>
              )}
            </div>
          )}

          {noScopeChoicesAvailable && (
            <div
              role="alert"
              className="rounded-lg px-3 py-2 text-[11px]"
              style={{
                background: 'var(--color-tint-error)',
                color: 'var(--color-error-text)',
                border: '1px solid var(--color-border-error)',
              }}
            >
              Can't create this view — no {missingScopeKind} exists yet to scope it to.
              {' '}Create a {missingScopeKind} first, then come back.
            </div>
          )}

          <div>
            <label htmlFor="cv-title" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
              Title
            </label>
            <input
              id="cv-title"
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
            disabled={scopeMissing}
            className="w-full rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--color-accent)', color: 'var(--color-bg-primary)' }}
          >
            Create View
          </button>
        </div>
    </DialogShell>
  )
}
