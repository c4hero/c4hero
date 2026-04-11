import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { FolderOpen } from 'lucide-react'

interface GroupNodeData {
  label: string
  elementCount: number
}

function GroupNode({ data, selected }: NodeProps & { data: GroupNodeData }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        width: '100%',
        height: '100%',
        minWidth: undefined,
        minHeight: undefined,
        border: selected
          ? '2px dashed var(--color-accent)'
          : '2px dashed var(--color-border-hover)',
        background: 'var(--color-tint-accent-faint)',
        transition: 'border-color 200ms ease',
      }}
    >
      <div className="flex items-center gap-1.5">
        <FolderOpen size={12} style={{ color: 'var(--color-accent)', opacity: 0.6 }} />
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-accent)', opacity: 0.7 }}>
          {data.label}
        </span>
        {data.elementCount > 0 && (
          <span className="ml-auto text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            {data.elementCount}
          </span>
        )}
      </div>
    </div>
  )
}

export default memo(GroupNode)
