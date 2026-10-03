import { Position } from '@xyflow/react'

/** React Flow measures transformed handle origins but untransformed handle sizes.
 * Correct that mismatch before snapping the endpoint to the handle's centre. */
export function snapToNode(x: number, y: number, side: Position, radius: number, scale = 1): [number, number] {
  const centerCorrection = radius * (1 - scale)
  const farCorrection = radius * (2 - scale)
  switch (side) {
    case Position.Left: return [x + radius * scale, y - centerCorrection]
    case Position.Right: return [x - farCorrection, y - centerCorrection]
    case Position.Top: return [x - centerCorrection, y + radius * scale]
    case Position.Bottom: return [x - centerCorrection, y - farCorrection]
    default: return [x, y]
  }
}
