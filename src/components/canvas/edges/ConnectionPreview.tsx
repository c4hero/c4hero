import { ConnectionLineType, getBezierPath, getSimpleBezierPath, getSmoothStepPath, getStraightPath, type ConnectionLineComponentProps } from '@xyflow/react'
import type { C4NodeData } from '../nodes/types'

/** Live connections use handle centres, unlike the outer endpoints of saved edges. */
export default function ConnectionPreview({ fromX, fromY, toX, toY, fromNode, toNode, fromHandle, toHandle, fromPosition, toPosition, connectionLineType, connectionLineStyle, connectionStatus }: ConnectionLineComponentProps) {
  const fromScale = (fromNode.data as unknown as C4NodeData).semantic?.scale ?? 1
  const toScale = (toNode?.data as unknown as C4NodeData | undefined)?.semantic?.scale ?? 1
  // React Flow combines transformed origins with untransformed handle sizes.
  // Unattached targets are pointer coordinates and must not be corrected.
  const params = {
    sourceX: fromX - (fromHandle.width ?? 0) * (1 - fromScale) / 2,
    sourceY: fromY - (fromHandle.height ?? 0) * (1 - fromScale) / 2,
    targetX: toX - (connectionStatus === 'valid' ? toHandle?.width ?? 0 : 0) * (1 - toScale) / 2,
    targetY: toY - (connectionStatus === 'valid' ? toHandle?.height ?? 0 : 0) * (1 - toScale) / 2,
    sourcePosition: fromPosition, targetPosition: toPosition,
  }
  const [path] = connectionLineType === ConnectionLineType.Straight ? getStraightPath(params)
    : connectionLineType === ConnectionLineType.SimpleBezier ? getSimpleBezierPath(params)
    : connectionLineType === ConnectionLineType.Step || connectionLineType === ConnectionLineType.SmoothStep
      ? getSmoothStepPath({ ...params, borderRadius: connectionLineType === ConnectionLineType.Step ? 0 : 5 })
      : getBezierPath(params)
  return <path data-target-node={toHandle?.nodeId} data-target-handle={toHandle?.id} d={path} fill="none" className="react-flow__connection-path" style={connectionLineStyle} />
}
