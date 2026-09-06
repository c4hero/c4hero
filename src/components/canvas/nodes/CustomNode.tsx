import { memo } from 'react'
import { type NodeProps } from '@xyflow/react'
import type { C4NodeData } from './types'
import type { CustomElement } from '@/types/model'
import { Box } from 'lucide-react'
import BaseC4Node from './BaseC4Node'

function CustomNode({ data, selected }: NodeProps & { data: C4NodeData }) {
  const el = data.element as CustomElement

  return (
    <BaseC4Node
      data={data}
      selected={selected}
      icon={Box}
      typeColor="var(--color-type-component)"
      chipLabel={el.metadata || 'Custom'}
      tint="var(--color-tint-component)"
      borderStyle="2px solid var(--color-border-component)"
      ariaPrefix="Custom Element"
    />
  )
}

export default memo(CustomNode)
