import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import type { Workspace } from '@/types/model'
import { buildGroupNodes } from './canvasBuilders'

function el(id: string, x: number, y: number): Node {
  return {
    id,
    type: 'c4',
    position: { x, y },
    measured: { width: 200, height: 100 },
    data: {},
  } as unknown as Node
}

function ws(): Workspace {
  return {
    name: 'Nested groups',
    model: {
      people: [],
      softwareSystems: [],
      relationships: [],
      groups: [
        { id: 'inner', name: 'Inner', elementIds: ['a', 'b'] },
        { id: 'outer', name: 'Outer', elementIds: ['a', 'b', 'c'] },
      ],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

describe('buildGroupNodes', () => {
  it('reserves header space above nested group titles', () => {
    const workspace = ws()
    const result = buildGroupNodes(workspace, workspace.model.groups, [
      el('a', 100, 100),
      el('b', 350, 100),
      el('c', 600, 100),
    ])

    const inner = result.find((node) => node.id === 'group-inner')
    const outer = result.find((node) => node.id === 'group-outer')
    expect(inner).toBeTruthy()
    expect(outer).toBeTruthy()
    expect(inner!.position.y - outer!.position.y).toBeGreaterThanOrEqual(52)
  })

  it('renders explicit nesting when parent and child have equal members', () => {
    const workspace = ws()
    workspace.model.groups = [
      { id: 'outer', name: 'Outer', elementIds: ['a', 'b'] },
      { id: 'inner', name: 'Inner', elementIds: ['a', 'b'], parentId: 'outer' },
    ]
    const result = buildGroupNodes(workspace, workspace.model.groups, [
      el('a', 100, 100),
      el('b', 350, 100),
    ])

    const inner = result.find((node) => node.id === 'group-inner')
    const outer = result.find((node) => node.id === 'group-outer')
    expect(inner).toBeTruthy()
    expect(outer).toBeTruthy()
    expect(inner!.position.y - outer!.position.y).toBeGreaterThanOrEqual(52)
  })
})
