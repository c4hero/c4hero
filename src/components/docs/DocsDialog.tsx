import { BookOpen, X } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace'
import DialogShell from '@/components/shared/DialogShell'
import DocsPane from './DocsPane'

/** Workspace-level documentation: the `!docs` and `!adrs` bundles declared at
 *  the top of the DSL. Element-level docs live in the inspector's Docs tab. */
export default function DocsDialog() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const setOpen = useWorkspaceStore((s) => s.setDocsDialogOpen)
  if (!workspace) return null
  return (
    <DialogShell onClose={() => setOpen(false)} ariaLabel="Workspace documentation" position="shade" style={{ width: 'min(560px, calc(100vw - 32px))' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <BookOpen size={16} />
        <span style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text-primary)', flex: 1 }}>Documentation</span>
        <button type="button" className="btn-icon !min-h-7 !min-w-7 !p-1" onClick={() => setOpen(false)} aria-label="Close documentation">
          <X size={14} />
        </button>
      </div>
      <div style={{ padding: 16, maxHeight: 'min(70vh, 640px)', overflowY: 'auto' }}>
        <DocsPane workspace={workspace} />
      </div>
    </DialogShell>
  )
}
