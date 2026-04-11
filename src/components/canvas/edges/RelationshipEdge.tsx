import { memo, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  getBezierPath,
  getStraightPath,
  type EdgeProps,
} from '@xyflow/react'
import type { Relationship, RelationshipStyle } from '@/types/model'

interface RelationshipEdgeData {
  relationship: Relationship
  relationshipStyle?: RelationshipStyle
}

function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps & { data?: RelationshipEdgeData }) {
  const relationship = data?.relationship
  const relStyle = data?.relationshipStyle
  const isAsync = relationship?.interactionStyle === 'Asynchronous'
  const lineStyle = relationship?.lineStyle

  // Choose path function based on lineStyle
  let edgePath: string
  let labelX: number
  let labelY: number

  if (lineStyle === 'Straight') {
    [edgePath, labelX, labelY] = getStraightPath({
      sourceX, sourceY, targetX, targetY,
    })
  } else if (lineStyle === 'Orthogonal') {
    [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX, sourceY, targetX, targetY,
      sourcePosition, targetPosition,
      borderRadius: 20,
    })
  } else {
    // Default: Curved (bezier)
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX, sourceY, targetX, targetY,
      sourcePosition, targetPosition,
    })
  }

  // Apply style from RelationshipStyle if available
  const strokeColor = selected ? 'var(--color-accent)' : (relStyle?.color ?? 'var(--color-edge)')
  const strokeWidth = selected ? 2 : (relStyle?.thickness ?? 1.5)
  const isDashed = isAsync || (relStyle?.dashed ?? false)

  const [hovered, setHovered] = useState(false)

  return (
    <>
      {/* Invisible wider path for easier hover targeting */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ pointerEvents: 'stroke' }}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: isDashed ? '6 4' : undefined,
          opacity: relStyle?.opacity,
        }}
        markerEnd="url(#c4-arrow)"
      />
      {/* Label — shown when either description or technology is present */}
      {(relationship?.description || relationship?.technology) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              maxWidth: 200,
              textAlign: 'center',
              lineHeight: 1.3,
            }}
          >
            {relationship?.description && (
              <span
                className="text-[11px]"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {relationship.description}
              </span>
            )}
            {relationship?.technology && (
              <span
                className={relationship?.description ? 'ml-1 text-[10px]' : 'text-[10px]'}
                style={{ color: 'var(--color-text-muted)' }}
              >
                {relationship.technology}
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
      {/* Hover tooltip */}
      {hovered && relationship && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - 20}px)`,
              background: 'var(--glass-bg-heavy)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '6px 10px',
              maxWidth: 240,
              zIndex: 100,
              backdropFilter: 'blur(8px)',
            }}
          >
            {relationship.description && (
              <div className="text-[11px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {relationship.description}
              </div>
            )}
            {relationship.technology && (
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {relationship.technology}
              </div>
            )}
            {relationship.tags.filter(t => t !== 'Relationship').length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {relationship.tags.filter(t => t !== 'Relationship').map(tag => (
                  <span key={tag} className="text-[9px] rounded px-1 py-0.5" style={{ background: 'var(--color-surface-3)', color: 'var(--color-text-muted)' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export default memo(RelationshipEdge)
