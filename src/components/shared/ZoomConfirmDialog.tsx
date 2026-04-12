import { ZoomIn, Sliders } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace'
import DialogShell from '@/components/shared/DialogShell'

/**
 * Shown when the user zooms into an element that doesn't yet have a child view.
 * Offers a fast "Create" (auto-populated view + immediate navigation) and a
 * "Customize…" escape hatch that opens the full CreateViewDialog pre-scoped.
 */
export default function ZoomConfirmDialog() {
  const pending = useWorkspaceStore((s) => s.pendingZoomConfirm)
  const confirmZoomCreate = useWorkspaceStore((s) => s.confirmZoomCreate)
  const cancelZoomConfirm = useWorkspaceStore((s) => s.cancelZoomConfirm)
  const openCreateViewFromZoom = useWorkspaceStore((s) => s.openCreateViewFromZoom)

  if (!pending) return null

  const viewTypeLabel = pending.targetType === 'container' ? 'container' : 'component'

  return (
    <DialogShell
      onClose={cancelZoomConfirm}
      ariaLabel="Create view to zoom into"
      className="relative w-full max-w-sm rounded-xl border p-5 shadow-2xl"
      style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: 'var(--color-accent-glow)', color: 'var(--color-accent)' }}
        >
          <ZoomIn size={16} aria-hidden="true" />
        </div>
        <h2 className="text-sm font-semibold">Zoom into {pending.elementName}</h2>
      </div>

      <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
        No {viewTypeLabel} view exists for <strong style={{ color: 'var(--color-text-primary)' }}>{pending.elementName}</strong> yet.
        Create one now? The new view will auto-include related elements.
      </p>

      <div className="flex flex-col gap-2">
        <button
          onClick={confirmZoomCreate}
          className="w-full rounded-lg py-2 text-sm font-medium transition-colors"
          style={{ background: 'var(--color-accent)', color: 'var(--color-bg-primary)' }}
        >
          Create {viewTypeLabel} view
        </button>
        <button
          onClick={openCreateViewFromZoom}
          className="w-full rounded-lg py-2 text-sm font-medium border transition-colors inline-flex items-center justify-center gap-2"
          style={{
            background: 'transparent',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        >
          <Sliders size={13} aria-hidden="true" />
          Customize…
        </button>
        <button
          onClick={cancelZoomConfirm}
          className="w-full rounded-lg py-2 text-sm transition-colors"
          style={{ background: 'transparent', color: 'var(--color-text-muted)' }}
        >
          Cancel
        </button>
      </div>
    </DialogShell>
  )
}
