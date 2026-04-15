import { describe, it, expect } from 'vitest'
import type { Node, Edge } from '@xyflow/react'
import type { View, Group } from '@/types/model'
import { applyAutoLayout } from './canvasLayout'

function makeNode(id: string): Node {
  return { id, type: 'softwareSystem', position: { x: 0, y: 0 }, data: {} } as Node
}

function makeView(elementIds: string[]): View {
  return {
    type: 'systemLandscape',
    key: 'v1',
    title: 'V1',
    elements: elementIds.map(id => ({ id })),
    relationships: [],
    autoLayout: { direction: 'TB' },
  }
}

function bbox(nodes: Node[], ids: string[]) {
  const picked = nodes.filter(n => ids.includes(n.id))
  return {
    minX: Math.min(...picked.map(n => n.position.x)),
    maxX: Math.max(...picked.map(n => n.position.x + 200)),
    minY: Math.min(...picked.map(n => n.position.y)),
    maxY: Math.max(...picked.map(n => n.position.y + 100)),
  }
}

function isInside(n: Node, b: ReturnType<typeof bbox>) {
  const cx = n.position.x + 100
  const cy = n.position.y + 50
  return cx >= b.minX && cx <= b.maxX && cy >= b.minY && cy <= b.maxY
}

describe('applyAutoLayout with groups', () => {
  it('clusters group members so non-members do not land inside the group bbox', () => {
    // Topology designed to defeat flat layout: each group member is pulled by a
    // non-member, so a flat dagre graph places them on different ranks/columns
    // and a non-member (x2) ends up geometrically inside the group's bbox.
    const nodes = [
      makeNode('g1'), makeNode('g2'), makeNode('g3'),
      makeNode('x1'), makeNode('x2'),
      makeNode('y1'),
    ]
    const edges: Edge[] = [
      { id: 'e1', source: 'x1', target: 'g1' },
      { id: 'e2', source: 'g1', target: 'g2' },
      { id: 'e3', source: 'g2', target: 'y1' },
      { id: 'e4', source: 'x2', target: 'g3' },
      { id: 'e5', source: 'g3', target: 'y1' },
    ]
    const view = makeView(nodes.map(n => n.id))
    const groups: Group[] = [
      { id: 'A', name: 'GroupA', elementIds: ['g1', 'g2', 'g3'] },
    ]

    const laidOut = applyAutoLayout(nodes, edges, view, groups)

    const groupBbox = bbox(laidOut, ['g1', 'g2', 'g3'])
    const nonMembers = laidOut.filter(n => !['g1', 'g2', 'g3'].includes(n.id))
    const intruders = nonMembers.filter(n => isInside(n, groupBbox))
    expect(intruders.map(n => n.id)).toEqual([])
  })

  it('keeps all members of a disconnected group adjacent', () => {
    // Three group members with no internal edges — all edges point elsewhere.
    // A flat graph would scatter them by rank; compound clustering should keep
    // them close enough that each pair is within a couple of ranksep/nodesep.
    const nodes = [
      makeNode('m1'), makeNode('m2'), makeNode('m3'),
      makeNode('a'), makeNode('b'), makeNode('c'),
    ]
    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'm1' },
      { id: 'e2', source: 'b', target: 'm2' },
      { id: 'e3', source: 'c', target: 'm3' },
    ]
    const view = makeView(nodes.map(n => n.id))
    const groups: Group[] = [
      { id: 'A', name: 'Group', elementIds: ['m1', 'm2', 'm3'] },
    ]

    const laidOut = applyAutoLayout(nodes, edges, view, groups)
    const b = bbox(laidOut, ['m1', 'm2', 'm3'])
    // Bbox should be tight — much smaller than the full canvas the six nodes span.
    const fullB = bbox(laidOut, nodes.map(n => n.id))
    const memberArea = (b.maxX - b.minX) * (b.maxY - b.minY)
    const fullArea = (fullB.maxX - fullB.minX) * (fullB.maxY - fullB.minY)
    expect(memberArea).toBeLessThan(fullArea * 0.6)
  })

  it('ignores groups with fewer than 2 members present', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')]
    const edges: Edge[] = [{ id: 'e1', source: 'a', target: 'b' }]
    const view = makeView(['a', 'b', 'c'])
    const groups: Group[] = [
      { id: 'solo', name: 'Solo', elementIds: ['a'] },           // only 1 member → ignored
      { id: 'missing', name: 'Missing', elementIds: ['a', 'z'] }, // 'z' absent → only 1 present → ignored
    ]
    // Should not throw and should still produce positions for every node.
    const laidOut = applyAutoLayout(nodes, edges, view, groups)
    for (const n of laidOut) {
      expect(Number.isFinite(n.position.x)).toBe(true)
      expect(Number.isFinite(n.position.y)).toBe(true)
    }
  })
})
