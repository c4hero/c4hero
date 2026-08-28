import { useMemo } from 'react'
import { ArrowRight, MousePointer, Radar, Trash2, X } from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import { useWorkspaceStore } from '@/store/workspace'
import { computeCascadeImpact } from '@/store/workspace-helpers'
import { formatImpactSummary } from '@/lib/impactMessage'
import { announce } from '@/lib/announce'
import {
  analyzeImpact,
  formatImpactHeadline,
  formatImpactPath,
  type ImpactLink,
  type ImpactReach,
  type ImpactRef,
  type ImpactReport,
  type ImpactView,
} from '@/lib/impactAnalysis'

const TYPE_LABEL: Record<ImpactRef['type'], string> = {
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
}

const SIDE_NOTE: Record<ImpactLink['side'], string> = {
  inbound: 'source stays, link breaks',
  outbound: 'destination stays, link breaks',
  internal: 'both ends removed',
}

/**
 * "What breaks if I remove this?" — the blast radius of a deletion, computed
 * before the user commits to it.
 *
 * Every number here is counted off the model by `analyzeImpact`, using the same
 * cascade rules the real delete uses. Nothing is estimated.
 */
export default function ImpactDialog() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const targetIds = useWorkspaceStore((s) => s.impactTargetIds)
  const closeImpactPanel = useWorkspaceStore((s) => s.closeImpactPanel)
  const selectElements = useWorkspaceStore((s) => s.selectElements)
  const confirmDelete = useWorkspaceStore((s) => s.confirmDelete)
  const deleteElements = useWorkspaceStore((s) => s.deleteElements)

  const report = useMemo<ImpactReport | null>(
    () => (workspace && targetIds ? analyzeImpact(workspace, targetIds) : null),
    [workspace, targetIds],
  )

  if (!report || !workspace || !targetIds) return null

  const close = () => closeImpactPanel()

  function selectAffected() {
    if (!report) return
    selectElements(report.affectedIds)
    announce(`Selected ${report.affectedIds.length} affected elements`)
    close()
  }

  function deleteTargets() {
    if (!workspace || !targetIds) return
    const impact = computeCascadeImpact(workspace, targetIds)
    const ids = [...targetIds]
    close()
    confirmDelete({ message: formatImpactSummary(impact), impact }, () => deleteElements(ids))
  }

  const directDependents = report.dependents.filter((entry) => entry.depth === 1)
  const knockOn = report.dependents.filter((entry) => entry.depth > 1)

  return (
    <DialogShell onClose={close} ariaLabel="Removal impact" className="glass-panel" style={PANEL_STYLE}>
      <header style={HEADER_STYLE}>
        <Radar size={16} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Removal impact
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {formatImpactHeadline(report)}
          </div>
        </div>
        <button onClick={close} aria-label="Close impact" title="Close" style={ICON_BUTTON_STYLE}>
          <X size={14} />
        </button>
      </header>

      <div style={BODY_STYLE}>
        {report.isolated && (
          <p style={NOTE_STYLE}>
            Nothing else in the model points at{' '}
            {report.targets.length === 1 ? 'this element' : 'these elements'}, and no view is scoped
            to {report.targets.length === 1 ? 'it' : 'them'}. Removing{' '}
            {report.targets.length === 1 ? 'it' : 'them'} is a local change.
          </p>
        )}

        <Section title="Goes away" count={report.targets.length + report.descendants.length}>
          {report.targets.map((ref) => <RefRow key={ref.id} entry={ref} note="selected" />)}
          {report.descendants.map((ref) => (
            <RefRow key={ref.id} entry={ref} note="removed with its parent" />
          ))}
        </Section>

        <Section
          title="Breaks now"
          count={directDependents.length}
          hint="These point at something being removed."
        >
          {directDependents.map((entry) => <ReachRow key={entry.id} entry={entry} />)}
        </Section>

        <Section title="Relationships removed" count={report.brokenLinks.length}>
          {report.brokenLinks.map((link) => <LinkRow key={link.id} link={link} />)}
        </Section>

        <Section
          title="Left with nothing attached"
          count={report.orphaned.length}
          hint="Every relationship these had is going."
        >
          {report.orphaned.map((ref) => <RefRow key={ref.id} entry={ref} />)}
        </Section>

        <Section title="Views affected" count={report.views.length}>
          {report.views.map((view) => <ViewRow key={view.key} view={view} />)}
        </Section>

        <Section
          title="Further downstream"
          count={knockOn.length}
          hint="Reached through something that breaks — worth a look, not necessarily broken."
        >
          {knockOn.map((entry) => <ReachRow key={entry.id} entry={entry} />)}
        </Section>

        <Section
          title="No longer depended on"
          count={report.dependencies.length}
          hint="These lose a caller rather than breaking."
        >
          {report.dependencies.map((entry) => <ReachRow key={entry.id} entry={entry} />)}
        </Section>
      </div>

      <footer style={FOOTER_STYLE}>
        <button onClick={selectAffected} style={SECONDARY_BUTTON_STYLE}>
          <MousePointer size={13} />
          Select affected ({report.affectedIds.length})
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={close} style={SECONDARY_BUTTON_STYLE}>Keep it</button>
        <button onClick={deleteTargets} style={DANGER_BUTTON_STYLE}>
          <Trash2 size={13} />
          Delete anyway...
        </button>
      </footer>
    </DialogShell>
  )
}

// ─── Rows ────────────────────────────────────────────────────────────

function Section({
  title, count, hint, children,
}: { title: string; count: number; hint?: string; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    <section aria-label={title} style={{ borderBottom: '1px solid var(--color-border)' }}>
      <h3 style={SECTION_TITLE_STYLE}>
        {title}
        <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}> ({count})</span>
      </h3>
      {hint && <p style={HINT_STYLE}>{hint}</p>}
      {children}
    </section>
  )
}

function RefRow({ entry, note }: { entry: ImpactRef; note?: string }) {
  return (
    <div style={ROW_STYLE}>
      <div style={{ minWidth: 0 }}>
        <div style={ROW_TITLE_STYLE}>{formatImpactPath(entry)}</div>
        <div style={ROW_SUBTITLE_STYLE}>
          {TYPE_LABEL[entry.type]}
          {note ? ` — ${note}` : ''}
        </div>
      </div>
    </div>
  )
}

function ReachRow({ entry }: { entry: ImpactReach }) {
  return (
    <div style={ROW_STYLE}>
      <div style={{ minWidth: 0 }}>
        <div style={ROW_TITLE_STYLE}>{formatImpactPath(entry)}</div>
        <div style={ROW_SUBTITLE_STYLE}>
          {TYPE_LABEL[entry.type]} — {entry.depth === 1 ? 'directly connected' : `${entry.depth} hops away`}
        </div>
      </div>
    </div>
  )
}

function LinkRow({ link }: { link: ImpactLink }) {
  return (
    <div style={ROW_STYLE}>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...ROW_TITLE_STYLE, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span>{link.sourceName}</span>
          <ArrowRight size={11} aria-label="to" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <span>{link.destinationName}</span>
        </div>
        <div style={ROW_SUBTITLE_STYLE}>
          {link.description ? `${link.description} — ` : ''}{SIDE_NOTE[link.side]}
        </div>
      </div>
    </div>
  )
}

function ViewRow({ view }: { view: ImpactView }) {
  return (
    <div style={ROW_STYLE}>
      <div style={{ minWidth: 0 }}>
        <div style={ROW_TITLE_STYLE}>{view.title}</div>
        <div style={{ ...ROW_SUBTITLE_STYLE, color: view.deleted ? 'var(--color-error-text)' : undefined }}>
          {view.deleted
            ? 'deleted — its scope element is going'
            : `loses ${view.lostElements} element${view.lostElements === 1 ? '' : 's'}`}
        </div>
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────

const PANEL_STYLE: React.CSSProperties = {
  width: 'min(640px, 94vw)',
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

const BODY_STYLE: React.CSSProperties = { overflowY: 'auto', flex: 1, minHeight: 0 }

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
  padding: '10px 14px 2px',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--color-text-secondary)',
}

const HINT_STYLE: React.CSSProperties = {
  margin: 0,
  padding: '0 14px 4px',
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-muted)',
}

const NOTE_STYLE: React.CSSProperties = {
  margin: 0,
  padding: '14px',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-secondary)',
  borderBottom: '1px solid var(--color-border)',
}

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 9,
  padding: '6px 14px',
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

const SECONDARY_BUTTON_STYLE: React.CSSProperties = {
  ...BUTTON_BASE,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text-secondary)',
}

const DANGER_BUTTON_STYLE: React.CSSProperties = {
  ...BUTTON_BASE,
  border: '1px solid color-mix(in srgb, var(--color-error) 45%, transparent)',
  background: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
  color: 'var(--color-error-text)',
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
