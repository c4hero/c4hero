import { useMemo, useState } from 'react'
import { ArrowRight, Eye, EyeOff, FileUp, GitCompare, X } from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import { useWorkspaceStore } from '@/store/workspace'
import { openComparisonFile } from '@/lib/fileIO'
import { parseDSL } from '@/lib/dsl'
import { announce } from '@/lib/announce'
import { createLogger } from '@/lib/logger'
import {
  diffWorkspacesCached,
  formatDiffSummary,
  formatElementPath,
  type DiffKind,
  type ElementDiffEntry,
  type FieldChange,
  type RelationshipDiffEntry,
  type ViewDiffEntry,
} from '@/lib/workspaceDiff'

const log = createLogger('CompareDialog')

const KIND_STYLE: Record<DiffKind, { symbol: string; color: string; label: string }> = {
  added: { symbol: '+', color: 'var(--color-success)', label: 'Added' },
  removed: { symbol: '-', color: 'var(--color-error)', label: 'Removed' },
  changed: { symbol: '~', color: 'var(--color-warning)', label: 'Changed' },
}

const TYPE_LABEL: Record<ElementDiffEntry['type'], string> = {
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
}

/** Compare the open workspace against another revision of the same `.dsl`.
 *
 *  The picked revision is parsed once and kept as the comparison base; the diff
 *  is derived from it and the live workspace on every render, so the list below
 *  updates as the user edits. Closing this dialog leaves the comparison running
 *  — `CompareBar` keeps it visible and offers a way out. */
export default function CompareDialog() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const comparisonBase = useWorkspaceStore((s) => s.comparisonBase)
  const comparisonLabel = useWorkspaceStore((s) => s.comparisonLabel)
  const comparisonOverlay = useWorkspaceStore((s) => s.comparisonOverlay)
  const startComparison = useWorkspaceStore((s) => s.startComparison)
  const clearComparison = useWorkspaceStore((s) => s.clearComparison)
  const setComparisonPanelOpen = useWorkspaceStore((s) => s.setComparisonPanelOpen)
  const setComparisonOverlay = useWorkspaceStore((s) => s.setComparisonOverlay)
  const focusViewForElements = useWorkspaceStore((s) => s.focusViewForElements)
  const selectElements = useWorkspaceStore((s) => s.selectElements)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const diff = useMemo(
    () => (comparisonBase && workspace ? diffWorkspacesCached(comparisonBase, workspace) : null),
    [comparisonBase, workspace],
  )

  const close = () => setComparisonPanelOpen(false)

  async function pickRevision() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const picked = await openComparisonFile()
      if (!picked) return
      const { workspace: parsed, errors } = parseDSL(picked.content)
      // The DSL parser is deliberately lenient — it returns whatever it could
      // make sense of. A file that yielded neither a `workspace` declaration nor
      // a single element isn't a revision of anything, so say so instead of
      // starting a comparison that reports the whole model as added.
      const elementCount = parsed.model.people.length + parsed.model.softwareSystems.length
      if (elementCount === 0 && !parsed.name) {
        const detail = errors.length > 0 ? `: ${errors[0].message}` : ''
        setError(`No Structurizr workspace found in ${picked.name}${detail}`)
        return
      }
      startComparison(parsed, picked.name)
      announce(`Comparing against ${picked.name}`)
    } catch (err) {
      log.warn('Failed to open comparison revision', err)
      setError('Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  function jumpTo(headId: string | undefined) {
    if (!headId) return
    focusViewForElements([headId])
    selectElements([headId])
    close()
  }

  return (
    <DialogShell onClose={close} ariaLabel="Compare revisions" className="glass-panel" style={PANEL_STYLE}>
      <header style={HEADER_STYLE}>
        <GitCompare size={16} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Compare revisions
          </div>
          {diff && comparisonLabel && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {workspace?.name ?? 'This workspace'} vs {comparisonLabel} &mdash; {formatDiffSummary(diff)}
            </div>
          )}
        </div>
        <button onClick={close} aria-label="Close compare" title="Close" style={ICON_BUTTON_STYLE}>
          <X size={14} />
        </button>
      </header>

      <div style={BODY_STYLE}>
        {!diff && (
          <div style={{ padding: '24px 18px', textAlign: 'center' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: '0 0 6px' }}>
              Pick another revision of this workspace &mdash; an older copy, a branch checkout, a
              teammate&rsquo;s file &mdash; and see exactly what the architecture gained, lost and changed.
            </p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
              The file is read only. Nothing about your open workspace changes.
            </p>
            <button onClick={pickRevision} disabled={busy} style={PRIMARY_BUTTON_STYLE}>
              <FileUp size={13} />
              {busy ? 'Opening...' : 'Choose a .dsl file...'}
            </button>
            {error && (
              <p role="alert" style={{ marginTop: 14, fontSize: 'var(--text-xs)', color: 'var(--color-error)' }}>
                {error}
              </p>
            )}
          </div>
        )}

        {diff?.identical && (
          <p style={{ padding: '24px 18px', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            No architectural differences. These two revisions describe the same model and views.
          </p>
        )}

        {diff && !diff.identical && (
          <>
            <Section title="Elements" count={diff.elements.length}>
              {diff.elements.map((entry) => (
                <ElementRow
                  key={`${entry.kind}:${entry.headId ?? entry.baseId}`}
                  entry={entry}
                  onJump={() => jumpTo(entry.headId)}
                />
              ))}
            </Section>
            <Section title="Relationships" count={diff.relationships.length}>
              {diff.relationships.map((entry) => (
                <RelationshipRow key={`${entry.kind}:${entry.headId ?? entry.baseId}`} entry={entry} />
              ))}
            </Section>
            <Section title="Views" count={diff.views.length}>
              {diff.views.map((entry) => (
                <ViewRow key={`${entry.kind}:${entry.key}`} entry={entry} />
              ))}
            </Section>
            <Section title="Workspace" count={diff.workspaceChanges.length}>
              {diff.workspaceChanges.map((change) => (
                <div key={change.field} style={ROW_STYLE}>
                  <KindChip kind="changed" />
                  <div style={{ minWidth: 0 }}>
                    <div style={ROW_TITLE_STYLE}>{change.field}</div>
                    <FieldChangeList changes={[change]} />
                  </div>
                </div>
              ))}
            </Section>
          </>
        )}
      </div>

      {diff && (
        <footer style={FOOTER_STYLE}>
          <button
            onClick={() => setComparisonOverlay(!comparisonOverlay)}
            style={SECONDARY_BUTTON_STYLE}
            aria-pressed={comparisonOverlay}
          >
            {comparisonOverlay ? <Eye size={13} /> : <EyeOff size={13} />}
            {comparisonOverlay ? 'Canvas highlight on' : 'Canvas highlight off'}
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={pickRevision} disabled={busy} style={SECONDARY_BUTTON_STYLE}>
            <FileUp size={13} />
            Different file...
          </button>
          <button
            onClick={() => { clearComparison(); announce('Comparison cleared') }}
            style={SECONDARY_BUTTON_STYLE}
          >
            Stop comparing
          </button>
        </footer>
      )}
    </DialogShell>
  )
}

// ─── Rows ────────────────────────────────────────────────────────────

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    <section aria-label={title} style={{ borderBottom: '1px solid var(--color-border)' }}>
      <h3 style={SECTION_TITLE_STYLE}>
        {title}
        <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}> ({count})</span>
      </h3>
      {children}
    </section>
  )
}

function KindChip({ kind }: { kind: DiffKind }) {
  const { symbol, color, label } = KIND_STYLE[kind]
  return (
    <span
      aria-label={label}
      title={label}
      style={{
        flexShrink: 0,
        width: 18,
        height: 18,
        borderRadius: 4,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: 12,
        lineHeight: 1,
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
      }}
    >
      {symbol}
    </span>
  )
}

function FieldChangeList({ changes }: { changes: FieldChange[] }) {
  if (changes.length === 0) return null
  return (
    <ul style={{ margin: '3px 0 0', padding: 0, listStyle: 'none' }}>
      {changes.map((change) => (
        <li key={change.field} style={CHANGE_LINE_STYLE}>
          <span style={{ color: 'var(--color-text-muted)' }}>{change.field}</span>
          <span style={{ color: 'var(--color-error-text)' }}>{change.before || '(empty)'}</span>
          <ArrowRight size={10} aria-label="becomes" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <span style={{ color: 'var(--color-success)' }}>{change.after || '(empty)'}</span>
        </li>
      ))}
    </ul>
  )
}

function ElementRow({ entry, onJump }: { entry: ElementDiffEntry; onJump: () => void }) {
  const canJump = entry.headId !== undefined
  const body = (
    <>
      <KindChip kind={entry.kind} />
      <div style={{ minWidth: 0 }}>
        <div style={ROW_TITLE_STYLE}>{formatElementPath(entry)}</div>
        <div style={ROW_SUBTITLE_STYLE}>{TYPE_LABEL[entry.type]}</div>
        <FieldChangeList changes={entry.changes} />
      </div>
    </>
  )
  if (!canJump) return <div style={ROW_STYLE}>{body}</div>
  return (
    <button
      type="button"
      onClick={onJump}
      className="hover-subtle"
      style={{ ...ROW_STYLE, width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
      // The row's own text is the path plus every changed field, which makes a
      // noisy accessible name; label it with the action instead.
      aria-label={`Show ${entry.name} on the canvas`}
      title={`Show ${entry.name} on the canvas`}
    >
      {body}
    </button>
  )
}

function RelationshipRow({ entry }: { entry: RelationshipDiffEntry }) {
  return (
    <div style={ROW_STYLE}>
      <KindChip kind={entry.kind} />
      <div style={{ minWidth: 0 }}>
        <div style={ROW_TITLE_STYLE}>
          {entry.sourceName} &rarr; {entry.destinationName}
        </div>
        {entry.description && <div style={ROW_SUBTITLE_STYLE}>{entry.description}</div>}
        <FieldChangeList changes={entry.changes} />
      </div>
    </div>
  )
}

function ViewRow({ entry }: { entry: ViewDiffEntry }) {
  return (
    <div style={ROW_STYLE}>
      <KindChip kind={entry.kind} />
      <div style={{ minWidth: 0 }}>
        <div style={ROW_TITLE_STYLE}>{entry.title}</div>
        <div style={ROW_SUBTITLE_STYLE}>{entry.type}</div>
        <FieldChangeList changes={entry.changes} />
        {entry.addedElements.length > 0 && (
          <div style={CHANGE_LINE_STYLE}>
            <span style={{ color: 'var(--color-success)' }}>+ {entry.addedElements.join(', ')}</span>
          </div>
        )}
        {entry.removedElements.length > 0 && (
          <div style={CHANGE_LINE_STYLE}>
            <span style={{ color: 'var(--color-error-text)' }}>- {entry.removedElements.join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────

const PANEL_STYLE: React.CSSProperties = {
  width: 'min(720px, 94vw)',
  maxHeight: '82vh',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 14,
  overflow: 'hidden',
}

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 14px',
  borderBottom: '1px solid var(--color-border)',
}

const BODY_STYLE: React.CSSProperties = {
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
}

const FOOTER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  borderTop: '1px solid var(--color-border)',
  flexWrap: 'wrap',
}

const SECTION_TITLE_STYLE: React.CSSProperties = {
  margin: 0,
  padding: '10px 14px 4px',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--color-text-secondary)',
}

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 9,
  padding: '7px 14px',
}

const ROW_TITLE_STYLE: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-primary)',
  overflowWrap: 'anywhere',
}

const ROW_SUBTITLE_STYLE: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-muted)',
}

const CHANGE_LINE_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 'var(--text-xs)',
  overflowWrap: 'anywhere',
}

const BUTTON_BASE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 11px',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--text-xs)',
  fontWeight: 500,
  cursor: 'pointer',
}

const PRIMARY_BUTTON_STYLE: React.CSSProperties = {
  ...BUTTON_BASE,
  border: '1px solid var(--color-accent)',
  background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
  color: 'var(--color-text-primary)',
}

const SECONDARY_BUTTON_STYLE: React.CSSProperties = {
  ...BUTTON_BASE,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text-secondary)',
}

const ICON_BUTTON_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 26,
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text-secondary)',
  cursor: 'pointer',
  flexShrink: 0,
}
