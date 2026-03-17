import { memo } from 'react'
import { type NodeProps } from '@xyflow/react'
import type { C4NodeData } from './types'
import { UserRound } from 'lucide-react'
import StatusDot from './StatusDot'
import InlineName from './InlineName'
import NodeHandles from './NodeHandles'

function PersonNode({ data, selected }: NodeProps & { data: C4NodeData }) {
  const { element } = data

  return (
    <div
      className={`c4-node relative ${selected ? 'selected' : ''}`}
      style={{
        background: 'var(--color-tint-person)',
        border: selected
          ? '1.5px solid var(--color-accent)'
          : '1px solid var(--color-border-person)',
      }}
      role="treeitem"
      aria-label={`Person: ${element.name}${element.description ? ` - ${element.description}` : ''}`}
      aria-selected={selected}
    >
      <StatusDot status={element.status} />

      <div className="c4-node-type" style={{ color: 'var(--color-type-person)' }}>
        <UserRound size={13} aria-hidden="true" />
        <span>Person</span>
      </div>

      <InlineName elementId={element.id} name={element.name} />

      {element.description && (
        <div className="c4-node-desc">
          {element.description.length > 90
            ? element.description.slice(0, 90) + '...'
            : element.description}
        </div>
      )}

      <NodeHandles />
    </div>
  )
}

export default memo(PersonNode)
