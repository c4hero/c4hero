import type { ElementStatus } from '@/types/model'

const STATUS_COLORS: Record<ElementStatus, string> = {
  Live: '#22c55e',
  Planned: '#3b82f6',
  Deprecated: '#f59e0b',
  Removed: '#ef4444',
}

export default function StatusDot({ status }: { status?: ElementStatus }) {
  if (!status) return null
  return (
    <span
      className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full border border-white/20"
      style={{ background: STATUS_COLORS[status] }}
      title={status}
      data-testid="status-dot"
    />
  )
}
