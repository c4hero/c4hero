import { memo } from 'react'
import { type NodeProps } from '@xyflow/react'
import type { C4NodeData } from './types'
import type { Person } from '@/types/model'
import { UserRound } from 'lucide-react'
import BaseC4Node from './BaseC4Node'

function PersonNode({ data, selected }: NodeProps & { data: C4NodeData }) {
  const isExternal = (data.element as Person).location === 'External'

  return (
    <BaseC4Node
      data={data}
      selected={selected}
      icon={UserRound}
      typeColor={isExternal ? 'var(--color-type-external)' : 'var(--color-type-person)'}
      chipLabel={isExternal ? 'External' : 'Person'}
      tint={isExternal ? 'var(--color-tint-external)' : 'var(--color-tint-person)'}
      borderStyle={isExternal ? '2px dashed var(--color-border-external)' : '2px solid var(--color-border-person)'}
      ariaPrefix={isExternal ? 'External Person' : 'Person'}
      isExternal={isExternal}
    />
  )
}

export default memo(PersonNode)
