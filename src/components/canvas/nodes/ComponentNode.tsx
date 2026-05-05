import { memo } from 'react'
import { type NodeProps } from '@xyflow/react'
import type { C4NodeData } from './types'
import type { Component } from '@/types/model'
import { Puzzle } from 'lucide-react'
import BaseC4Node from './BaseC4Node'

function ComponentNode({ data, selected }: NodeProps & { data: C4NodeData }) {
  const component = data.element as Component

  return (
    <BaseC4Node
      data={data}
      selected={selected}
      icon={Puzzle}
      typeColor="var(--color-type-component)"
      chipLabel="Component"
      tint="var(--color-tint-component)"
      borderStyle="2px solid var(--color-border-component)"
      ariaPrefix="Component"
      technology={component.technology}
    />
  )
}

export default memo(ComponentNode)
