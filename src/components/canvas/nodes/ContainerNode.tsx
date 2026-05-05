import { memo } from 'react'
import { type NodeProps } from '@xyflow/react'
import type { C4NodeData } from './types'
import type { Container } from '@/types/model'
import { Database, Box, Monitor, Zap, GitMerge, Smartphone, HardDrive } from 'lucide-react'
import BaseC4Node from './BaseC4Node'
import { getElementTypeLabel } from '@/lib/elementMeta'

function ContainerNode({ data, selected }: NodeProps & { data: C4NodeData }) {
  const container = data.element as Container
  const tags = container.tags

  const Icon =
    tags.includes('Database') ? Database
    : tags.includes('Web Application') ? Monitor
    : tags.includes('Service') ? Zap
    : tags.includes('Queue') ? GitMerge
    : tags.includes('Mobile App') ? Smartphone
    : tags.includes('File System') ? HardDrive
    : Box

  return (
    <BaseC4Node
      data={data}
      selected={selected}
      icon={Icon}
      typeColor="var(--color-type-container)"
      chipLabel={getElementTypeLabel(container)}
      tint="var(--color-tint-container)"
      borderStyle="2px solid var(--color-border-container)"
      ariaPrefix="Container"
      technology={container.technology}
    />
  )
}

export default memo(ContainerNode)
