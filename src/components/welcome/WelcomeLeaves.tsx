import { useMemo, useState } from 'react'
import { FolderOpen, Pencil, X } from 'lucide-react'
import { WorkspaceEditDialog } from './WelcomeDialogs'

// ─── Types shared with WelcomeScreen ────────────────────────────────────────

export interface WsThumbnailElement {
  kind: 'person' | 'system' | 'container' | 'component' | 'external'
}

export interface FolderWorkspace {
  name: string
  modifiedAt?: number
  scope?: string
  elementCount?: number
  viewCount?: number
  editing?: boolean
  elements?: WsThumbnailElement[]
}

// Element kind → color (matches canvas node accents)
const KIND_COLORS: Record<string, string> = {
  person: '#22c55e',
  system: '#93c5fd',
  external: '#9ca3af',
  container: '#14b8a6',
  component: '#a855f7',
}

// Scope colors (same as FloatingTopPill)
const SCOPE_COLORS: Record<string, string> = {
  softwaresystem: '#38bdf8',
  landscape: '#a78bfa',
}

function formatRelativeDays(modifiedAt: number | undefined): string {
  if (!modifiedAt) return 'unknown'
  const days = Math.round((modifiedAt - Date.now()) / (1000 * 60 * 60 * 24))
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(days, 'day')
}

/** Renders a tiny SVG showing elements as positioned rectangles */
export function MiniDiagram({ elements, accent }: { elements?: WsThumbnailElement[], accent: string }) {
  if (!elements || elements.length === 0) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.2 }}>
        <rect x="6" y="6" width="12" height="12" rx="2" stroke={accent} strokeWidth="1.5" />
      </svg>
    )
  }

  // Layout: stack rectangles vertically with color by kind
  const n = Math.min(elements.length, 5)
  const rectHeight = 3
  const spacing = 1
  const totalHeight = n * rectHeight + (n - 1) * spacing
  const startY = (20 - totalHeight) / 2

  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      {elements.slice(0, n).map((el, i) => {
        const y = startY + i * (rectHeight + spacing)
        const color = KIND_COLORS[el.kind] ?? accent
        return (
          <rect
            key={i}
            x="4"
            y={y}
            width="16"
            height={rectHeight}
            rx="1"
            fill={color}
            opacity={0.7}
          />
        )
      })}
    </svg>
  )
}

// ─── WorkspaceCard ──────────────────────────────────────────────────────────

export function WorkspaceCard({ ws, onOpen, onRename, onDelete }: {
  ws: FolderWorkspace
  onOpen: () => void
  onRename: (newName: string) => void
  onDelete: () => void
}) {
  const [showEdit, setShowEdit] = useState(false)
  const label = ws.name.replace(/\.dsl$/, '').replace(/-/g, ' ')
  const scopeLabel = ws.scope === 'softwaresystem' ? 'SOFTWARE SYSTEM' : ws.scope === 'landscape' ? 'LANDSCAPE' : ''
  const scopeColor = SCOPE_COLORS[ws.scope ?? ''] ?? 'var(--color-accent)'

  const modified = useMemo(
    () => formatRelativeDays(ws.modifiedAt),
    [ws.modifiedAt],
  )

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className="group rounded-xl border cursor-pointer transition-shadow"
        style={{
          borderColor: 'var(--color-border)',
          background: 'var(--color-surface-2)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          position: 'relative',
          overflow: 'hidden',
          minHeight: 140,
        }}
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--color-surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MiniDiagram elements={ws.elements} accent={scopeColor} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
              Modified {modified}
            </div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: scopeColor, display: 'flex', alignItems: 'center', gap: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: scopeColor,
            }} />
            {scopeLabel}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setShowEdit(true) }}
            title="Edit workspace"
            aria-label="Edit workspace"
            style={{
              position: 'absolute', top: 6, right: 6,
              width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 6, border: 'none',
              background: 'rgba(0,0,0,0.5)', color: 'var(--color-text-muted)',
              cursor: 'pointer', opacity: 0.7,
              transition: 'opacity 120ms',
            }}
          >
            <Pencil size={11} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--color-text-muted)', marginTop: 'auto' }}>
          <span>
            <strong style={{ color: 'var(--color-text-secondary)' }}>{ws.elementCount ?? 0}</strong> elements
          </span>
          <span>
            <strong style={{ color: 'var(--color-text-secondary)' }}>{ws.viewCount ?? 0}</strong> views
          </span>
        </div>
      </div>

      {showEdit && (
        <WorkspaceEditDialog
          name={label}
          onRename={(newName) => { setShowEdit(false); onRename(newName) }}
          onDelete={() => { setShowEdit(false); onDelete() }}
          onClose={() => setShowEdit(false)}
        />
      )}
    </>
  )
}

// ─── RecentRow ──────────────────────────────────────────────────────────────

export function RecentRow({
  name,
  displayName,
  path,
  onClick,
  onRemove,
}: {
  name: string
  displayName?: string
  path: string
  onClick: () => void
  onRemove: () => void
}) {
  const label = displayName || name
  const showSlug = displayName && displayName !== name
  return (
    <div
      role="button"
      tabIndex={0}
      className="btn-surface w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
    >
      <FolderOpen
        size={14}
        style={{ color: 'var(--color-accent)', opacity: 0.7, flexShrink: 0 }}
      />
      <span className="flex-1 text-sm font-medium">{label}</span>
      {showSlug && (
        <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{path}</span>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        title="Remove from recents"
        aria-label={`Remove ${label} from recents`}
        className="hover-danger"
        style={{
          width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 6, border: 'none', background: 'transparent',
          color: 'var(--color-text-muted)', cursor: 'pointer', flexShrink: 0,
          transition: 'color 120ms, background 120ms',
        }}
      >
        <X size={12} />
      </button>
    </div>
  )
}

// ─── StartupActionCard ──────────────────────────────────────────────────────

export function StartupActionCard({
  icon,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      className="btn-surface flex-col items-start gap-4 rounded-xl p-6 text-left"
      style={{ flex: 1 }}
      onClick={onClick}
    >
      <span style={{ display: 'flex' }}>
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          {description}
        </span>
      </div>
    </button>
  )
}

// ─── SectionDivider ─────────────────────────────────────────────────────────

export function SectionDivider({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex-1 border-t"
        style={{ borderColor: 'var(--color-border)' }}
      />
      <span
        className="text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
        style={{ color: muted ? 'var(--color-text-muted)' : 'var(--color-text-secondary, var(--color-text-muted))' }}
      >
        {label}
      </span>
      <div
        className="flex-1 border-t"
        style={{ borderColor: 'var(--color-border)' }}
      />
    </div>
  )
}
