import type { NodeTypes } from '@xyflow/react'
import PersonNode from './PersonNode'
import SystemNode from './SystemNode'
import ContainerNode from './ContainerNode'
import ComponentNode from './ComponentNode'
import GroupNode from './GroupNode'
import BoundaryNode from './BoundaryNode'

export const nodeTypes: NodeTypes = {
  person: PersonNode,
  softwareSystem: SystemNode,
  container: ContainerNode,
  component: ComponentNode,
  group: GroupNode,
  boundary: BoundaryNode,
}
