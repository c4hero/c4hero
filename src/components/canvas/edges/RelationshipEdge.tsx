import { memo, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  getBezierPath,
  getStraightPath,
  Position,
  type EdgeProps,
} from '@xyflow/react'
import type { Relationship, RelationshipStyle } from '@/types/model'

interface RelationshipEdgeData {
  relationship: Relationship
  relationshipStyle?: RelationshipStyle
}

// React Flow places edge endpoints at the outer edge of handles, which
// extend past the node border (handles are centered on the border via CSS
// translate). Pull endpoints inward so arrows connect at the node border.
const SRC_OFFSET = 4  // 8px source handle / 2
const TGT_OFFSET = 7  // 14px target handle / 2

function snapToNode(x: number, y: number, pos: Position, offset: number): [number, number] {
  switch (pos) {
    case Position.Left:   return [x + offset, y]
    case Position.Right:  return [x - offset, y]
    case Position.Top:    return [x, y + offset]
    case Position.Bottom: return [x, y - offset]
    default:              return [x, y]
  }
}

function RelationshipEdge({
  id,
  sourceX: rawSrcX,
  sourceY: rawSrcY,
  targetX: rawTgtX,
  targetY: rawTgtY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps & { data?: RelationshipEdgeData }) {
  const relationship = data?.relationship
  const relStyle = data?.relationshipStyle
  const isAsync = relationship?.interactionStyle === 'Asynchronous'
  const lineStyle = relationship?.lineStyle

  const [sourceX, sourceY] = snapToNode(rawSrcX, rawSrcY, sourcePosition, SRC_OFFSET)
  const [targetX, targetY] = snapToNode(rawTgtX, rawTgtY, targetPosition, TGT_OFFSET)

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
        markerStart="url(#c4-dot)"
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
              padding: '4px 8px',
              borderRadius: 10,
              background: 'color-mix(in srgb, var(--color-canvas) 82%, transparent)',
              boxShadow: '0 1px 2px color-mix(in srgb, black 12%, transparent)',
              textAlign: 'center',
              lineHeight: 1.3,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}
          >
            {relationship?.description && (
              <span
                className="text-[11px]"
                style={{ color: 'var(--color-text-secondary)', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
              >
                {relationship.description}
              </span>
            )}
            {relationship?.technology && (
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%', minWidth: 0 }}>
                {relationship.technology.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                  <span
                    key={t}
                    className="c4-type-chip"
                    style={{
                      background: 'color-mix(in srgb, var(--color-text-muted) 10%, transparent)',
                      color: 'var(--color-text-muted)',
                      fontWeight: 600,
                      textTransform: 'none',
                      letterSpacing: 'normal',
                      maxWidth: '100%',
                      minWidth: 0,
                      whiteSpace: 'normal',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
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
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 3, maxWidth: '100%', minWidth: 0 }}>
                {relationship.technology.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                  <span
                    key={t}
                    className="c4-type-chip"
                    style={{
                      background: 'color-mix(in srgb, var(--color-text-muted) 12%, transparent)',
                      color: 'var(--color-text-muted)',
                      fontWeight: 600,
                      textTransform: 'none',
                      letterSpacing: 'normal',
                      maxWidth: '100%',
                      minWidth: 0,
                      whiteSpace: 'normal',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                    }}
                  >
                    {t}
                  </span>
                ))}
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
