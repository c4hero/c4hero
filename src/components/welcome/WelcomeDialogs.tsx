import { useEffect, useRef, useState } from 'react'
import { FileText, Trash2, X } from 'lucide-react'
import {
  createBigBankSample,
  createMicroservicesTemplate,
  createMonolithTemplate,
  createEventDrivenTemplate,
} from '@/lib/templates'
import { slugifyName } from '@/lib/folderIO'

// ─── Template Dialog ─────────────────────────────────────────────────────────

export function TemplateDialog({
  onSelect,
  onClose,
}: {
  onSelect: (ws: ReturnType<typeof createBigBankSample>, name: string) => void
  onClose: () => void
}) {
  const templates = [
    { label: 'Big Bank Sample', name: 'big-bank.dsl', fn: createBigBankSample },
    { label: 'Microservices', name: 'microservices.dsl', fn: createMicroservicesTemplate },
    { label: 'Monolith', name: 'monolith.dsl', fn: createMonolithTemplate },
    { label: 'Event-Driven', name: 'event-driven.dsl', fn: createEventDrivenTemplate },
  ] as const

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex flex-col gap-4 rounded-xl border p-5 shadow-xl"
        style={{
          background: 'var(--color-bg-primary)',
          borderColor: 'var(--color-border)',
          minWidth: '280px',
          maxWidth: '400px',
          width: '90vw',
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Load template
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:opacity-70"
            style={{ color: 'var(--color-text-muted)' }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {templates.map(({ label, name, fn }) => (
            <button
              key={name}
              className="btn-surface w-full items-center gap-3 rounded-lg px-4 py-3 text-left"
              onClick={() => onSelect(fn(), name)}
            >
              <FileText size={15} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Workspace Edit Dialog ──────────────────────────────────────────────────

export function WorkspaceEditDialog({ name, onRename, onDelete, onClose }: {
  name: string
  onRename: (newName: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [editName, setEditName] = useState(name)
  const dirty = editName.trim() !== name && editName.trim().length > 0

  function handleSave() {
    if (dirty) onRename(editName.trim())
    onClose()
  }

  const mouseDownOnBackdrop = useRef(false)

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={(e) => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={(e) => { if (e.target === e.currentTarget && mouseDownOnBackdrop.current) onClose() }}
    >
      <div
        style={{ width: 360, borderRadius: 16, background: 'var(--color-bg-panel,#0f1923)', border: '1px solid var(--color-border)', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 12 }}>Edit Workspace</div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Name</label>
          <input
            autoFocus
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            style={{
              width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--color-border)', background: 'rgba(0,0,0,0.3)',
              color: 'var(--color-text-primary)', fontSize: 14, outline: 'none',
            }}
          />
          {dirty && (
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
              File: {slugifyName(editName) || 'workspace'}.dsl
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--color-border-error)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-error)' }}>
            Danger Zone
          </span>
          <button
            onClick={onDelete}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10,
              border: '1px solid var(--color-border-error)', background: 'var(--color-tint-error)',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <Trash2 size={14} style={{ color: 'var(--color-error)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-error)' }}>Delete workspace</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Permanently remove this .dsl file</div>
            </div>
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-surface" onClick={onClose} style={{ padding: '8px 18px' }}>Cancel</button>
          {dirty && (
            <button
              onClick={handleSave}
              style={{
                padding: '8px 18px', borderRadius: 8, border: 'none',
                background: 'var(--color-accent)', color: '#fff', fontWeight: 600,
                cursor: 'pointer', fontSize: 13,
              }}
            >Save</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Duplicate Collection Dialog ────────────────────────────────────────────

export function DuplicateCollectionDialog({
  slug,
  onOpen,
  onRename,
  onCancel,
}: {
  slug: string
  onOpen: () => void
  onRename: () => void
  onCancel: () => void
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}
    >
      <div
        style={{ width: 380, borderRadius: 16, background: 'var(--color-bg-panel,#0f1923)', border: '1px solid var(--color-border)', padding: '28px 28px 24px', display: 'flex', flexDirection: 'column', gap: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Folder already exists
          </span>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            A folder named <code style={{ fontSize: 12, padding: '1px 6px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)', color: 'var(--color-accent)', fontFamily: 'monospace' }}>{slug}</code> already exists in that location.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={onOpen}
            style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--color-border)', background: 'rgba(88,166,255,0.07)', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 3 }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Open existing collection</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Use the folder that's already there</span>
          </button>
          <button
            onClick={onRename}
            style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.02)', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 3 }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Choose a different name</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Go back and pick another name</span>
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-surface" onClick={onCancel} style={{ padding: '8px 18px' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── New Collection Dialog ──────────────────────────────────────────────────

export function NewCollectionDialog({
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  value: string
  onChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setTimeout(() => inputRef.current?.select(), 50)
  }, [])

  const slug = slugifyName(value)
  const canSubmit = value.trim().length > 0

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: 380, borderRadius: 16,
          background: 'var(--color-bg-panel, #0f1923)',
          border: '1px solid var(--color-border)',
          padding: '28px 28px 24px',
          display: 'flex', flexDirection: 'column', gap: 20,
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            New collection
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Choose a friendly name — the folder will be created using the slug below.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>
            Display name
          </label>
          <input
            ref={inputRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && canSubmit) onConfirm()
              if (e.key === 'Escape') onCancel()
            }}
            placeholder="My Architecture"
            style={{
              width: '100%', padding: '10px 14px',
              borderRadius: 10, fontSize: 14, fontWeight: 500,
              background: 'var(--glass-overlay-xs)',
              border: '1px solid var(--color-border-hover, rgba(88,166,255,0.25))',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Folder:</span>
            <code style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 6,
              background: 'var(--glass-overlay-sm)',
              border: '1px solid var(--color-border)',
              color: canSubmit ? 'var(--color-accent)' : 'var(--color-text-muted)',
              fontFamily: 'monospace',
            }}>
              {canSubmit ? slug : 'collection'}
            </code>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-surface" onClick={onCancel} style={{ padding: '8px 18px' }}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canSubmit}
            style={{
              padding: '8px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: canSubmit ? 'var(--color-accent)' : 'var(--color-accent-glow)',
              color: canSubmit ? '#0d1117' : 'var(--color-text-muted)',
              border: 'none', cursor: canSubmit ? 'pointer' : 'default',
              transition: 'background 150ms',
            }}
          >
            Choose location →
          </button>
        </div>
      </div>
    </div>
  )
}
