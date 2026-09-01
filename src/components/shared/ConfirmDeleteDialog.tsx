import { useEffect, useMemo, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import type { CascadeImpact } from '@/store/workspace-helpers'
import { useWorkspaceStore } from '@/store/workspace'
import { analyzeImpact, type ImpactReport } from '@/lib/impactAnalysis'
import ImpactReportBody from '@/components/impact/ImpactReportBody'

interface Props {
  message: string
  impact?: CascadeImpact
  /** Element ids being deleted — when set, the full removal-impact report
   *  ("what breaks if this is removed") renders inline in the confirmation. */
  targetIds?: string[]
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDeleteDialog({ message, impact, targetIds, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const workspace = useWorkspaceStore((s) => s.workspace)

  // The full blast-radius report, shown instead of the bare cascade counts
  // whenever the deletion targets are known (element deletes; relationship,
  // view, and file deletes pass a plain message and keep the compact dialog).
  const report = useMemo<ImpactReport | null>(
    () => (workspace && targetIds && targetIds.length > 0 ? analyzeImpact(workspace, targetIds) : null),
    [workspace, targetIds],
  )

  const impactItems: string[] = []
  if (impact && !report) {
    const { descendantContainers: c, descendantComponents: comp, relationships: r, scopedViews: v } = impact
    if (c > 0) impactItems.push(`${c} ${c === 1 ? 'container' : 'containers'}`)
    if (comp > 0) impactItems.push(`${comp} ${comp === 1 ? 'component' : 'components'}`)
    if (r > 0) impactItems.push(`${r} ${r === 1 ? 'relationship' : 'relationships'}`)
    if (v > 0) impactItems.push(`${v} ${v === 1 ? 'dependent view' : 'dependent views'}`)
  }

  useEffect(() => {
    confirmRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onCancel(); return }
      if (e.key === 'Enter') { onConfirm(); return }

      // Focus trap: keep Tab inside the dialog
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter(el => !el.hasAttribute('disabled'))
        if (focusable.length === 0) { e.preventDefault(); return }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus() }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus() }
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm, onCancel])

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)' }}
        onClick={onCancel}
      />
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        className="glass-panel-solid"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 201,
          width: report ? 'min(560px, 94vw)' : 320,
          maxHeight: '82vh',
          padding: '20px 20px 16px',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: 'var(--color-tint-error)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Trash2 size={15} style={{ color: 'var(--color-error)' }} />
          </div>
          <div>
            <div id="confirm-delete-title" style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', marginBottom: 4 }}>
              Confirm delete
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              {message}
            </div>
            {impactItems.length > 0 && (
              <ul
                aria-label="Cascade impact"
                style={{
                  listStyle: 'none', padding: 0, margin: '8px 0 0',
                  display: 'flex', flexDirection: 'column', gap: 4,
                  fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)',
                }}
              >
                {impactItems.map((item) => (
                  <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--color-error)', fontSize: 10 }}>●</span>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {report && (
          <div
            aria-label="Removal impact"
            style={{
              overflowY: 'auto',
              minHeight: 0,
              margin: '0 -20px',
              borderTop: '1px solid var(--color-border)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <ImpactReportBody report={report} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              height: 34, padding: '0 14px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'transparent', color: 'var(--color-text-muted)',
              fontSize: 'var(--text-sm)', fontWeight: 500, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            style={{
              height: 34, padding: '0 14px', borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--color-error)', color: '#fff',
              fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {report || impactItems.length > 0 ? 'Delete from model' : 'Delete'}
          </button>
        </div>
      </div>
    </>
  )
}
