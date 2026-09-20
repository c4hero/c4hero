import { describe, expect, it } from 'vitest'
import { createBigBankSample, createBlankWorkspace } from '@/lib/templates'
import { buildLayout, connectionsFor, geometryKey } from './layout'
import { projected, revealFor, stepReveal, stepCamera, zoomAt } from './motion'
import { loadExploreCamera, saveExploreCamera } from './persistence'
import { useWorkspaceStore } from '@/store/workspace'

describe('Explore geometry and model isolation', () => {
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
describe('Explore transitions', () => {
  it('completes either side of midpoint, reverses, and freezes exact partial values', () => {
    expect(stepReveal(.4, .49, true, 16, true)).toBe(0)
    expect(stepReveal(.4, .5, true, 16, true)).toBe(1)
    expect(stepReveal(.4, 1, true, 1000, false, true)).toBe(.4)
    expect(stepReveal(.7, .1, false, 16)).toBeLessThan(.7)
    const once = stepReveal(.1, .9, false, 32)
    expect(stepReveal(stepReveal(.1, .9, false, 16), .9, false, 16)).toBeCloseTo(once)
  })
  it('reveals parents independently and completes when they dominate the viewport', () => {
    const map = buildLayout(createBigBankSample()), n = map.nodes.find(n => n.children.length)!
    expect(revealFor(n, 1, n.width, n.height)).toBe(1)
    expect(revealFor(n, .001, 1200, 800)).toBe(0)
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
  it('projects endpoints continuously from ancestor boundaries', () => {
    const map = buildLayout(createBigBankSample()), n = map.nodes.find(n => n.parent)!, parent = n.parent!
    const closed = projected(n, new Map()), open = projected(n, new Map([[parent.id, 1]])), half = projected(n, new Map([[parent.id, .5]]))
    expect(closed.x).toBe(parent.x)
    expect(open.x).toBe(n.x)
    expect(half.x).toBeCloseTo((closed.x + open.x) / 2)
  })
})
describe('Explore persistence and store integration', () => {
  it('isolates cameras by workspace and rejects corrupt values', () => {
    localStorage.clear()
    saveExploreCamera('collection/a', { x: 1, y: 2, zoom: .3 })
    expect(loadExploreCamera('collection/a')).toEqual({ x: 1, y: 2, zoom: .3 })
    expect(loadExploreCamera('collection/b')).toBeNull()
    localStorage.setItem('c4hero.explore.camera.v2:collection/a', '{"x":1,"y":2,"zoom":0}')
    expect(loadExploreCamera('collection/a')).toBeNull()
  })
  it('switches modes without changing workspace, views or undo, and choosing even the same view exits', () => {
    const s = useWorkspaceStore; s.getState().loadWorkspace(createBigBankSample())
    const before = s.getState(), workspace = before.workspace, key = before.activeViewKey, undo = before.undoStack
    s.setState({ multiSelectMode: true, canvasSettingsOpen: true })
    s.getState().setRendererMode('explore')
    expect(s.getState().multiSelectMode).toBe(false)
    expect(s.getState().canvasSettingsOpen).toBe(false)
    expect(s.getState().workspace).toBe(workspace); expect(s.getState().undoStack).toBe(undo)
    expect(s.getState().activeViewKey).toBe(key)
    s.getState().setActiveView(key!)
    expect(s.getState().rendererMode).toBe('diagram')
    expect(s.getState().workspace).toBe(workspace)
  })
})

describe('Explore shares Diagram layout policy', () => {
  it('uses Diagram rank spacing and authored level direction without copying saved positions', () => {
    const ws = createBigBankSample()
    const a = ws.model.people[0], b = ws.model.softwareSystems[0]
    b.containers = []; ws.model.people = [a]; ws.model.softwareSystems = [b]; ws.model.groups = []
    ws.model.relationships = [{ id: 'ab', sourceId: a.id, destinationId: b.id, tags: [], properties: {} }]
    ws.views.systemLandscapeViews = [{ key: 'landscape', type: 'systemLandscape', elements: [{ id: a.id, x: 999, y: 999 }], relationships: [], autoLayout: { direction: 'LR' } }]
    const key = geometryKey(ws), map = buildLayout(ws), first = map.byId.get(a.id)!, second = map.byId.get(b.id)!
    expect(second.x - first.x - first.width).toBe(300)
    expect(second.y).toBe(first.y)
    ws.views.systemLandscapeViews[0].autoLayout!.direction = 'TB'
    expect(geometryKey(ws)).not.toBe(key)
    const vertical = buildLayout(ws)
    expect(vertical.byId.get(b.id)!.y - vertical.byId.get(a.id)!.y - first.height).toBe(300)
  })
})


it('keeps populated systems card-sized and scales nested geometry without overlap', () => {
  const ws = createBigBankSample(), populated = buildLayout(ws)
  const original = populated.roots.map(n => [n.id, n.width, n.height])
  for (const system of ws.model.softwareSystems) system.containers = []
  expect(buildLayout(ws).roots.map(n => [n.id, n.width, n.height])).toEqual(original)
  expect(populated.nodes.filter(n => n.parent).every(n => n.scale < n.parent!.scale)).toBe(true)
})
