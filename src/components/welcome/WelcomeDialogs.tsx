import { useEffect, useMemo, useRef, useState } from 'react'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { Building2, Network, Box, Zap, Trash2, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  createBigBankSample,
  createMicroservicesTemplate,
  createMonolithTemplate,
  createEventDrivenTemplate,
} from '@/lib/templates'
import { slugifyName } from '@/lib/folderIO'
import type { Workspace } from '@/types/model'

// ─── Template Dialog ─────────────────────────────────────────────────────────

type TemplateCard = {
  label: string
  name: string
  fn: () => ReturnType<typeof createBigBankSample>
  tagline: string
  icon: LucideIcon
  accent: string
  glow: string
}

function summarize(ws: Workspace): string {
  const people = ws.model.people.length
  const systems = ws.model.softwareSystems.length
  const containers = ws.model.softwareSystems.reduce(
    (sum, s) => sum + (s.containers?.length ?? 0),
    0,
  )
  const components = ws.model.softwareSystems.reduce(
    (sum, s) => sum + (s.containers?.reduce((cs, c) => cs + (c.components?.length ?? 0), 0) ?? 0),
    0,
  )
  const relationships = ws.model.relationships.length
  const scopeLabel =
    ws.scope === 'landscape' ? 'Landscape' : ws.scope === 'softwaresystem' ? 'System' : 'Workspace'
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`
  const parts: string[] = [scopeLabel]
  if (people > 0) parts.push(plural(people, 'person').replace('persons', 'people'))
  if (systems > 0) parts.push(plural(systems, 'system'))
  if (containers > 0) parts.push(plural(containers, 'container'))
  if (components > 0) parts.push(plural(components, 'component'))
  if (relationships > 0) parts.push(plural(relationships, 'relationship'))
  return parts.join(' · ')
}

export function TemplateDialog({
  onSelect,
  onClose,
}: {
  onSelect: (ws: ReturnType<typeof createBigBankSample>, name: string) => void
  onClose: () => void
}) {
  const templates: TemplateCard[] = [
    {
      label: 'Big Bank',
      name: 'big-bank.dsl',
      fn: createBigBankSample,
      tagline: 'Enterprise landscape with customers, staff, and core systems.',
      icon: Building2,
      accent: '#7aa2f7',
      glow: 'rgba(122, 162, 247, 0.18)',
    },
    {
      label: 'Microservices',
      name: 'microservices.dsl',
      fn: createMicroservicesTemplate,
      tagline: 'Distributed services behind an API gateway with shared infra.',
      icon: Network,
      accent: '#9ece6a',
      glow: 'rgba(158, 206, 106, 0.18)',
    },
    {
      label: 'Monolith',
      name: 'monolith.dsl',
      fn: createMonolithTemplate,
      tagline: 'Classic three-tier app, single deployable, one database.',
      icon: Box,
      accent: '#e0af68',
      glow: 'rgba(224, 175, 104, 0.18)',
    },
    {
      label: 'Event-Driven',
      name: 'event-driven.dsl',
      fn: createEventDrivenTemplate,
      tagline: 'Async services communicating over a message broker.',
      icon: Zap,
      accent: '#bb9af7',
      glow: 'rgba(187, 154, 247, 0.18)',
    },
  ]

  const summaries = useMemo(
    () => Object.fromEntries(templates.map((t) => [t.name, summarize(t.fn())])),
    // templates list is static per-render; safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const [hovered, setHovered] = useState<string | null>(null)

  useEscapeKey(true, onClose)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: 'rgba(5, 8, 14, 0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative flex flex-col rounded-2xl border shadow-2xl"
        style={{
          background:
            'radial-gradient(circle at top left, rgba(122,162,247,0.08), transparent 55%), radial-gradient(circle at bottom right, rgba(187,154,247,0.06), transparent 55%), var(--color-bg-primary)',
          borderColor: 'var(--color-border)',
          width: 'min(680px, 92vw)',
          padding: '24px 24px 22px',
          gap: 20,
          boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02) inset',
        }}
      >
        <div className="flex items-start justify-between" style={{ gap: 16 }}>
          <div className="flex flex-col" style={{ gap: 4 }}>
            <h2
              className="font-semibold"
              style={{ color: 'var(--color-text-primary)', fontSize: 18, letterSpacing: '-0.01em' }}
            >
              Start from a template
            </h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13, lineHeight: 1.5, maxWidth: 460 }}>
              Open a worked example to see how a real workspace is structured. You can edit, rename, or delete anything afterwards.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-opacity hover:opacity-100"
            style={{ color: 'var(--color-text-muted)', opacity: 0.7 }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {templates.map((t) => {
            const Icon = t.icon
            const isHovered = hovered === t.name
            return (
              <button
                key={t.name}
                onMouseEnter={() => setHovered(t.name)}
                onMouseLeave={() => setHovered((h) => (h === t.name ? null : h))}
                onFocus={() => setHovered(t.name)}
                onBlur={() => setHovered((h) => (h === t.name ? null : h))}
                onClick={() => onSelect(t.fn(), t.name)}
                className="text-left transition-all"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  padding: '16px 16px 14px',
                  borderRadius: 14,
                  border: `1px solid ${isHovered ? t.accent : 'var(--color-border)'}`,
                  background: isHovered
                    ? `linear-gradient(160deg, ${t.glow}, transparent 70%), var(--color-bg-secondary, rgba(255,255,255,0.02))`
                    : 'var(--color-bg-secondary, rgba(255,255,255,0.02))',
                  boxShadow: isHovered ? `0 10px 28px ${t.glow}` : 'none',
                  transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
                  cursor: 'pointer',
                }}
              >
                <div className="flex items-center" style={{ gap: 10 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: `${t.accent}1f`,
                      border: `1px solid ${t.accent}33`,
                      color: t.accent,
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={17} />
                  </span>
                  <span
                    className="font-semibold"
                    style={{ color: 'var(--color-text-primary)', fontSize: 14, letterSpacing: '-0.005em' }}
                  >
                    {t.label}
                  </span>
                </div>
                <p
                  style={{
                    color: 'var(--color-text-secondary, var(--color-text-muted))',
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {t.tagline}
                </p>
                <span
                  style={{
                    color: 'var(--color-text-muted)',
                    fontSize: 11,
                    fontFamily:
                      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                    letterSpacing: '0.02em',
                    marginTop: 'auto',
                  }}
                >
                  {summaries[t.name]}
                </span>
              </button>
            )
          })}
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
  title = 'New collection',
  description = 'Choose a friendly name — the folder will be created using the slug below.',
  confirmLabel = 'Choose location →',
  showSlug = true,
}: {
  value: string
  onChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
  title?: string
  description?: string
  confirmLabel?: string
  showSlug?: boolean
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
            {title}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            {description}
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
          {showSlug && (
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
          )}
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
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
