import { Handle, Position, useNodeId, useStore } from '@xyflow/react'
import { useMemo } from 'react'

/**
 * Handle naming convention:
 *   {side}-{slot}-{type}
 *   side: top | bottom | left | right
 *   slot: a (25%) | b (50%, center) | c (75%)
 *   type: source | target
 *
 * Center handles (b) always show on node hover.
 * Side handles (a, c) show when that side already has a connection.
 */

const SIDES = ['top', 'bottom', 'left', 'right'] as const
const SLOTS = ['a', 'b', 'c'] as const

type Side = (typeof SIDES)[number]

const POSITION_MAP: Record<Side, Position> = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
}

/** Percentage offset from the side start for each slot */
const SLOT_OFFSET: Record<string, string> = {
  a: '25%',
  b: '50%',
  c: '75%',
}

function getHandleStyle(side: Side, slot: string): React.CSSProperties {
  const offset = SLOT_OFFSET[slot]
  if (side === 'top' || side === 'bottom') {
    return { left: offset }
  }
  return { top: offset }
}

export default function NodeHandles() {
  const nodeId = useNodeId()

  // Only subscribe to edges connected to this node (avoids O(N*E) re-renders).
  // Shallow-compare by IDs so the component doesn't re-render when unrelated edges change.
  const connectedEdges = useStore(
    (s) => {
      if (!nodeId) return []
      return s.edges.filter(
        (e) => e.source === nodeId || e.target === nodeId,
      )
    },
    (prev, next) =>
      prev.length === next.length &&
      prev.every((e, i) => e.id === next[i].id && e.sourceHandle === next[i].sourceHandle && e.targetHandle === next[i].targetHandle),
  )

  // Determine which sides have existing connections
  const occupiedSides = useMemo(() => {
    const sides = new Set<Side>()
    if (!nodeId) return sides
    for (const edge of connectedEdges) {
      if (edge.source === nodeId && edge.sourceHandle) {
        const side = edge.sourceHandle.split('-')[0] as Side
        if (SIDES.includes(side)) sides.add(side)
      }
      if (edge.target === nodeId && edge.targetHandle) {
        const side = edge.targetHandle.split('-')[0] as Side
        if (SIDES.includes(side)) sides.add(side)
      }
    }
    return sides
  }, [nodeId, connectedEdges])

  return (
    <>
      {SIDES.map((side) => {
        const pos = POSITION_MAP[side]
        const sideOccupied = occupiedSides.has(side)

        return SLOTS.map((slot) => {
          const isCenter = slot === 'b'
          const sourceId = `${side}-${slot}-source`
          const targetId = `${side}-${slot}-target`

          // Center handles always visible on hover; side handles only if occupied
          const sourceClass = isCenter
            ? 'c4-handle c4-handle-visible !border-0'
            : sideOccupied
            ? 'c4-handle c4-handle-visible c4-handle-extra !border-0'
            : 'c4-handle c4-handle-visible c4-handle-hidden-extra !border-0'

          const targetClass = isCenter
            ? 'c4-handle c4-handle-target !border-0'
            : sideOccupied
            ? 'c4-handle c4-handle-target !border-0'
            : 'c4-handle c4-handle-target c4-handle-hidden-extra !border-0'

          return (
            <span key={`${side}-${slot}`}>
              <Handle
                type="target"
                position={pos}
                id={targetId}
                className={targetClass}
                style={getHandleStyle(side, slot)}
                isConnectableStart={false}
                aria-hidden="true"
              />
              <Handle
                type="source"
                position={pos}
                id={sourceId}
                className={sourceClass}
                style={getHandleStyle(side, slot)}
                aria-hidden="true"
              />
            </span>
          )
        })
      })}
    </>
  )
}
