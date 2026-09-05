import { FileWarning, RefreshCw, X } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace'
import { applyDiskSnapshot } from '@/hooks/useDiskWatch'
import { suppressSnapshot } from '@/lib/saveCoordinator'
import { announce } from '@/lib/announce'

/**
 * Slim bar under the top pill for disk-watch situations that need a human:
 * the file changed while there are unsaved local edits, the new text can't
 * be applied, or the file vanished. Never auto-resolves either way.
 */
export default function DiskConflictBar() {
  const conflict = useWorkspaceStore((s) => s.diskConflict)
  const missing = useWorkspaceStore((s) => s.diskFileMissing)
  const activeFilename = useWorkspaceStore((s) => s.activeWorkspaceFilename)
  const workspaceName = useWorkspaceStore((s) => s.workspace?.name)

  if (!conflict && !missing) return null

  const filename = conflict?.filename ?? activeFilename ?? `${workspaceName ?? 'workspace'}.dsl`

  const reload = () => {
    if (!conflict) return
    if (applyDiskSnapshot(conflict.filename, conflict.snapshot, conflict.hashes)) {
      useWorkspaceStore.getState().setDiskConflict(null)
    }
  }
  const keepMine = () => {
    if (!conflict) return
    // Stop re-prompting about this exact on-disk state; the next save overwrites it.
    suppressSnapshot(conflict.hashes)
    useWorkspaceStore.getState().setDiskConflict(null)
    announce('Kept your version — the next save overwrites the file')
  }
  const dismiss = () => {
    const s = useWorkspaceStore.getState()
    if (conflict) { suppressSnapshot(conflict.hashes); s.setDiskConflict(null) }
    if (missing) s.setDiskFileMissing(false)
  }

  let message: string
  if (conflict?.reason === 'dirty') {
    message = `${filename} changed on disk — you have unsaved changes here.`
  } else if (conflict) {
    message = `${filename} changed on disk but ${conflict.detail ?? 'cannot be applied'} — canvas kept as it was.`
  } else {
    message = `${filename} is no longer on disk. Your work is still here — Save writes it back.`
  }

  return (
    <div
      role="alert"
      data-disk-conflict-bar
      data-reason={conflict?.reason ?? 'missing'}
      style={{
        position: 'fixed',
        top: 64,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        maxWidth: 'min(720px, calc(100vw - 32px))',
        padding: '6px 10px 6px 12px',
        borderRadius: 10,
        border: '1px solid var(--color-warning)',
        background: 'var(--color-bg-panel)',
        color: 'var(--color-text-primary)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        fontSize: 'var(--text-xs)',
      }}
    >
      <FileWarning size={14} color="var(--color-warning)" aria-hidden="true" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>{message}</span>

      {conflict?.reason === 'dirty' && (
        <>
          <button type="button" onClick={reload} className="hover-subtle" style={BTN_PRIMARY}>
            <RefreshCw size={12} aria-hidden="true" /> Reload (discard my changes)
          </button>
          <button type="button" onClick={keepMine} className="hover-subtle" style={BTN}>
            Keep mine
          </button>
        </>
      )}
      {conflict?.reason === 'unparseable' && (
        <button type="button" onClick={reload} className="hover-subtle" style={BTN} title="Try applying the file as it is now">
          <RefreshCw size={12} aria-hidden="true" /> Retry
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        className="hover-subtle"
        aria-label="Dismiss"
        title="Dismiss"
        style={{ ...BTN, padding: 4 }}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  )
}

const BTN: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid var(--color-border)',
  background: 'transparent',
  color: 'var(--color-text-primary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontSize: 'var(--text-xs)',
}

const BTN_PRIMARY: React.CSSProperties = {
  ...BTN,
  border: '1px solid var(--color-warning)',
}
