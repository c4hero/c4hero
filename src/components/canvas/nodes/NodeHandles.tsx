import { Handle, Position } from '@xyflow/react'

const HIDDEN = 'c4-handle !w-0 !h-0 !min-w-0 !min-h-0 !border-0 !opacity-0'
const VISIBLE = 'c4-handle c4-handle-visible !border-0'

/** Renders handles on all 4 sides.
 *  Source handles show on hover (for dragging connections).
 *  Target handles stay invisible (connection drop targets). */
export default function NodeHandles() {
  return (
    <>
      {/* Visible source handles — shown on hover via CSS */}
      <Handle type="source" position={Position.Top} id="top-source" className={VISIBLE} aria-hidden="true" />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className={VISIBLE} aria-hidden="true" />
      <Handle type="source" position={Position.Left} id="left-source" className={VISIBLE} aria-hidden="true" />
      <Handle type="source" position={Position.Right} id="right-source" className={VISIBLE} aria-hidden="true" />

      {/* Invisible target handles — just drop zones */}
      <Handle type="target" position={Position.Top} id="top-target" className={HIDDEN} aria-hidden="true" />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className={HIDDEN} aria-hidden="true" />
      <Handle type="target" position={Position.Left} id="left-target" className={HIDDEN} aria-hidden="true" />
      <Handle type="target" position={Position.Right} id="right-target" className={HIDDEN} aria-hidden="true" />
    </>
  )
}
