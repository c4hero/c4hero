import { Handle, Position } from '@xyflow/react'

const VISIBLE = 'c4-handle c4-handle-visible !border-0'
const TARGET = 'c4-handle c4-handle-target !border-0'

/** Renders handles on all 4 sides.
 *  Source handles show on hover (for dragging connections).
 *  Target handles are large invisible hit zones for easy drop. */
export default function NodeHandles() {
  return (
    <>
      {/* Visible source handles — shown on hover via CSS */}
      <Handle type="source" position={Position.Top} id="top-source" className={VISIBLE} aria-hidden="true" />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className={VISIBLE} aria-hidden="true" />
      <Handle type="source" position={Position.Left} id="left-source" className={VISIBLE} aria-hidden="true" />
      <Handle type="source" position={Position.Right} id="right-source" className={VISIBLE} aria-hidden="true" />

      {/* Large invisible target handles — generous drop zones */}
      <Handle type="target" position={Position.Top} id="top-target" className={TARGET} aria-hidden="true" />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className={TARGET} aria-hidden="true" />
      <Handle type="target" position={Position.Left} id="left-target" className={TARGET} aria-hidden="true" />
      <Handle type="target" position={Position.Right} id="right-target" className={TARGET} aria-hidden="true" />
    </>
  )
}
