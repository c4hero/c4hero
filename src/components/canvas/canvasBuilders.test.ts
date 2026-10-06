import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import { buildEdges, buildNodes } from './canvasBuilders'
import { handleSide, handleSlot } from './handleSlots'
import type { HighlightFilters } from '@/lib/highlight'
import { THEMES } from '@/lib/themes'
import { parseDSL } from '@/lib/dsl'
import { buildElementMap } from '@/store/workspace'
import type { ElementStyle, Relationship, RelationshipStyle, View, Workspace } from '@/types/model'

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

/** The model from #230: each relationship sits below the level at least one
 *  of the views shows. */
function issueDsl(containerViewBody = 'include *', extraModel = '', extraViews = ''): string {
  return `
workspace "Container view include *" {
  model {
    user = person "User"
    a = softwareSystem "System A" {
      web = container "Web" {
        ctrl = component "Controller"
      }
      db = container "Database"
    }
    b = softwareSystem "System B" {
      api = container "B API"
    }
    user -> ctrl "Uses"
    web -> db "Reads from"
    web -> api "Calls" "HTTPS" "Critical"
${extraModel}
  }
  views {
    systemContext a "ContextA" {
      include *
    }
    container a "ContainersA" {
      ${containerViewBody}
    }
${extraViews}
    styles {
      relationship "Critical" {
        color #ff0000
      }
    }
  }
}`
}

function parsed(dsl: string): Workspace {
  const { workspace, errors } = parseDSL(dsl)
  expect(errors).toHaveLength(0)
  return workspace
}

function staticView(ws: Workspace, key: string): View {
  return [
    ...ws.views.systemLandscapeViews,
    ...ws.views.systemContextViews,
    ...ws.views.containerViews,
    ...ws.views.componentViews,
  ].find((v) => v.key === key)!
}

/** The view's edges, with every node laid out in a row. */
function viewEdges(ws: Workspace, key: string) {
  const view = staticView(ws, key)
  const nodes: Node[] = view.elements.map((e, i) => ({ id: e.id, position: { x: i * 300, y: 0 }, data: {} }))
  return buildEdges(ws, view, nodes, NO_FILTERS)
}

/** `Source -> Target 'description'` per edge, as drawn. */
function edgeLabels(ws: Workspace, key: string): string[] {
  const names = buildElementMap(ws)
  return viewEdges(ws, key)
    .map((e) => `${names.get(e.source)?.name} -> ${names.get(e.target)?.name} '${(e.data as { relationship: Relationship }).relationship.description ?? ''}'`)
    .sort()
}

describe('buildEdges implied relationships in include * views (#230)', () => {
  it('draws what Structurizr draws in the issue\'s container view', () => {
    const ws = parsed(issueDsl())
    // Main drew Web -> B API only because include * wrongly showed that
    // container; Structurizr shows System B and draws all three.
    expect(edgeLabels(ws, 'ContainersA')).toEqual([
      "User -> Web 'Uses'",
      "Web -> Database 'Reads from'",
      "Web -> System B 'Calls'",
    ])
  })

  it('draws an implied edge with the relationship it comes from', () => {
    const ws = parsed(issueDsl())
    const edges = viewEdges(ws, 'ContainersA')
    const relationshipIds = new Set(ws.model.relationships.map((r) => r.id))
    const calls = ws.model.relationships.find((r) => r.description === 'Calls')!
    const implied = edges.find((e) => e.source === 'web' && e.target === 'b')!
    // Its own edge id, so it never collides with a relationship's edge…
    expect(relationshipIds.has(implied.id)).toBe(false)
    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length)
    // …but the relationship's label, technology and tag style, and selecting
    // it selects that relationship.
    const data = implied.data as { relationship: Relationship; relationshipStyle?: RelationshipStyle; implied?: boolean }
    expect(data.relationship).toBe(calls)
    expect(data.implied).toBe(true)
    expect(data.relationshipStyle?.color).toBe('#ff0000')
    // Dragging its end would move `web -> api`, which it does not show.
    expect(implied.reconnectable).toBe(false)

    const direct = edges.find((e) => e.source === 'web' && e.target === 'db')!
    expect(relationshipIds.has(direct.id)).toBe(true)
    expect((direct.data as { implied?: boolean }).implied).toBeUndefined()
    expect(direct.reconnectable).toBeUndefined()
  })

  it('draws system level relationships in a context view', () => {
    const ws = parsed(issueDsl())
    expect(edgeLabels(ws, 'ContextA')).toEqual([
      "System A -> System B 'Calls'",
      "User -> System A 'Uses'",
    ])
  })

  it('draws relationships to sibling containers and other systems in a component view', () => {
    const ws = parsed(issueDsl('include *', `
    ctrl -> db "Queries"
    ctrl -> api "Fetches"
    db -> api "Replicates"`, `
    component web "ComponentsWeb" {
      include *
    }`))
    expect(edgeLabels(ws, 'ComponentsWeb')).toEqual([
      "Controller -> Database 'Queries'",
      "Controller -> System B 'Fetches'",
      "Database -> System B 'Replicates'",
      "User -> Controller 'Uses'",
    ])
  })

  it('labels a pair with the first relationship that implies it', () => {
    const ws = parsed(issueDsl('include *', `
    web -> api "Calls again"`))
    expect(edgeLabels(ws, 'ContextA')).toContain("System A -> System B 'Calls'")
    expect(edgeLabels(ws, 'ContextA')).not.toContain("System A -> System B 'Calls again'")
  })

  it('implies nothing over an explicit relationship declared before it', () => {
    const ws = parsed(issueDsl().replace('user -> ctrl "Uses"', 'a -> b "Depends on"\n    user -> ctrl "Uses"'))
    expect(edgeLabels(ws, 'ContextA')).toEqual([
      "System A -> System B 'Depends on'",
      "User -> System A 'Uses'",
    ])
  })

  it('leaves a view with its own include list as it was', () => {
    // Structurizr draws User -> Web and Web -> System B here too; views with
    // their own include lists keep drawing only what they list, for now.
    const ws = parsed(issueDsl('include user web db b'))
    expect(edgeLabels(ws, 'ContainersA')).toEqual(["Web -> Database 'Reads from'"])
  })
})
