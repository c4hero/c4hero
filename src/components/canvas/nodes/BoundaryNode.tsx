import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

interface BoundaryNodeData {
  name: string
  typeLabel: string
}

function BoundaryNode({ data }: NodeProps & { data: BoundaryNodeData }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--glass-overlay-sm)',
        background: 'var(--glass-overlay-xxs)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {/* Header label — top-left */}
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{
          fontSize: 'var(--text-xs-plus)',
          fontWeight: 700,
          color: 'var(--color-text-dim)',
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        }}>
          {data.name}
        </span>
        <span style={{
          fontSize: 'var(--text-xxs)',
          fontWeight: 500,
          color: 'var(--color-text-ghost)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {data.typeLabel}
        </span>
      </div>
    </div>
  )
}

export default memo(BoundaryNode)
