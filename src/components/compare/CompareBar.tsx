import { useMemo } from 'react'
import { GitCompare, X } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace'
import { announce } from '@/lib/announce'
import { diffWorkspacesCached, formatDiffSummary } from '@/lib/workspaceDiff'

/** Persistent marker shown while a revision comparison is running and the
 *  compare panel is closed. Without it, a tinted canvas would have no
 *  explanation and no way out. Sits top-left, clear of the centered top pill. */
export default function CompareBar() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const comparisonBase = useWorkspaceStore((s) => s.comparisonBase)
  const comparisonLabel = useWorkspaceStore((s) => s.comparisonLabel)
  const panelOpen = useWorkspaceStore((s) => s.comparisonPanelOpen)
  const setComparisonPanelOpen = useWorkspaceStore((s) => s.setComparisonPanelOpen)
  const clearComparison = useWorkspaceStore((s) => s.clearComparison)

  const diff = useMemo(
    () => (comparisonBase && workspace ? diffWorkspacesCached(comparisonBase, workspace) : null),
    [comparisonBase, workspace],
  )

  if (!diff || panelOpen) return null

  return (
    <div
      data-canvas-chrome="compare-bar"
      data-canvas-fit-chrome="top"
      className="glass-panel"
      style={{
        position: 'fixed',
        top: 'max(14px, calc(env(safe-area-inset-top, 0px) + 8px))',
        left: 14,
        zIndex: 50,
        height: 44,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 6px 0 10px',
        maxWidth: 'min(340px, 40vw)',
      }}
    >
      <GitCompare size={14} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} aria-hidden="true" />
      <button
        type="button"
        onClick={() => setComparisonPanelOpen(true)}
        className="hover-subtle"
        title={`Comparing against ${comparisonLabel ?? 'another revision'}`}
        style={{
          minWidth: 0,
          textAlign: 'left',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '2px 4px',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <span
          style={{
            display: 'block',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          vs {comparisonLabel}
        </span>
        <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          {formatDiffSummary(diff)}
        </span>
      </button>
      <button
        type="button"
        onClick={() => { clearComparison(); announce('Comparison cleared') }}
        aria-label="Stop comparing revisions"
        title="Stop comparing"
        className="hover-subtle"
        style={{
          flexShrink: 0,
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
        }}
      >
        <X size={13} />
      </button>
    </div>
  )
}
