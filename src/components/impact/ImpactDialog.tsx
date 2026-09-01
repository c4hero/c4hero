import { useMemo } from 'react'
import { MousePointer, Radar, Trash2, X } from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import { useWorkspaceStore } from '@/store/workspace'
import { computeCascadeImpact } from '@/store/workspace-helpers'
import { formatImpactSummary } from '@/lib/impactMessage'
import { announce } from '@/lib/announce'
import { analyzeImpact, formatImpactHeadline, type ImpactReport } from '@/lib/impactAnalysis'
import ImpactReportBody from './ImpactReportBody'

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
    confirmDelete({ message: formatImpactSummary(impact), impact, targetIds: ids }, () => deleteElements(ids))
  }

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
        <ImpactReportBody report={report} />
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
