import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { FolderOpen } from 'lucide-react'

interface GroupNodeData {
  label: string
  elementCount: number
}

function GroupNode({ data, selected }: NodeProps & { data: GroupNodeData }) {
  return (
    // pointerEvents: 'none' on the wrapper so two-finger gestures (pinch-
    // zoom) and panning aren't trapped by the often-huge group rectangle.
    // The label header re-enables them so it remains the drag handle and
    // tappable affordance — RF picks up the drag because the matching
    // `.c4-group-handle` lives inside this header.
    <div
      className="rounded-xl p-4"
      style={{
        width: '100%',
        height: '100%',
        minWidth: undefined,
        minHeight: undefined,
        border: selected
          ? '2px dashed var(--canvas-selection, var(--color-accent))'
          : '2px dashed var(--color-border-hover)',
        background: 'var(--color-tint-accent-faint)',
        transition: 'border-color 200ms ease',
        pointerEvents: 'none',
      }}
    >
      <div
        className="c4-group-handle flex items-center gap-1.5"
        style={{ pointerEvents: 'auto', cursor: 'grab', touchAction: 'none' }}
      >
        <FolderOpen size={12} style={{ color: 'var(--canvas-selection, var(--color-accent))', opacity: 0.6 }} />
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--canvas-selection, var(--color-accent))', opacity: 0.7 }}>
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
