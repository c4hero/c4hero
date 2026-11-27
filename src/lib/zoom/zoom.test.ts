import { describe, expect, it } from 'vitest'
import { createBigBankSample, createBlankWorkspace } from '@/lib/templates'
import { buildLayout, connectionsFor, geometryKey, spreadApart } from './layout'
import { detailOpacity, flightPath, frameBox, headerScale, OPEN_HEADER, projected, revealFor, stepReveal, stepCamera, stepGlide, summaryOpacity, zoomAt, zoomBounds } from './motion'
import { useWorkspaceStore } from '@/store/workspace'

describe('Zoom geometry and model isolation', () => {
  it('uses displayed root positions on entry even when Zoom has older saved positions', () => {
    const ws = createBigBankSample()
    const view = ws.views.systemLandscapeViews[0]
    const initial = buildLayout(ws, view)
    const snapshot = new Map(initial.roots.map(n => [n.id, { x: n.x + 23, y: n.y - 9, width: n.width, height: 80 }]))
    view.zoomLayout = { direction: 'LR', elements: Object.fromEntries(initial.roots.map(n => [n.id, { x: n.x + 100, y: n.y + 50 }])) }
    const entered = buildLayout(ws, view, snapshot)
    for (const root of entered.roots) {
      expect({ x: root.x, y: root.y, width: root.width, height: root.height }).toEqual(snapshot.get(root.id))
    }
    // Explicit layout edits inside Zoom still take effect.
    const edited = buildLayout(ws, view, snapshot, false)
    expect(edited.roots[0].x).toBe(view.zoomLayout.elements![edited.roots[0].id].x)
  })

  it('automatically chooses a wide, compact child layout while preserving explicit direction', () => {
    const ws = createBigBankSample()
    const system = ws.model.softwareSystems.find(s => s.containers.length > 2)!
    system.containers = system.containers.slice(0, 3)
    system.containers.forEach(c => { c.components = [] })
    ws.model.relationships = system.containers.slice(1).map((c, i) => ({ id: `chain${i}`, sourceId: system.containers[i].id, destinationId: c.id, tags: [], properties: {} }))
    const children = buildLayout(ws).byId.get(system.id)!.children
    expect(children[1].x).toBeGreaterThan(children[0].x)
    expect(children[1].y).toBeCloseTo(children[0].y)
    const automaticWidth = children[0].width
    const view = ws.views.systemLandscapeViews[0]
    view.zoomLayout = { direction: 'TB' }
    const vertical = buildLayout(ws, view).byId.get(system.id)!.children
    expect(vertical[1].y).toBeGreaterThan(vertical[0].y)
    expect(automaticWidth).toBeGreaterThan(vertical[0].width)
  })
  it('is deterministic, nested, non-overlapping and never writes authored geometry', () => {
    const ws = createBigBankSample(), before = JSON.stringify(ws)
    const a = buildLayout(ws), b = buildLayout(ws)
    expect(a.nodes.map(n => [n.id, n.x, n.y, n.width, n.height])).toEqual(b.nodes.map(n => [n.id, n.x, n.y, n.width, n.height]))
    for (const n of a.nodes) {
      if (n.parent) {
        expect(n.x).toBeGreaterThanOrEqual(n.parent.x)
        expect(n.y).toBeGreaterThan(n.parent.y)
        expect(n.x + n.width).toBeLessThanOrEqual(n.parent.x + n.parent.width)
        expect(n.y + n.height).toBeLessThanOrEqual(n.parent.y + n.parent.height)
      }
      const siblings = n.parent?.children ?? a.roots
      for (const other of siblings) if (other !== n) expect(n.x + n.width <= other.x || other.x + other.width <= n.x || n.y + n.height <= other.y || other.y + other.height <= n.y).toBe(true)
    }
    expect(JSON.stringify(ws)).toBe(before)
    const key = geometryKey(ws); ws.model.softwareSystems[0].description = 'Changed property'
    expect(geometryKey(ws)).toBe(key)
  })
  it('handles empty, disconnected and cyclic graphs and ignores deployment endpoints', () => {
    expect(buildLayout(createBlankWorkspace()).nodes).toEqual([])
    const ws = createBigBankSample(), nodes = buildLayout(ws).nodes
    ws.model.relationships.push({ id: 'cycle', sourceId: nodes[1].id, destinationId: nodes[0].id, tags: [], properties: {} }, { id: 'deployment', sourceId: 'missing-instance', destinationId: nodes[0].id, tags: [], properties: {} })
    const map = buildLayout(ws), data = connectionsFor(map, ws.model.relationships)
    expect(data.connections.some(c => c.relationship.id === 'cycle')).toBe(true)
    expect(data.connections.some(c => c.relationship.id === 'deployment')).toBe(false)
  })
  it('honors selected-view exclusions for nested relationships without deleting them from the model', () => {
    const ws = createBigBankSample()
    const map = buildLayout(ws)
    const relationship = ws.model.relationships.find(r => map.byId.get(r.sourceId)?.parent || map.byId.get(r.destinationId)?.parent)!
    expect(relationship).toBeDefined()
    const view = ws.views.systemLandscapeViews[0]
    const visible = connectionsFor(map, ws.model.relationships, view).connections
    expect(visible.some(c => c.relationship.id === relationship.id)).toBe(true)
    const filtered = connectionsFor(map, ws.model.relationships, { ...view, excludedRelationshipIds: [relationship.id] }).connections
    expect(filtered.map(c => c.relationship.id)).toEqual(visible.filter(c => c.relationship.id !== relationship.id).map(c => c.relationship.id))
    expect(ws.model.relationships).toContain(relationship)
  })
  it('bundles direction and async styles separately with all underlying IDs intact', () => {
    const ws = createBigBankSample(), map = buildLayout(ws), [a, b] = map.roots
    const rels = [
      { id: 'a', sourceId: a.id, destinationId: b.id }, { id: 'b', sourceId: a.id, destinationId: b.id },
      { id: 'c', sourceId: b.id, destinationId: a.id }, { id: 'd', sourceId: a.id, destinationId: b.id, interactionStyle: 'Asynchronous' as const },
    ].map(r => ({ ...r, tags: [], properties: {} }))
    const { bundles } = connectionsFor(map, rels)
    expect(bundles).toHaveLength(3)
    expect(bundles.flatMap(b => b.connections.map(c => c.relationship.id)).sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})
describe('Zoom transitions', () => {
  it('integrates inertial pan consistently across frame rates and respects reduced motion', () => {
    const velocity = { x: .8, y: -.3 }
    const whole = stepGlide(velocity, 32)
    const first = stepGlide(velocity, 16), second = stepGlide(first.velocity, 16)
    expect(first.delta.x + second.delta.x).toBeCloseTo(whole.delta.x)
    expect(first.delta.y + second.delta.y).toBeCloseTo(whole.delta.y)
    expect(second.velocity.x).toBeCloseTo(whole.velocity.x)
    expect(stepGlide(velocity, 16, true)).toEqual({ delta: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, moving: false })
    expect(stepGlide(velocity, 2000).moving).toBe(false)
  })
  it('completes either side of midpoint, reverses, and freezes exact partial values', () => {
    expect(stepReveal(.4, .49, true, 16, true)).toBe(0)
    expect(stepReveal(.4, .5, true, 16, true)).toBe(1)
    expect(stepReveal(.4, 1, true, 1000, false, true)).toBe(.4)
    // Within 1% of its target a fade is done; it does not trail on unseen.
    expect(stepReveal(.992, 1, true, 16)).toBe(1)
    expect(stepReveal(.008, 0, true, 16)).toBe(0)
    expect(stepReveal(.9, 1, true, 16)).toBeLessThan(1)
    expect(stepReveal(.7, .1, false, 16)).toBeLessThan(.7)
    const once = stepReveal(.1, .9, false, 32)
    expect(stepReveal(stepReveal(.1, .9, false, 16), .9, false, 16)).toBeCloseTo(once)
  })
  it('reveals parents independently and completes when they dominate the viewport', () => {
    const map = buildLayout(createBigBankSample()), n = map.nodes.find(n => n.children.length)!
    expect(revealFor(n, 1, n.width, n.height)).toBe(1)
    expect(revealFor(n, .001, 1200, 800)).toBe(0)
  })
  it('waits a little longer before starting system and container reveal', () => {
    const map = buildLayout(createBigBankSample())
    for (const [type, before, after] of [['softwareSystem', 335, 350], ['container', 360, 375]] as const) {
      const node = map.nodes.find(n => n.element.type === type && n.children.length)!
      expect(revealFor(node, before / node.width, 10000, 10000)).toBe(0)
      expect(revealFor(node, after / node.width, 10000, 10000)).toBeGreaterThan(0)
    }
  })
  it('keeps the pointer world position fixed and interpolates zoom logarithmically', () => {
    const current = { x: 10, y: 20, zoom: .5 }, screen = { x: 300, y: 200 }, world = { x: 580, y: 360 }
    const target = zoomAt(current, 4, screen)
    const mid = stepCamera(current, target, 50, false, { screen, world })
    expect(mid.x + world.x * mid.zoom).toBeCloseTo(screen.x)
    expect(mid.y + world.y * mid.zoom).toBeCloseTo(screen.y)
    expect(stepCamera(stepCamera(current, target, 25), target, 25).zoom).toBeCloseTo(mid.zoom)
    expect(stepCamera(current, target, 16, true)).toEqual(target)
  })
  it('flies between distant cameras without overshooting the destination', () => {
    const from = { x: 100, y: 50, zoom: .7 }, to = { x: -90000, y: -28000, zoom: 60 }, at = { x: 720, y: 450 }
    const path = flightPath(from, to, at, 1440)
    const world = (c: typeof from) => (at.x - c.x) / c.zoom
    expect(path.at(0).zoom).toBeCloseTo(from.zoom)
    expect(path.at(1)).toEqual(to)
    let previous = world(from)
    for (let t = .05; t < 1; t += .05) {
      const x = world(path.at(t))
      // The centred world point moves steadily toward the target, never past it.
      expect(x).toBeGreaterThanOrEqual(previous - 1e-6)
      expect(x).toBeLessThanOrEqual(world(to) + 1e-6)
      previous = x
    }
    expect(path.duration).toBeGreaterThanOrEqual(320)
    expect(path.duration).toBeLessThanOrEqual(950)
    expect(flightPath(from, from, at, 1440).at(.5)).toEqual(expect.objectContaining({ zoom: from.zoom }))
  })
  it('frames expandable cards large and leaves near their native size', () => {
    const map = buildLayout(createBigBankSample()), area = { x: 0, y: 0, width: 1000, height: 800 }
    const parent = map.nodes.find(n => n.children.length && n.parent)!, leaf = parent.children[0]
    const open = frameBox(parent, area)
    expect(parent.width * open.zoom).toBeCloseTo(700)
    expect((parent.x + parent.width / 2) * open.zoom + open.x).toBeCloseTo(500)
    expect(leaf.scale * frameBox(leaf, area).zoom).toBeLessThanOrEqual(1.6 + 1e-9)
  })
  it('limits zoom to a readable overview and a few times the smallest card', () => {
    const map = buildLayout(createBigBankSample()), smallest = Math.min(...map.nodes.map(n => n.scale))
    expect(zoomBounds(map.nodes, .7)).toEqual({ min: .7 * .4, max: 4 / smallest })
    expect(zoomBounds(map.nodes, 3).min).toBe(.5)
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 100, { x: 0, y: 0 }, { min: .5, max: 4 }).zoom).toBe(4)
  })
  it('fades a parent summary out before its contents fade in', () => {
    expect(summaryOpacity(0)).toBe(1)
    expect(summaryOpacity(.45)).toBe(0)
    expect(detailOpacity(.3)).toBe(0)
    expect(detailOpacity(1)).toBe(1)
    for (let r = 0; r <= 1; r += .05) expect(summaryOpacity(r) * detailOpacity(r)).toBeLessThan(.05)
  })
  it('shrinks an open card title along with its summary fade', () => {
    expect(headerScale(0)).toBe(1)
    expect(headerScale(.45)).toBe(OPEN_HEADER)
    expect(headerScale(1)).toBe(OPEN_HEADER)
  })
  it('projects endpoints continuously from ancestor boundaries', () => {
    const map = buildLayout(createBigBankSample()), n = map.nodes.find(n => n.parent)!, parent = n.parent!
    const closed = projected(n, new Map()), open = projected(n, new Map([[parent.id, 1]])), half = projected(n, new Map([[parent.id, .5]]))
    expect(closed.x).toBe(parent.x)
    expect(open.x).toBe(n.x)
    expect(half.x).toBeCloseTo((closed.x + open.x) / 2)
  })
})
describe('Zoom into a card with many children', () => {
  function dense(count = 27) {
    const ws = createBigBankSample()
    const system = ws.model.softwareSystems.find(s => s.containers.length > 2)!
    const template = system.containers[0]
    system.containers = Array.from({ length: count }, (_, i) => ({ ...template, id: `dense${i}`, name: `Service ${i}`, components: [] }))
    // A fan-out tree: as a graph layout it is many times wider than tall.
    ws.model.relationships = system.containers.slice(1).map((c, i) => ({ id: `tree${i}`, sourceId: `dense${Math.floor(i / 3)}`, destinationId: c.id, tags: [], properties: {} }))
    return { ws, system }
  }
  it('waits to open until it fills most of the screen, while an ordinary card opens at card size', () => {
    const { ws, system } = dense(), area = { x: 0, y: 0, width: 1600, height: 900 }
    const n = buildLayout(ws).byId.get(system.id)!, ordinary = buildLayout(createBigBankSample()).byId.get('internetBanking')!
    const atCardSize = (card: typeof n) => revealFor(card, 460 / card.width, area.width, area.height)
    expect(atCardSize(ordinary)).toBe(1)
    expect(atCardSize(n)).toBe(0)
    expect(revealFor(n, frameBox(n, area).zoom, area.width, area.height)).toBe(1)
  })
})

describe('Authored child positions spaced for narrower cards', () => {
  it('spreads overlapping cards apart evenly, keeping the diagram shape', () => {
    // Laid out for 200-wide cards 258 apart; the middle card measures 280.
    const cards = [{ id: 'a', width: 200, height: 80 }, { id: 'b', width: 280, height: 80 }, { id: 'c', width: 200, height: 80 }, { id: 'd', width: 200, height: 80 }]
    const positions = new Map([['a', { x: 0, y: 0 }], ['b', { x: 258, y: 0 }], ['c', { x: 516, y: 0 }], ['d', { x: 258, y: 300 }]])
    const before = new Map(positions)
    spreadApart(cards, positions)
    const box = (id: string) => { const c = cards.find(c => c.id === id)!, p = positions.get(id)!; return { ...p, right: p.x + c.width, bottom: p.y + c.height } }
    for (const a of cards) for (const b of cards) {
      if (a === b) continue
      const A = box(a.id), B = box(b.id)
      expect(A.right <= B.x || B.right <= A.x || A.bottom <= B.y || B.bottom <= A.y).toBe(true)
    }
    // One uniform factor on the card centres: the shape is unchanged.
    const centre = (map: Map<string, { x: number; y: number }>, id: string) => { const c = cards.find(c => c.id === id)!, p = map.get(id)!; return { x: p.x + c.width / 2, y: p.y + c.height / 2 } }
    const factor = centre(positions, 'c').x / centre(before, 'c').x
    expect(factor).toBeGreaterThan(1)
    for (const { id } of cards) {
      expect(centre(positions, id).x).toBeCloseTo(centre(before, id).x * factor)
      expect(centre(positions, id).y).toBeCloseTo(centre(before, id).y * factor)
    }
  })
  it('leaves an arrangement that already fits untouched', () => {
    const cards = [{ id: 'a', width: 200, height: 80 }, { id: 'b', width: 200, height: 80 }]
    const positions = new Map([['a', { x: 0, y: 0 }], ['b', { x: 260, y: 0 }]])
    spreadApart(cards, positions)
    expect(positions.get('b')).toEqual({ x: 260, y: 0 })
  })
})

describe('Zoom persistence and store integration', () => {
  it('switches modes without changing workspace, views or undo, and keeps Zoom enabled when selecting a view', () => {
    const s = useWorkspaceStore; s.getState().loadWorkspace(createBigBankSample())
    const before = s.getState(), workspace = before.workspace, key = before.activeViewKey, undo = before.undoStack
    s.setState({ multiSelectMode: true, canvasSettingsOpen: true })
    s.getState().setRendererMode('zoom')
    expect(s.getState().multiSelectMode).toBe(false)
    expect(s.getState().canvasSettingsOpen).toBe(false)
    expect(s.getState().workspace).toBe(workspace); expect(s.getState().undoStack).toBe(undo)
    expect(s.getState().activeViewKey).toBe(key)
    s.getState().setActiveView(key!)
    expect(s.getState().rendererMode).toBe('zoom')
    expect(s.getState().workspace).toBe(workspace)
  })
  it('turns Zoom off whenever the active view becomes one it cannot run on', () => {
    const s = useWorkspaceStore; s.getState().loadWorkspace(createBigBankSample())
    const landscape = s.getState().activeViewKey!
    s.getState().setRendererMode('zoom')
    // A new view becomes the active one without going through setActiveView.
    const dynamic = s.getState().addView('dynamic', 'internetBanking', 'Flow')
    expect(s.getState().activeViewKey).toBe(dynamic)
    expect(s.getState().rendererMode).toBe('diagram')
    // The same holds for a state update that names the view directly.
    s.getState().setActiveView(landscape); s.getState().setRendererMode('zoom')
    expect(s.getState().rendererMode).toBe('zoom')
    s.setState({ activeViewKey: dynamic })
    expect(s.getState().rendererMode).toBe('diagram')
  })
})

describe('Zoom shares Diagram layout policy', () => {
  it('preserves authored relative placement and uses Diagram direction for unplaced nodes', () => {
    const ws = createBigBankSample()
    const a = ws.model.people[0], b = ws.model.softwareSystems[0]
    b.containers = []; ws.model.people = [a]; ws.model.softwareSystems = [b]; ws.model.groups = []
    ws.model.relationships = [{ id: 'ab', sourceId: a.id, destinationId: b.id, tags: [], properties: {} }]
    ws.views.systemLandscapeViews = [{ key: 'landscape', type: 'systemLandscape', elements: [{ id: a.id, x: 999, y: 999 }, { id: b.id, x: 99, y: 999 }], relationships: [], autoLayout: { direction: 'LR' } }]
    const key = geometryKey(ws), map = buildLayout(ws), first = map.byId.get(a.id)!, second = map.byId.get(b.id)!
    expect(first.x - second.x).toBe(900)
    expect(second.y).toBe(first.y)
    ws.views.systemLandscapeViews[0].elements[1].x = 199
    expect(geometryKey(ws)).not.toBe(key)
    expect(buildLayout(ws).byId.get(a.id)!.x - buildLayout(ws).byId.get(b.id)!.x).toBe(800)

    ws.views.systemLandscapeViews[0].elements = []
    ws.views.systemLandscapeViews[0].autoLayout!.direction = 'TB'
    const vertical = buildLayout(ws), top = vertical.byId.get(a.id)!, bottom = vertical.byId.get(b.id)!
    expect(bottom.y - top.y - top.height).toBeCloseTo(300, 8)
  })
})


it('keeps populated systems card-sized and scales nested geometry without overlap', () => {
  const ws = createBigBankSample(), populated = buildLayout(ws)
  const original = populated.roots.map(n => [n.id, n.width, n.height])
  for (const system of ws.model.softwareSystems) system.containers = []
  expect(buildLayout(ws).roots.map(n => [n.id, n.width, n.height])).toEqual(original)
  expect(populated.nodes.filter(n => n.parent).every(n => n.scale < n.parent!.scale)).toBe(true)
})

describe('Zoom in authored views', () => {
  it('uses only the selected roots and descendants, preserving authored relative positions', () => {
    const ws = createBigBankSample()
    const system = ws.model.softwareSystems.find(s => s.containers.length)!
    const person = ws.model.people[0]
    const view = { type: 'systemContext' as const, key: 'focused', softwareSystemId: system.id,
      elements: [{ id: system.id, x: 400, y: 200 }, { id: person.id, x: 0, y: 0 }], relationships: [] }
    const before = JSON.stringify(ws)
    const layout = buildLayout(ws, view)
    expect(new Set(layout.roots.map(n => n.id))).toEqual(new Set([system.id, person.id]))
    expect(layout.byId.has(system.containers[0].id)).toBe(true)
    expect(layout.byId.get(system.id)!.x - layout.byId.get(person.id)!.x).toBe(400)
    expect(layout.byId.get(system.id)!.y - layout.byId.get(person.id)!.y).toBe(200)
    expect(JSON.stringify(ws)).toBe(before)
  })

  it('starts container and component views at their own level without adding excluded siblings', () => {
    const ws = createBigBankSample()
    const system = ws.model.softwareSystems.find(s => s.containers.some(c => c.components.length))!
    const container = system.containers.find(c => c.components.length)!
    const containers = buildLayout(ws, { type: 'container', key: 'containers', softwareSystemId: system.id,
      elements: [{ id: system.id }, { id: container.id }], relationships: [] })
    expect(containers.roots.map(n => n.id)).toEqual([container.id])
    expect(containers.byId.has(container.components[0].id)).toBe(true)
    const components = buildLayout(ws, { type: 'component', key: 'components', containerId: container.id,
      elements: [{ id: container.id }, { id: container.components[0].id }], relationships: [] })
    expect(components.nodes.map(n => n.id)).toEqual([container.components[0].id])
  })

  it('keeps an empty authored view empty', () => {
    expect(buildLayout(createBigBankSample(), { type: 'systemLandscape', key: 'empty', elements: [], relationships: [] }).nodes).toEqual([])
  })
})

it('keeps authored overview relationships distinct and excludes hidden descendant aggregation', () => {
  const ws = createBigBankSample(), view = ws.views.systemLandscapeViews[0]
  const layout = buildLayout(ws, view)
  const result = connectionsFor(layout, [...ws.model.relationships, ...ws.model.relationships], view)
  const rootEdges = result.connections.filter(c => !c.from.parent && !c.to.parent)
  expect(new Set(rootEdges.map(c => c.relationship.id))).toEqual(new Set(view.relationships.map(r => r.id)))
  expect(new Set(result.connections.map(c => c.relationship.id)).size).toBe(result.connections.length)
  const empty = connectionsFor(layout, ws.model.relationships, { ...view, relationships: [] })
  expect(empty.connections.filter(c => !c.from.parent && !c.to.parent)).toHaveLength(0)
})
