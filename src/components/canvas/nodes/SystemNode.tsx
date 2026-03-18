import { memo } from 'react'
import { type NodeProps } from '@xyflow/react'
import type { C4NodeData } from './types'
import type { SoftwareSystem } from '@/types/model'
import { Globe, LayoutGrid, ZoomIn } from 'lucide-react'
import StatusDot from './StatusDot'
import InlineName from './InlineName'
import NodeHandles from './NodeHandles'

function SystemNode({ data, selected }: NodeProps & { data: C4NodeData }) {
  const { element, childCount, canDrill, onDrillIn, viewCount = 1 } = data
  const isExternal = (element as SoftwareSystem).location === 'External'
  const typeColor = isExternal ? 'var(--color-type-external)' : 'var(--color-type-system)'
  const chipLabel = isExternal ? 'External' : 'System'
  const desc = element.description ?? ''

  return (
    <div
      className={`c4-node relative ${selected ? 'selected' : ''}`}
      style={{
        background: isExternal ? 'var(--color-tint-external)' : 'var(--color-tint-system)',
        border: selected
          ? '2px solid var(--color-accent)'
          : isExternal
          ? '2px dashed var(--color-border-external)'
          : '2px solid var(--color-border-system)',
      }}
      role="figure"
      aria-label={`${isExternal ? 'External ' : ''}Software System: ${element.name}${element.description ? ` - ${element.description}` : ''}`}
      aria-selected={selected}
    >
      <StatusDot status={element.status} />

      {/* Row 1: icon + title + action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Globe size={16} aria-hidden="true" style={{ flexShrink: 0, color: typeColor }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <InlineName elementId={element.id} name={element.name} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }} className="c4-node-actions">
          {viewCount > 1 && (
            <button
              className="c4-node-action-btn nodrag"
              style={{ color: typeColor }}
              title={`Appears in ${viewCount} views`}
              aria-label={`${element.name} appears in ${viewCount} views`}
              onClick={(e) => e.stopPropagation()}
            >
              <LayoutGrid size={11} aria-hidden="true" />
            </button>
          )}
          {canDrill && childCount !== undefined && childCount > 0 && (
            <button
              className="c4-node-action-btn nodrag"
              style={{ color: typeColor }}
              onClick={(e) => { e.stopPropagation(); onDrillIn?.(element.id) }}
              title={`View ${childCount} container${childCount !== 1 ? 's' : ''}`}
              aria-label={`Drill into ${element.name}, ${childCount} containers`}
            >
              <ZoomIn size={11} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: description */}
      {desc && (
        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '6px 0 0', lineHeight: '1.4' }}>
          {desc}
        </p>
      )}

      {/* Row 3: type chip */}
      <div style={{ marginTop: '8px' }}>
        <span
          className="c4-type-chip"
          style={{
            background: `color-mix(in srgb, ${typeColor} 12%, transparent)`,
            color: typeColor,
          }}
        >
          {chipLabel}
        </span>
      </div>

      <NodeHandles />
    </div>
  )
}

export default memo(SystemNode)
