import { memo } from 'react'
import { type NodeProps } from '@xyflow/react'
import type { C4NodeData } from './types'
import type { Container } from '@/types/model'
import { Database, Box, ZoomIn } from 'lucide-react'
import StatusDot from './StatusDot'
import InlineName from './InlineName'
import NodeHandles from './NodeHandles'

function ContainerNode({ data, selected }: NodeProps & { data: C4NodeData }) {
  const { element, style, childCount, canDrill, onDrillIn } = data
  const container = element as Container
  const isDatabase = style?.shape === 'Cylinder' || container.tags.includes('Database')
  const Icon = isDatabase ? Database : Box

  return (
    <div
      className={`c4-node relative ${selected ? 'selected' : ''}`}
      style={{
        background: 'var(--color-tint-container)',
        border: selected
          ? '1.5px solid var(--color-accent)'
          : '1px solid var(--color-border-container)',
      }}
      role="treeitem"
      aria-label={`Container: ${element.name}${container.technology ? ` (${container.technology})` : ''}${element.description ? ` - ${element.description}` : ''}`}
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
          title={`View ${childCount} component${childCount !== 1 ? 's' : ''}`}
          aria-label={`Drill into ${element.name}, ${childCount} components`}
        >
          <ZoomIn size={10} aria-hidden="true" />
          {childCount}
        </button>
      )}

      <div className="c4-node-type" style={{ color: 'var(--color-type-container)' }}>
        <Icon size={13} aria-hidden="true" />
        <span>Container</span>
      </div>

      <InlineName elementId={element.id} name={element.name} />

      {element.description && (
        <div className="c4-node-desc">
          {element.description.length > 90
            ? element.description.slice(0, 90) + '...'
            : element.description}
        </div>
      )}

      {container.technology && (
        <div className="c4-node-tech">{container.technology}</div>
      )}

      <NodeHandles />
    </div>
  )
}

export default memo(ContainerNode)
