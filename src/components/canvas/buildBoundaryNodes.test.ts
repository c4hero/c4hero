import { describe, it, expect } from 'vitest'
import type { Node } from '@xyflow/react'
import type { Workspace, View } from '@/types/model'
import { buildBoundaryNodes } from './canvasBuilders'

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
    name: 'T',
    model: {
      people: [],
      softwareSystems: [
        {
          id: 'sysA', type: 'softwareSystem', name: 'System A', tags: [], properties: {},
          containers: [
            { id: 'a1', type: 'container', name: 'A1', tags: [], properties: {}, components: [] },
            { id: 'a2', type: 'container', name: 'A2', tags: [], properties: {}, components: [] },
          ],
        },
        {
          id: 'sysB', type: 'softwareSystem', name: 'System B', tags: [], properties: {},
          containers: [
            { id: 'b1', type: 'container', name: 'B1', tags: [], properties: {}, components: [] },
          ],
        },
      ],
      relationships: [], groups: [],
    },
    views: {
      systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

describe('buildBoundaryNodes', () => {
  it('draws one boundary per system whose containers appear in a Container view', () => {
    const view: View = {
      type: 'container', key: 'cont', softwareSystemId: 'sysA',
      elements: [{ id: 'a1' }, { id: 'a2' }, { id: 'b1' }], relationships: [],
    }
    const laidOut = [el('a1', 0, 0), el('a2', 250, 0), el('b1', 600, 0)]
    const result = buildBoundaryNodes(ws(), view, laidOut)
    expect(result).toHaveLength(2)
    const names = result.map(n => (n.data as { name: string }).name).sort()
    expect(names).toEqual(['System A', 'System B'])
  })

  it('draws an empty focal boundary when the Container view has zero containers in it yet', () => {
    const view: View = {
      type: 'container', key: 'cont', softwareSystemId: 'sysA',
      elements: [], relationships: [],
    }
    const result = buildBoundaryNodes(ws(), view, [])
    expect(result).toHaveLength(1)
    const b = result[0]
    expect((b.data as { name: string }).name).toBe('System A')
    // Default placement at origin so newly-added containers land inside it
    expect(b.position).toEqual({ x: 0, y: 0 })
    expect(b.style?.width).toBeGreaterThan(0)
  })

  it('does NOT double-emit the focal boundary when it already has containers', () => {
    const view: View = {
      type: 'container', key: 'cont', softwareSystemId: 'sysA',
      elements: [{ id: 'a1' }], relationships: [],
    }
    const laidOut = [el('a1', 0, 0)]
    const result = buildBoundaryNodes(ws(), view, laidOut)
    expect(result).toHaveLength(1)
    expect((result[0].data as { name: string }).name).toBe('System A')
    // Sized to the container, not the empty default
    expect(result[0].style?.width).not.toBe(400)
  })

  it('emits no boundaries on a Landscape view (no scope concept)', () => {
    const view: View = {
      type: 'systemLandscape', key: 'land',
      elements: [{ id: 'sysA' }, { id: 'sysB' }], relationships: [],
    }
    const laidOut = [el('sysA', 0, 0), el('sysB', 250, 0)]
    expect(buildBoundaryNodes(ws(), view, laidOut)).toEqual([])
  })

  it('draws an empty focal boundary for a fresh Component view', () => {
    // Add one container with components to the model so we have a focal
    const w = ws()
    w.model.softwareSystems[0].containers[0].components = [
      { id: 'cmp1', type: 'component', name: 'Cmp1', tags: [], properties: {} },
    ]
    const view: View = {
      type: 'component', key: 'comp', containerId: 'a1',
      elements: [], relationships: [],
    }
    const result = buildBoundaryNodes(w, view, [])
    expect(result).toHaveLength(1)
    expect((result[0].data as { name: string }).name).toBe('A1')
    expect((result[0].data as { typeLabel: string }).typeLabel).toBe('Container')
  })

  it('uses the prefix __scope_boundary__ for boundary node IDs', () => {
    // The Canvas filters on this prefix to skip boundaries during layout +
    // selection. If the prefix changes here, those filters need to update too.
    const view: View = {
      type: 'container', key: 'cont', softwareSystemId: 'sysA',
      elements: [{ id: 'a1' }], relationships: [],
    }
    const result = buildBoundaryNodes(ws(), view, [el('a1', 0, 0)])
    for (const node of result) {
      expect(node.id.startsWith('__scope_boundary__')).toBe(true)
    }
  })
})
