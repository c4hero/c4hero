import { memo } from 'react'
import { type NodeProps } from '@xyflow/react'
import type { C4NodeData } from './types'
import { Globe, ZoomIn } from 'lucide-react'
import StatusDot from './StatusDot'
import InlineName from './InlineName'
import NodeHandles from './NodeHandles'

function SystemNode({ data, selected }: NodeProps & { data: C4NodeData }) {
  const { element, childCount, canDrill, onDrillIn } = data

  return (
    <div
      className={`c4-node relative ${selected ? 'selected' : ''}`}
      style={{
        background: 'var(--color-tint-system)',
        border: selected
          ? '1.5px solid var(--color-accent)'
          : '1px solid var(--color-border-system)',
      }}
      role="treeitem"
      aria-label={`Software System: ${element.name}${element.description ? ` - ${element.description}` : ''}`}
      aria-selected={selected}
    >
      <StatusDot status={element.status} />

      {canDrill && childCount !== undefined && childCount > 0 && (
        <button
          className="c4-node-badge c4-node-drill"
          onClick={(e) => {
            e.stopPropagation()
            onDrillIn?.(element.id)
          }}
          title={`View ${childCount} container${childCount !== 1 ? 's' : ''}`}
          aria-label={`Drill into ${element.name}, ${childCount} containers`}
        >
          <ZoomIn size={10} aria-hidden="true" />
          {childCount}
        </button>
      )}

      <div className="c4-node-type" style={{ color: 'var(--color-type-system)' }}>
        <Globe size={13} aria-hidden="true" />
        <span>Software System</span>
      </div>

      <InlineName elementId={element.id} name={element.name} />

      {element.description && (
        <div className="c4-node-desc">
          {element.description.length > 100
            ? element.description.slice(0, 100) + '...'
            : element.description}
        </div>
      )}

      <NodeHandles />
    </div>
  )
}

export default memo(SystemNode)
