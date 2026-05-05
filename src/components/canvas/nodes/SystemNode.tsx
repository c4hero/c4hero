import { memo } from 'react'
import { type NodeProps } from '@xyflow/react'
import type { C4NodeData } from './types'
import type { SoftwareSystem } from '@/types/model'
import { Globe } from 'lucide-react'
import BaseC4Node from './BaseC4Node'

function SystemNode({ data, selected }: NodeProps & { data: C4NodeData }) {
  const isExternal = (data.element as SoftwareSystem).location === 'External'

  return (
    <BaseC4Node
      data={data}
      selected={selected}
      icon={Globe}
      typeColor={isExternal ? 'var(--color-type-external)' : 'var(--color-type-system)'}
      chipLabel={isExternal ? 'External' : 'System'}
      tint={isExternal ? 'var(--color-tint-external)' : 'var(--color-tint-system)'}
      borderStyle={isExternal ? '2px dashed var(--color-border-external)' : '2px solid var(--color-border-system)'}
      ariaPrefix={isExternal ? 'External Software System' : 'Software System'}
      isExternal={isExternal}
    />
  )
}

export default memo(SystemNode)
