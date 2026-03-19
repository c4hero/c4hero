import type { LucideIcon } from 'lucide-react'
import { LayoutGrid, ZoomIn } from 'lucide-react'
import type { C4NodeData } from './types'
import StatusDot from './StatusDot'
import InlineName from './InlineName'
import NodeHandles from './NodeHandles'

interface BaseC4NodeProps {
  data: C4NodeData
  selected: boolean
  icon: LucideIcon
  typeColor: string
  chipLabel: string
  tint: string
  borderStyle: string
  ariaPrefix: string
  technology?: string
}

export default function BaseC4Node({
  data,
  selected,
  icon: Icon,
  typeColor,
  chipLabel,
  tint,
  borderStyle,
  ariaPrefix,
  technology,
}: BaseC4NodeProps) {
  const { element, childCount, canDrill, onDrillIn, viewCount = 1 } = data
  const desc = element.description ?? ''

  return (
    <div
      className={`c4-node relative ${selected ? 'selected' : ''}`}
      style={{
        background: tint,
        border: selected
          ? '2px solid var(--color-accent)'
          : borderStyle,
      }}
      role="figure"
      aria-label={`${ariaPrefix}: ${element.name}${technology ? ` (${technology})` : ''}${element.description ? ` - ${element.description}` : ''}`}
      aria-selected={selected}
    >
      <StatusDot status={element.status} />

      {/* Row 1: icon + title + action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon size={16} aria-hidden="true" style={{ flexShrink: 0, color: typeColor }} />
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
              title={`View ${childCount} children`}
              aria-label={`Drill into ${element.name}, ${childCount} children`}
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

      {/* Row 3: type chip + technology */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
        <span
          className="c4-type-chip"
          style={{
            background: `color-mix(in srgb, ${typeColor} 12%, transparent)`,
            color: typeColor,
          }}
        >
          {chipLabel}
        </span>
        {technology && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{technology}</span>
        )}
      </div>

      <NodeHandles />
    </div>
  )
}
