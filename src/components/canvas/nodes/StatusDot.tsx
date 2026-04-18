import { memo } from 'react'
import type { ElementStatus } from '@/types/model'

const STATUS_COLORS: Record<ElementStatus, string> = {
  Live: 'var(--color-status-live)',
  Planned: 'var(--color-status-planned)',
  Deprecated: 'var(--color-status-deprecated)',
  Removed: 'var(--color-status-removed)',
}

export default memo(function StatusDot({ status }: { status?: ElementStatus }) {
  if (!status) return null
  return (
    <span
      className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full border border-white/20"
      style={{ background: STATUS_COLORS[status] }}
      title={status}
      role="img"
      aria-label={`Status: ${status}`}
      data-testid="status-dot"
    />
  )
})
