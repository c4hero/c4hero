import { describe, it, expect } from 'vitest'
import type { Node, Edge } from '@xyflow/react'
import type { View, Group, Workspace } from '@/types/model'
import { buildBoundaryLayoutClusters, buildBoundaryNodes, buildGroupNodes } from '@/components/canvas/canvasBuilders'
import { clearUnlockedPositions } from '@/store/slices/view-slice'
import { applyAutoLayout, spaceOverlayClusters } from './canvasLayout'

function makeNode(id: string): Node {
  return { id, type: 'softwareSystem', position: { x: 0, y: 0 }, data: {} } as Node
}

function makeSizedNode(id: string, width: number, height: number): Node {
  return {
    id,
    type: 'softwareSystem',
    position: { x: 0, y: 0 },
    measured: { width, height },
    data: {},
  } as Node
}

function makeContainerNode(id: string): Node {
  return {
    id,
    type: 'container',
    position: { x: 0, y: 0 },
    measured: { width: 200, height: 100 },
    data: {},
  } as Node
}

function makeUnmeasuredContainerNode(id: string): Node {
  return {
    id,
    type: 'container',
    position: { x: 0, y: 0 },
    data: {},
  } as Node
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

function measuredCenterX(node: Node) {
  return node.position.x + (node.measured?.width ?? 200) / 2
}

function measuredCenterY(node: Node) {
  return node.position.y + (node.measured?.height ?? 100) / 2
}

function overlayRect(node: Node) {
  return {
    x: node.position.x,
    y: node.position.y,
    w: Number(node.style?.width ?? node.measured?.width ?? 200),
    h: Number(node.style?.height ?? node.measured?.height ?? 100),
  }
}

function overlaysOverlap(a: Node, b: Node) {
  const ar = overlayRect(a)
  const br = overlayRect(b)
  return ar.x < br.x + br.w
    && ar.x + ar.w > br.x
    && ar.y < br.y + br.h
    && ar.y + ar.h > br.y
}

function measuredCopy(node: Node, width: number, height: number): Node {
  return {
    ...node,
    measured: { width, height },
    style: { ...node.style, width, height },
  }
}

function containerWorkspace(): Workspace {
  const container = (id: string, name = id) => ({
    id,
    type: 'container' as const,
    name,
    tags: [],
    properties: {},
    components: [],
  })

  return {
    name: 'Boundaries',
    model: {
      people: [],
      softwareSystems: [
        {
          id: 'sysA',
          type: 'softwareSystem',
          name: 'System A',
          tags: [],
          properties: {},
          containers: [container('a1'), container('a2'), container('a3')],
        },
        {
          id: 'sysB',
          type: 'softwareSystem',
          name: 'System B',
          tags: [],
          properties: {},
          containers: [container('b1'), container('b2'), container('b3')],
        },
      ],
      relationships: [],
      groups: [
        { id: 'groupA', name: 'Group A', elementIds: ['a1', 'a2'] },
        { id: 'groupB', name: 'Group B', elementIds: ['b1', 'b2'] },
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

function multiBoundaryWorkspace(): Workspace {
  const container = (id: string, name = id) => ({
    id,
    type: 'container' as const,
    name,
    tags: [],
    properties: {},
    components: [],
  })

  return {
    name: 'Many boundaries',
    model: {
      people: [],
      softwareSystems: ['A', 'B', 'C', 'D'].map((suffix) => ({
        id: `sys${suffix}`,
        type: 'softwareSystem' as const,
        name: `System ${suffix}`,
        tags: [],
        properties: {},
        containers: [
          container(`${suffix.toLowerCase()}1`),
          container(`${suffix.toLowerCase()}2`),
          container(`${suffix.toLowerCase()}3`),
        ],
      })),
      relationships: [],
      groups: [
        { id: 'groupA', name: 'Group A', elementIds: ['a1', 'a2'] },
        { id: 'groupB', name: 'Group B', elementIds: ['b1', 'b2'] },
        { id: 'groupC', name: 'Group C', elementIds: ['c1', 'c2'] },
        { id: 'groupD', name: 'Group D', elementIds: ['d1', 'd2'] },
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

  it('spaces several top-level group overlays so their rectangles do not overlap', () => {
    const nodes = ['a1', 'b1', 'c1', 'a2', 'b2', 'c2', 'a3', 'b3', 'c3']
      .map((id) => measuredCopy(makeNode(id), 260, 126))
    const edges: Edge[] = [
      { id: 'e1', source: 'a1', target: 'b1' },
      { id: 'e2', source: 'b1', target: 'c1' },
      { id: 'e3', source: 'a2', target: 'c2' },
      { id: 'e4', source: 'b2', target: 'a3' },
      { id: 'e5', source: 'c3', target: 'a1' },
    ]
    const view = makeView(nodes.map((node) => node.id))
    const groups: Group[] = [
      { id: 'A', name: 'Group A', elementIds: ['a1', 'a2', 'a3'] },
      { id: 'B', name: 'Group B', elementIds: ['b1', 'b2', 'b3'] },
      { id: 'C', name: 'Group C', elementIds: ['c1', 'c2', 'c3'] },
    ]

    const laidOut = applyAutoLayout(nodes, edges, view, groups)
    const workspace = containerWorkspace()
    workspace.model.groups = groups
    const groupNodes = buildGroupNodes(workspace, groups, laidOut)

    expect(groupNodes).toHaveLength(3)
    for (let i = 0; i < groupNodes.length; i++) {
      for (let j = i + 1; j < groupNodes.length; j++) {
        expect(overlaysOverlap(groupNodes[i], groupNodes[j])).toBe(false)
      }
    }
  })
})

describe('applyAutoLayout with boundaries', () => {
  it('moves a boundary directly outside a much larger overlapping boundary', () => {
    const nodes = [
      { ...makeContainerNode('a1'), position: { x: 0, y: 0 } },
      { ...makeContainerNode('a2'), position: { x: 12000, y: 0 } },
      { ...makeContainerNode('b1'), position: { x: 1000, y: 0 } },
    ]
    const spaced = spaceOverlayClusters(nodes, [], [
      { id: 'sysA', elementIds: ['a1', 'a2'] },
      { id: 'sysB', elementIds: ['b1'] },
    ])
    const workspace = containerWorkspace()
    workspace.model.softwareSystems[0].containers = [
      { id: 'a1', type: 'container', name: 'A1', tags: [], properties: {}, components: [] },
      { id: 'a2', type: 'container', name: 'A2', tags: [], properties: {}, components: [] },
    ]
    workspace.model.softwareSystems[1].containers = [
      { id: 'b1', type: 'container', name: 'B1', tags: [], properties: {}, components: [] },
    ]
    const view: View = {
      type: 'container',
      key: 'containers',
      softwareSystemId: 'sysA',
      elements: [{ id: 'a1' }, { id: 'a2' }, { id: 'b1' }],
      relationships: [],
      autoLayout: { direction: 'TB' },
    }

    const boundaryNodes = buildBoundaryNodes(workspace, view, spaced)

    expect(boundaryNodes).toHaveLength(2)
    expect(overlaysOverlap(boundaryNodes[0], boundaryNodes[1])).toBe(false)
  })

  it('spaces every drawn boundary cluster so their overlay rectangles do not overlap', () => {
    const workspace = containerWorkspace()
    const ids = ['a1', 'b1', 'a2', 'b2', 'a3', 'b3']
    const nodes = ids.map(makeContainerNode)
    const edges: Edge[] = ids.slice(0, -1).map((id, index) => ({
      id: `e${index}`,
      source: id,
      target: ids[index + 1],
    }))
    const view: View = {
      type: 'container',
      key: 'containers',
      softwareSystemId: 'sysA',
      elements: ids.map((id) => ({ id })),
      relationships: [],
      autoLayout: { direction: 'TB' },
    }
    const boundaryClusters = buildBoundaryLayoutClusters(workspace, view)
    const focalIds = new Set(boundaryClusters.find((cluster) => cluster.id === 'sysA')?.elementIds ?? [])

    const laidOut = applyAutoLayout(nodes, edges, view, workspace.model.groups, 'TB', focalIds, boundaryClusters)
    const groupNodes = buildGroupNodes(workspace, workspace.model.groups, laidOut)
    const boundaryNodes = buildBoundaryNodes(workspace, view, laidOut, groupNodes)

    expect(boundaryNodes).toHaveLength(2)
    expect(overlaysOverlap(boundaryNodes[0], boundaryNodes[1])).toBe(false)
  })

  it('keeps boundaries apart after node measurements expand from the fallback size', () => {
    const workspace = containerWorkspace()
    const ids = ['a1', 'b1', 'a2', 'b2', 'a3', 'b3']
    const nodes = ids.map(makeUnmeasuredContainerNode)
    const edges: Edge[] = ids.slice(0, -1).map((id, index) => ({
      id: `e${index}`,
      source: id,
      target: ids[index + 1],
    }))
    const view: View = {
      type: 'container',
      key: 'containers',
      softwareSystemId: 'sysA',
      elements: ids.map((id) => ({ id })),
      relationships: [],
      autoLayout: { direction: 'TB' },
    }
    const boundaryClusters = buildBoundaryLayoutClusters(workspace, view)
    const focalIds = new Set(boundaryClusters.find((cluster) => cluster.id === 'sysA')?.elementIds ?? [])

    const laidOut = applyAutoLayout(nodes, edges, view, workspace.model.groups, 'TB', focalIds, boundaryClusters)
    const measuredNodes = laidOut.map((node) => measuredCopy(node, 340, 170))
    const groupNodes = buildGroupNodes(workspace, workspace.model.groups, measuredNodes)
    const boundaryNodes = buildBoundaryNodes(workspace, view, measuredNodes, groupNodes)

    expect(boundaryNodes).toHaveLength(2)
    expect(overlaysOverlap(boundaryNodes[0], boundaryNodes[1])).toBe(false)
  })

  it('keeps several boundary overlays apart in a crowded auto-arranged view', () => {
    const workspace = multiBoundaryWorkspace()
    const ids = ['a1', 'b1', 'c1', 'd1', 'a2', 'b2', 'c2', 'd2', 'a3', 'b3', 'c3', 'd3']
    const nodes = ids.map((id) => measuredCopy(makeUnmeasuredContainerNode(id), 260, 126))
    const edges: Edge[] = [
      { id: 'e1', source: 'a1', target: 'b1' },
      { id: 'e2', source: 'b1', target: 'c1' },
      { id: 'e3', source: 'c1', target: 'd1' },
      { id: 'e4', source: 'a2', target: 'c2' },
      { id: 'e5', source: 'b2', target: 'd2' },
      { id: 'e6', source: 'a3', target: 'd3' },
      { id: 'e7', source: 'b3', target: 'c3' },
      { id: 'e8', source: 'd1', target: 'a3' },
    ]
    const view: View = {
      type: 'container',
      key: 'containers',
      softwareSystemId: 'sysA',
      elements: ids.map((id) => ({ id })),
      relationships: [],
      autoLayout: { direction: 'TB' },
    }
    const boundaryClusters = buildBoundaryLayoutClusters(workspace, view)
    const focalIds = new Set(boundaryClusters.find((cluster) => cluster.id === 'sysA')?.elementIds ?? [])

    const laidOut = applyAutoLayout(nodes, edges, view, workspace.model.groups, 'TB', focalIds, boundaryClusters)
    const groupNodes = buildGroupNodes(workspace, workspace.model.groups, laidOut)
    const boundaryNodes = buildBoundaryNodes(workspace, view, laidOut, groupNodes)

    expect(boundaryNodes).toHaveLength(4)
    for (let i = 0; i < boundaryNodes.length; i++) {
      for (let j = i + 1; j < boundaryNodes.length; j++) {
        expect(overlaysOverlap(boundaryNodes[i], boundaryNodes[j])).toBe(false)
      }
    }
  })
})

describe('applyAutoLayout with measured node sizes', () => {
  it('centers differently sized nodes on the same row in left-to-right layout', () => {
    const nodes = [
      makeSizedNode('customer', 346, 194),
      makeSizedNode('atm', 270, 126),
      makeSizedNode('mainframe', 344, 162),
    ]
    const edges: Edge[] = [
      { id: 'e1', source: 'customer', target: 'atm' },
      { id: 'e2', source: 'atm', target: 'mainframe' },
    ]
    const view = makeView(nodes.map(n => n.id))

    const laidOut = applyAutoLayout(nodes, edges, view, [], 'LR')
    const centers = laidOut.map(measuredCenterY)

    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(0.5)
  })

  it('centers differently sized nodes on the same column in top-to-bottom layout', () => {
    const nodes = [
      makeSizedNode('customer', 346, 194),
      makeSizedNode('atm', 270, 126),
      makeSizedNode('mainframe', 344, 162),
    ]
    const edges: Edge[] = [
      { id: 'e1', source: 'customer', target: 'atm' },
      { id: 'e2', source: 'atm', target: 'mainframe' },
    ]
    const view = makeView(nodes.map(n => n.id))

    const laidOut = applyAutoLayout(nodes, edges, view, [], 'TB')
    const centers = laidOut.map(measuredCenterX)

    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(0.5)
  })
})

describe('locked elements through a full re-layout', () => {
  // Uses the real clearUnlockedPositions from view-slice.ts — what
  // resetAndRelayout/setLayoutDirection actually call — rather than a
  // hand-copied stand-in, so a regression there fails this suite too.

  it('leaves a locked node exactly where it was and reflows the rest around it', () => {
    const view = makeView(['a', 'b', 'c'])
    for (const el of view.elements) { el.x = 500; el.y = 500 }
    const locked = view.elements.find((el) => el.id === 'b')!
    locked.locked = true
    locked.x = 1234
    locked.y = 5678

    clearUnlockedPositions(view)

    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')]
    nodes[1].position = { x: 1234, y: 5678 }
    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
    ]

    const laidOut = applyAutoLayout(nodes, edges, view, [])

    const b = laidOut.find((n) => n.id === 'b')!
    expect(b.position).toEqual({ x: 1234, y: 5678 })

    // The unlocked pair got fresh placement rather than staying stacked at 500.
    for (const id of ['a', 'c']) {
      const node = laidOut.find((n) => n.id === id)!
      expect(node.position).not.toEqual({ x: 500, y: 500 })
    }
  })

  it('reflows nodes two or more hops from the locked node instead of parking them', () => {
    // customer -> web -> api -> db with api locked: customer and db have no
    // direct edge to the lock, but they're in its component, so they belong
    // in the dagre flow — not dumped into the disconnected-nodes parking row.
    const ids = ['customer', 'web', 'api', 'db']
    const view = makeView(ids)
    const locked = view.elements.find((el) => el.id === 'api')!
    locked.locked = true
    locked.x = 2000
    locked.y = 900

    clearUnlockedPositions(view)

    const edges: Edge[] = [
      { id: 'e1', source: 'customer', target: 'web' },
      { id: 'e2', source: 'web', target: 'api' },
      { id: 'e3', source: 'api', target: 'db' },
    ]
    const nodes = ids.map(makeNode)
    nodes[2].position = { x: 2000, y: 900 } // buildNodes seeds saved positions
    const laidOut = applyAutoLayout(nodes, edges, view, [], 'LR')

    expect(laidOut.find((n) => n.id === 'api')!.position).toEqual({ x: 2000, y: 900 })

    // Left-to-right chain: each node sits strictly right of its predecessor.
    // The parking row would put customer/db at the frozen bbox's left edge.
    const xs = ids.map((id) => laidOut.find((n) => n.id === id)!.position.x)
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1])
    }
  })

  it('keeps two locked nodes fixed without dropping reflowed nodes on either of them', () => {
    const ids = ['a', 'b', 'c', 'd']
    const view = makeView(ids)
    for (const [id, x, y] of [['a', 0, 0], ['d', 3000, 1500]] as const) {
      const el = view.elements.find((e) => e.id === id)!
      el.locked = true
      el.x = x
      el.y = y
    }

    clearUnlockedPositions(view)

    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
      { id: 'e3', source: 'c', target: 'd' },
    ]
    const nodes = ids.map(makeNode)
    nodes[0].position = { x: 0, y: 0 }
    nodes[3].position = { x: 3000, y: 1500 }
    const laidOut = applyAutoLayout(nodes, edges, view, [], 'LR')

    expect(laidOut.find((n) => n.id === 'a')!.position).toEqual({ x: 0, y: 0 })
    expect(laidOut.find((n) => n.id === 'd')!.position).toEqual({ x: 3000, y: 1500 })

    // Neither reflowed node may cover a locked one (default node size 200x100).
    const nodesOverlap = (p: Node, q: Node) =>
      p.position.x < q.position.x + 200 && p.position.x + 200 > q.position.x &&
      p.position.y < q.position.y + 100 && p.position.y + 100 > q.position.y
    for (const movedId of ['b', 'c']) {
      const moved = laidOut.find((n) => n.id === movedId)!
      for (const lockedId of ['a', 'd']) {
        const fixed = laidOut.find((n) => n.id === lockedId)!
        expect(nodesOverlap(moved, fixed)).toBe(false)
      }
    }
  })

  it('parks a component with no locked member below the locked content, layout intact', () => {
    // a -> b is anchored by locked a; x -> y is a separate component with no
    // lock, so it parks below the frozen bbox — as a unit, not node-by-node.
    const ids = ['a', 'b', 'x', 'y']
    const view = makeView(ids)
    const locked = view.elements.find((el) => el.id === 'a')!
    locked.locked = true
    locked.x = 100
    locked.y = 100

    clearUnlockedPositions(view)

    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'x', target: 'y' },
    ]
    const nodes = ids.map(makeNode)
    nodes[0].position = { x: 100, y: 100 }
    const laidOut = applyAutoLayout(nodes, edges, view, [], 'LR')

    const x = laidOut.find((n) => n.id === 'x')!
    const y = laidOut.find((n) => n.id === 'y')!
    // Below the frozen bbox (locked a's bottom edge is 100 + 100)...
    expect(Math.min(x.position.y, y.position.y)).toBeGreaterThanOrEqual(200)
    // ...with the component's internal left-to-right structure preserved.
    expect(y.position.x).toBeGreaterThan(x.position.x + 200)
  })

  it('relays out everything when no element is locked', () => {
    const view = makeView(['a', 'b'])
    for (const el of view.elements) { el.x = 500; el.y = 500 }

    clearUnlockedPositions(view)

    const laidOut = applyAutoLayout(
      [makeNode('a'), makeNode('b')],
      [{ id: 'e1', source: 'a', target: 'b' }],
      view,
      [],
    )
    expect(laidOut.map((n) => n.position)).not.toContainEqual({ x: 500, y: 500 })
  })
})
