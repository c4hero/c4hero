import { memo } from 'react'
import { type NodeProps } from '@xyflow/react'
import type { C4NodeData } from './types'
import type { Component } from '@/types/model'
import { Puzzle } from 'lucide-react'
import StatusDot from './StatusDot'
import InlineName from './InlineName'
import NodeHandles from './NodeHandles'

function ComponentNode({ data, selected }: NodeProps & { data: C4NodeData }) {
  const { element } = data
  const component = element as Component

  return (
    <div
      className={`c4-node relative ${selected ? 'selected' : ''}`}
      style={{
        background: 'var(--color-tint-component)',
        border: selected
          ? '1.5px solid var(--color-accent)'
          : '1px solid var(--color-border-component)',
      }}
      role="treeitem"
      aria-label={`Component: ${element.name}${component.technology ? ` (${component.technology})` : ''}${element.description ? ` - ${element.description}` : ''}`}
      aria-selected={selected}
    >
      <StatusDot status={element.status} />

      <div className="c4-node-type" style={{ color: 'var(--color-type-component)' }}>
        <Puzzle size={13} aria-hidden="true" />
        <span>Component</span>
      </div>

      <InlineName elementId={element.id} name={element.name} />

      {element.description && (
        <div className="c4-node-desc">
          {element.description.length > 70
            ? element.description.slice(0, 70) + '...'
            : element.description}
        </div>
      )}

      {component.technology && (
        <div className="c4-node-tech">{component.technology}</div>
      )}

      <NodeHandles />
    </div>
  )
}

export default memo(ComponentNode)
