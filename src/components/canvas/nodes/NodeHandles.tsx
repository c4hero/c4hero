import { Handle, Position, useNodeId, useStore } from '@xyflow/react'
import { useMemo } from 'react'
import {
  CENTER_SLOT,
  SIDES,
  SLOTS,
  handleId as makeHandleId,
  handleSide,
  handleSlot,
  slotOffset,
  type Side,
} from '../handleSlots'

/**
 * Handle naming convention:
 *   {side}-{slot}-{type}
 *   side: top | bottom | left | right
 *   slot: one of the seven positions in `handleSlots.SLOTS`
 *   type: source | target
 *
 * The centre slot always shows on node hover. The other six stay hidden until
 * an edge actually lands on them, so a node with two connections shows two
 * extra points rather than a picket fence of six.
 */

const POSITION_MAP: Record<Side, Position> = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
}

function getHandleStyle(side: Side, slot: string): React.CSSProperties {
  const offset = slotOffset(slot)
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

  // Slots this node's own edges land on, keyed by side. A slot counts as
  // occupied whichever end of the edge it is — the source dot and the target
  // drop zone at a given point reveal together.
  const occupiedSlots = useMemo(() => {
    const occupied = new Map<Side, Set<string>>()
    if (!nodeId) return occupied

    const occupy = (handleId: string) => {
      const side = handleSide(handleId)
      const slot = handleSlot(handleId)
      if (!side || !slot) return
      const slots = occupied.get(side) ?? new Set<string>()
      slots.add(slot)
      occupied.set(side, slots)
    }

    for (const edge of connectedEdges) {
      if (edge.source === nodeId && edge.sourceHandle) occupy(edge.sourceHandle)
      if (edge.target === nodeId && edge.targetHandle) occupy(edge.targetHandle)
    }
    return occupied
  }, [nodeId, connectedEdges])

  return (
    <>
      {SIDES.map((side) => {
        const pos = POSITION_MAP[side]
        const sideSlots = occupiedSlots.get(side)

        return SLOTS.map((slot) => {
          const isCenter = slot === CENTER_SLOT
          const shown = isCenter || sideSlots?.has(slot) === true
          const sourceId = makeHandleId(side, slot, 'source')
          const targetId = makeHandleId(side, slot, 'target')

          // Centre handles always visible on hover; the rest only once an edge
          // uses them.
          const sourceClass = isCenter
            ? 'c4-handle c4-handle-visible !border-0'
            : shown
            ? 'c4-handle c4-handle-visible c4-handle-extra !border-0'
            : 'c4-handle c4-handle-visible c4-handle-hidden-extra !border-0'

          const targetClass = isCenter
            ? 'c4-handle c4-handle-target !border-0'
            : shown
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
