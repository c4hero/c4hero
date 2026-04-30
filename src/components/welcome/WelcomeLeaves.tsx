import { useState } from 'react'
import { FolderOpen, Pencil, X } from 'lucide-react'
import { WorkspaceEditDialog } from './WelcomeDialogs'
import { scopeAccent, scopeLabel } from './workspaceScopeMeta'

// ─── Types shared with WelcomeScreen ────────────────────────────────────────

export interface FolderWorkspace {
  name: string
  modifiedAt?: number
  scope?: string
  elementCount?: number
  viewCount?: number
  editing?: boolean
}

/** Buckets an element count into a stable node count for the DensityGlyph,
 *  so the visual doesn't shimmer when numbers nudge. Caps at 16 nodes. */
function densityNodeCount(elementCount: number): number {
  if (elementCount <= 0) return 0
  if (elementCount <= 5) return elementCount
  if (elementCount <= 15) return 8
  if (elementCount <= 40) return 12
  return 16
}

/** Renders a small grid of rounded squares representing the workspace's
 *  content density — more elements → more nodes. Software-system scope
 *  wraps the grid in an outer frame to suggest a system boundary;
 *  landscape and unscoped workspaces render a bare grid. An empty
 *  workspace shows a single dashed placeholder. */
export function DensityGlyph({
  scope,
  elementCount,
  width = 40,
  height = 24,
}: {
  scope?: string
  elementCount: number
  width?: number
  height?: number
}) {
  const color = scopeAccent(scope)
  const hasFrame = scope === 'softwaresystem'
  const pad = hasFrame ? 5 : 2
  const innerW = width - pad * 2
  const innerH = height - pad * 2

  const nodes = densityNodeCount(elementCount)
  const cols = nodes <= 2 ? Math.max(1, nodes) : nodes <= 6 ? 3 : 4
  const rows = nodes === 0 ? 0 : Math.ceil(nodes / cols)
  const cellW = rows > 0 ? innerW / cols : 0
  const cellH = rows > 0 ? innerH / rows : 0
  const size = Math.min(cellW, cellH) * 0.55

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      {hasFrame && (
        <rect
          x="1" y="1"
          width={width - 2} height={height - 2}
          rx="3"
          stroke={color} strokeWidth="1" opacity={0.35}
        />
      )}
      {nodes === 0 ? (
        <rect
          x={width / 2 - 6} y={height / 2 - 4}
          width="12" height="8" rx="2"
          stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity={0.35}
        />
      ) : (
        Array.from({ length: nodes }).map((_, i) => {
          const col = i % cols
          const row = Math.floor(i / cols)
          const cx = pad + col * cellW + cellW / 2
          const cy = pad + row * cellH + cellH / 2
          return (
            <rect
              key={i}
              x={cx - size / 2} y={cy - size / 2}
              width={size} height={size}
              rx={size * 0.25}
              fill={color} opacity={0.75}
            />
          )
        })
      )}
    </svg>
  )
}

// ─── WorkspaceTile ──────────────────────────────────────────────────────────

/** Shade-style workspace card, shared between the top-bar switcher and the
 *  collection screen. Shows a scope icon + "System"/"Landscape" type callout
 *  in the thumbnail, with label and meta below.
 *
 *  Provide both `onRename` and `onDelete` to render a pencil button that opens
 *  the edit dialog (used on the collection screen). Omit them for the top-bar
 *  switcher where editing lives in a separate flow. */
export function WorkspaceTile({
  label,
  scope,
  elementCount,
  viewCount,
  isActive,
  onClick,
  onRename,
  onDelete,
}: {
  label: string
  scope?: string
  elementCount: number
  viewCount: number
  isActive?: boolean
  onClick: () => void
  onRename?: (newName: string) => void
  onDelete?: () => void
}) {
  const [showEdit, setShowEdit] = useState(false)
  const accent = scopeAccent(scope)
  const typeLabel = scopeLabel(scope)
  const editable = !!onRename && !!onDelete

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className="workspace-tile"
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
        style={{
          position: 'relative',
          display: 'flex', flexDirection: 'column',
          borderRadius: 10, overflow: 'hidden',
          border: isActive
            ? `2px solid ${accent}`
            : '2px solid var(--color-border)',
          background: isActive
            ? `${accent}08`
            : 'rgba(0,0,0,0.2)',
          cursor: isActive ? 'default' : 'pointer',
          transition: 'border-color 150ms, background 150ms',
          textAlign: 'left',
        }}
      >
        {/* Thumbnail — scope icon + type callout */}
        <div
          style={{
            width: '100%', aspectRatio: '5/3',
            background: 'rgba(0,0,0,0.4)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 4,
          }}
        >
          <DensityGlyph scope={scope} elementCount={elementCount} />
          {typeLabel && (
            <span
              style={{
                fontSize: 9, fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: accent,
                opacity: 0.85,
              }}
            >
              {typeLabel}
            </span>
          )}
        </div>

        {/* Label + status */}
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span
              style={{
                fontSize: 12, fontWeight: 600,
                color: 'var(--color-text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {label}
            </span>
            {isActive && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }} />
            )}
          </div>
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
            {elementCount > 0
              ? `${elementCount} element${elementCount !== 1 ? 's' : ''} · ${viewCount}v`
              : 'Empty'}
          </span>
        </div>

        {editable && (
          <button
            className="workspace-tile-edit"
            onClick={(e) => { e.stopPropagation(); setShowEdit(true) }}
            title="Edit workspace"
            aria-label="Edit workspace"
            style={{
              position: 'absolute', top: 6, right: 6,
              width: 24, height: 24,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 6, border: 'none',
              background: 'rgba(0,0,0,0.5)',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            <Pencil size={11} />
          </button>
        )}
      </div>

      {editable && showEdit && (
        <WorkspaceEditDialog
          name={label}
          onRename={(newName) => { setShowEdit(false); onRename!(newName) }}
          onDelete={() => { setShowEdit(false); onDelete!() }}
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
