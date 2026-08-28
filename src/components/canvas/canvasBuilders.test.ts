import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import { buildEdges, buildNodes, type DiffOverlay } from './canvasBuilders'
import { handleSide, handleSlot } from './handleSlots'
import type { HighlightFilters } from '@/lib/highlight'
import { THEMES } from '@/lib/themes'
import type { ElementStyle, Workspace } from '@/types/model'

const NO_FILTERS: HighlightFilters = {
  tags: [],
  statuses: [],
  techs: [],
  teams: [],
}

function workspace(styles: ElementStyle[], tags = ['Element', 'Person']): Workspace {
  return {
    name: 'Theme test',
    model: {
      people: [
        { id: 'user', type: 'person', name: 'User', tags, properties: {} },
      ],
      softwareSystems: [],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [
        {
          type: 'systemLandscape',
          key: 'landscape',
          elements: [{ id: 'user' }],
          relationships: [],
        },
      ],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: styles, relationships: [] } },
    },
  }
}

function personStyle(styles: ElementStyle[]) {
  return styles.find((style) => style.tag === 'Person')!
}

function renderedStyle(styles: ElementStyle[], theme = THEMES.structurizr, tags?: string[]) {
  const ws = workspace(styles, tags)
  const [node] = buildNodes(
    ws,
    ws.views.systemLandscapeViews[0],
    () => {},
    NO_FILTERS,
    new Map(),
    new Set(),
    theme,
  )
  return node.data.style as ElementStyle
}

describe('buildNodes theme styles', () => {
  it('lets the active theme replace legacy built-in styles copied from another app palette', () => {
    const style = renderedStyle([personStyle(THEMES.readability)])
    expect(style.background).toBe(personStyle(THEMES.structurizr).background)
    expect(style.stroke).toBe(personStyle(THEMES.structurizr).stroke)
  })

  it('lets the active theme replace bundled template tag colors', () => {
    const style = renderedStyle([
      { tag: 'Bank Staff', background: '#1e2832', color: '#94a3b8', stroke: '#475569' },
    ], THEMES.light, ['Element', 'Person', 'Bank Staff'])
    expect(style.background).toBe(personStyle(THEMES.light).background)
    expect(style.stroke).toBe(personStyle(THEMES.light).stroke)
  })

  it('preserves non-color fields from bundled template tag styles', () => {
    const style = renderedStyle([
      { tag: 'Database', background: '#1e1a40', color: '#c4b5fd', stroke: '#7c3aed', shape: 'Cylinder' },
    ], THEMES.light, ['Element', 'Person', 'Database'])
    expect(style.background).toBe(personStyle(THEMES.light).background)
    expect(style.shape).toBe('Cylinder')
  })

  it('keeps custom built-in type styles that are not one of the app palettes', () => {
    const customStyle: ElementStyle = { tag: 'Person', background: '#123456', color: '#ffffff', stroke: '#abcdef' }
    const style = renderedStyle([customStyle])
    expect(style.background).toBe('#123456')
    expect(style.stroke).toBe('#abcdef')
  })

  it('keeps custom tag styles above the active theme', () => {
    const vipStyle: ElementStyle = { tag: 'VIP', background: '#441155', color: '#ffeeff', stroke: '#dd77ff' }
    const style = renderedStyle([vipStyle], THEMES.structurizr, ['Element', 'Person', 'VIP'])
    expect(style.background).toBe('#441155')
    expect(style.stroke).toBe('#dd77ff')
  })
})

/** Hub system with `callerCount` systems wired into it from the left, so every
 *  one of those relationships lands on the hub's left side. */
function hubWorkspace(callerCount: number): Workspace {
  const callers = Array.from({ length: callerCount }, (_, i) => `caller${i}`)
  return {
    name: 'Hub test',
    model: {
      people: [],
      softwareSystems: [
        { id: 'hub', type: 'softwareSystem', name: 'Hub', tags: ['Element', 'Software System'], properties: {}, containers: [] },
        ...callers.map((id) => ({
          id, type: 'softwareSystem' as const, name: id, tags: ['Element', 'Software System'], properties: {}, containers: [],
        })),
      ],
      relationships: callers.map((id) => ({
        id: `rel-${id}`, sourceId: id, destinationId: 'hub', tags: ['Relationship'], properties: {},
      })),
      groups: [],
    },
    views: {
      systemLandscapeViews: [
        {
          type: 'systemLandscape',
          key: 'landscape',
          elements: [{ id: 'hub' }, ...callers.map((id) => ({ id }))],
          relationships: callers.map((id) => ({ id: `rel-${id}` })),
        },
      ],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

/** Callers stacked in a column to the left of the hub. */
function hubNodes(callerCount: number): Node[] {
  return [
    { id: 'hub', type: 'softwareSystem', position: { x: 1200, y: 600 }, data: {} },
    ...Array.from({ length: callerCount }, (_, i) => ({
      id: `caller${i}`,
      type: 'softwareSystem',
      position: { x: 0, y: i * 200 },
      data: {},
    })),
  ]
}

function hubEdges(callerCount: number) {
  const ws = hubWorkspace(callerCount)
  return buildEdges(ws, ws.views.systemLandscapeViews[0], hubNodes(callerCount), NO_FILTERS)
}

describe('buildEdges handle routing', () => {
  it('gives six relationships entering one side six distinct handles', () => {
    // GH #108: past three, edges used to stack back onto the same pixels.
    const edges = hubEdges(6)
    expect(edges).toHaveLength(6)

    const targets = edges.map((e) => e.targetHandle)
    expect(new Set(targets).size).toBe(6)
    for (const handle of targets) {
      expect(handleSide(handle!)).toBe('left')
    }
  })

  it('still routes a lone relationship through the centre slot', () => {
    const [edge] = hubEdges(1)
    expect(edge.sourceHandle).toBe('right-b-source')
    expect(edge.targetHandle).toBe('left-b-target')
  })

  it('routes two and three relationships through the slots they always used', () => {
    expect(hubEdges(2).map((e) => e.targetHandle)).toEqual(['left-a-target', 'left-c-target'])
    expect(hubEdges(3).map((e) => e.targetHandle)).toEqual(['left-a-target', 'left-b-target', 'left-c-target'])
  })

  it('only ever names handles the renderer knows how to draw', () => {
    for (const edge of hubEdges(7)) {
      for (const handle of [edge.sourceHandle, edge.targetHandle]) {
        expect(handleSide(handle!)).not.toBeNull()
        expect(handleSlot(handle!)).not.toBeNull()
      }
    }
  })
})

/** Two systems plus the relationship between them, so the overlay has one of
 *  each thing it can tint. */
function diffWorkspace(): Workspace {
  return {
    name: 'Diff test',
    model: {
      people: [],
      softwareSystems: [
        { id: 'a', type: 'softwareSystem', name: 'A', tags: ['Element', 'Software System'], properties: {}, containers: [] },
        { id: 'b', type: 'softwareSystem', name: 'B', tags: ['Element', 'Software System'], properties: {}, containers: [] },
      ],
      relationships: [
        { id: 'rel', sourceId: 'a', destinationId: 'b', tags: ['Relationship'], properties: {} },
      ],
      groups: [],
    },
    views: {
      systemLandscapeViews: [
        {
          type: 'systemLandscape',
          key: 'landscape',
          elements: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 400, y: 0 }],
          relationships: [{ id: 'rel' }],
        },
      ],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

function diffNodes(overlay: DiffOverlay | null) {
  const ws = diffWorkspace()
  return buildNodes(
    ws, ws.views.systemLandscapeViews[0], () => {}, NO_FILTERS, new Map(), new Set(), THEMES.structurizr, overlay,
  )
}

function diffEdges(overlay: DiffOverlay | null) {
  const ws = diffWorkspace()
  const nodes = diffNodes(overlay)
  return buildEdges(ws, ws.views.systemLandscapeViews[0], nodes, NO_FILTERS, overlay)
}

describe('comparison overlay', () => {
  const overlay: DiffOverlay = {
    elements: new Map([['a', 'added' as const]]),
    relationships: new Map([['rel', 'changed' as const]]),
  }

  it('leaves nodes and edges untouched when no comparison is running', () => {
    expect(diffNodes(null).map((n) => n.className)).toEqual([undefined, undefined])
    expect(diffEdges(null)[0].className).toBeUndefined()
    expect(diffNodes(null)[0].data.diffStatus).toBeUndefined()
  })

  it('marks changed nodes and quiets the rest', () => {
    const nodes = diffNodes(overlay)
    expect(nodes[0].className).toBe('c4-node-diff-added')
    expect(nodes[0].data.diffStatus).toBe('added')
    expect(nodes[1].className).toBe('c4-node-diff-same')
    expect(nodes[1].data.diffStatus).toBeUndefined()
  })

  it('marks changed edges and quiets the rest', () => {
    expect(diffEdges(overlay)[0].className).toBe('c4-edge-diff-changed')
    expect(diffEdges(overlay)[0].data!.diffStatus).toBe('changed')
    const untouched = diffEdges({ elements: new Map(), relationships: new Map() })
    expect(untouched[0].className).toBe('c4-edge-diff-same')
  })

  it('composes with the highlighter instead of replacing it', () => {
    const ws = diffWorkspace()
    ws.model.softwareSystems[0].tags.push('Critical')
    const nodes = buildNodes(
      ws, ws.views.systemLandscapeViews[0], () => {},
      { tags: ['Critical'], statuses: [], techs: [], teams: [] },
      new Map(), new Set(), THEMES.structurizr, overlay,
    )
    expect(nodes[0].className).toBe('c4-node-highlighted c4-node-diff-added')
    expect(nodes[1].className).toBe('c4-node-faded c4-node-diff-same')
  })
})
