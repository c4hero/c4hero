import { useEffect } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  ReactFlowProvider,
  useReactFlow,
  useStoreApi,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react'
import { useWorkspaceStore } from '@/store/workspace'
import { useSettingsStore } from '@/store/settings'
import { loadViewport, saveViewport } from '@/lib/viewportStorage'
import type { Workspace } from '@/types/model'
import type { ParseError } from '@/lib/dsl'
import dagre from '@dagrejs/dagre'
import Canvas from './Canvas'

// ─── jsdom stubs required by React Flow (official testing recipe) ─────

class ResizeObserverStub {
  callback: globalThis.ResizeObserverCallback
  constructor(callback: globalThis.ResizeObserverCallback) {
    this.callback = callback
  }
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: target.getBoundingClientRect() } as globalThis.ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }
  unobserve() {}
  disconnect() {}
}

class DOMMatrixReadOnlyStub {
  m22: number
  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1]
    this.m22 = scale !== undefined ? +scale : 1
  }
}

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

beforeAll(() => {
  global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
  // @ts-expect-error jsdom has no DOMMatrixReadOnly
  global.DOMMatrixReadOnly = DOMMatrixReadOnlyStub
  Object.defineProperties(global.HTMLElement.prototype, {
    offsetHeight: { get() { return parseFloat((this as HTMLElement).style.height) || 90 }, configurable: true },
    offsetWidth: { get() { return parseFloat((this as HTMLElement).style.width) || 150 }, configurable: true },
  })
  ;(global.SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox =
    () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect
  // Full-size canvas box so Canvas's fit polling sees a real (>200px) surface.
  Element.prototype.getBoundingClientRect = function () {
    return {
      x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600,
      width: 800, height: 600,
      toJSON: () => {},
    } as DOMRect
  }
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
})

afterAll(() => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
})

// ─── Workspace fixture ─────────────────────────────────────────────────

function makeWorkspace(): Workspace {
  return {
    name: 'T',
    model: {
      people: [
        { id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} },
      ],
      softwareSystems: [
        {
          id: 'sys', type: 'softwareSystem', name: 'Sys', tags: ['Element', 'Software System'], properties: {},
          containers: [
            {
              id: 'c1', type: 'container', name: 'C1', tags: ['Element', 'Container'], properties: {},
              components: [
                { id: 'comp1', type: 'component', name: 'Comp1', tags: ['Element', 'Component'], properties: {} },
              ],
            },
            { id: 'c2', type: 'container', name: 'C2', tags: ['Element', 'Container'], properties: {}, components: [] },
          ],
        },
      ],
      relationships: [
        { id: 'r1', sourceId: 'c1', destinationId: 'c2', description: 'Sends data', tags: [], properties: {} },
        { id: 'r2', sourceId: 'alice', destinationId: 'sys', description: 'Uses', tags: [], properties: {} },
      ],
      groups: [{ id: 'g1', name: 'Team A', elementIds: ['c1', 'c2'] }],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [{
        type: 'systemContext', key: 'ctx', softwareSystemId: 'sys',
        elements: [{ id: 'alice' }, { id: 'sys' }],
        relationships: [{ id: 'r2' }],
      }],
      containerViews: [
        {
          type: 'container', key: 'cont', softwareSystemId: 'sys',
          elements: [{ id: 'c1' }, { id: 'c2' }],
          relationships: [{ id: 'r1' }],
        },
        {
          type: 'container', key: 'cont-empty', softwareSystemId: 'sys',
          elements: [],
          relationships: [],
        },
      ],
      componentViews: [{
        type: 'component', key: 'comp', containerId: 'c1',
        elements: [{ id: 'comp1' }],
        relationships: [],
      }],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

function seed(viewKey = 'cont') {
  useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
  useWorkspaceStore.getState().setActiveView(viewKey)
}

// ─── Render harness ────────────────────────────────────────────────────

let rf: ReactFlowInstance | null = null
let rfStore: ReturnType<typeof useStoreApi> | null = null

function Harness() {
  const currentRf = useReactFlow()
  const currentRfStore = useStoreApi()
  // Assign in an effect, not during render — mutating module-level test
  // handles during render is a side effect the react-hooks/globals rule
  // (correctly) flags; an effect runs after commit instead.
  useEffect(() => {
    rf = currentRf
    rfStore = currentRfStore
  })
  return null
}

async function renderCanvas() {
  const utils = render(
    <div style={{ width: 800, height: 600 }}>
      <ReactFlowProvider>
        <Canvas />
        <Harness />
      </ReactFlowProvider>
    </div>,
  )
  // Wait until React Flow's pan/zoom is initialized (onInit has fired).
  await waitFor(() => {
    expect(rfStore).not.toBeNull()
    expect(rfStore!.getState().panZoom).not.toBeNull()
  })
  return utils
}

const wait = (ms: number) => act(() => new Promise<void>((resolve) => { setTimeout(resolve, ms) }))

const mouseEvent = (type: string) => new MouseEvent(type) as unknown as React.MouseEvent

beforeEach(() => {
  localStorage.clear()
  useWorkspaceStore.getState().closeWorkspace()
  useWorkspaceStore.setState({
    canvasGuideOpen: false,
    multiSelectMode: false,
    focusElementId: null,
  })
  useSettingsStore.setState({
    minimapMode: 'never',
    snapToGrid: false,
    colorTheme: 'readability',
    canvasGuideDismissed: true,
  })
  rf = null
  rfStore = null
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── Tests ─────────────────────────────────────────────────────────────

describe('Canvas rendering', () => {
  it('renders nodes, edges, group and boundary overlays for the active container view', async () => {
    seed('cont')
    await renderCanvas()

    await screen.findByText('C1')
    expect(screen.getByText('C2')).toBeTruthy()
    // Group overlay
    expect(screen.getByText('Team A')).toBeTruthy()
    // Scope boundary node exists
    expect(document.querySelector('.react-flow__node[data-id="__scope_boundary__sys"]')).not.toBeNull()
    // Relationship edge is registered for the view
    expect(rf!.getEdges().map((e) => e.id)).toContain('r1')
    // No empty-state overlay
    expect(screen.queryByText(/Start building your diagram/i)).toBeNull()
  })

  it('canonicalizes the initial auto-layout back into view element positions', async () => {
    seed('cont')
    await renderCanvas()
    await waitFor(() => {
      const view = useWorkspaceStore.getState().workspace!.views.containerViews[0]
      expect(view.elements.every((e) => e.x !== undefined && e.y !== undefined)).toBe(true)
    })
  })

  it('renders a systemContext view with person and system nodes', async () => {
    seed('ctx')
    await renderCanvas()
    await screen.findByText('Alice')
    expect(screen.getByText('Sys')).toBeTruthy()
    expect(rf!.getEdges().map((e) => e.id)).toContain('r2')
  })

  it('keeps edges attached after an element ID rename (TEA-242)', async () => {
    seed('ctx')
    await renderCanvas()
    await screen.findByText('Alice')
    expect(rf!.getEdges().map((e) => e.id)).toContain('r2')

    // An ID rename changes node ids WITHOUT changing the structural signal
    // (same view key, element count, layoutVersion) — the non-structural sync
    // branch must remount the nodes under their new ids or React Flow drops
    // every edge pointing at the renamed element until a full reload.
    act(() => {
      const error = useWorkspaceStore.getState().updateElementId('sys', 'platform')
      expect(error).toBeNull()
    })

    await waitFor(() => {
      const nodeIds = new Set(rf!.getNodes().map((n) => n.id))
      expect(nodeIds.has('platform')).toBe(true)
      expect(nodeIds.has('sys')).toBe(false)
      const edge = rf!.getEdges().find((e) => e.id === 'r2')
      expect(edge).toBeTruthy()
      expect(nodeIds.has(edge!.source)).toBe(true)
      expect(nodeIds.has(edge!.target)).toBe(true)
    })
  })

  it('renders a component view scoped to a container', async () => {
    seed('comp')
    await renderCanvas()
    await screen.findByText('Comp1')
    expect(document.querySelector('.react-flow__node[data-id="__scope_boundary__c1"]')).not.toBeNull()
  })

  it('shows the empty state when no workspace is loaded', async () => {
    await renderCanvas()
    expect(screen.getByText(/Start building your diagram/i)).toBeTruthy()
    expect(screen.getByText(/to add an element/i)).toBeTruthy()
  })

  it('hides the empty state when the view has only a scope boundary', async () => {
    seed('cont-empty')
    await renderCanvas()
    expect(screen.queryByText(/Start building your diagram/i)).toBeNull()
    expect(document.querySelector('.react-flow__node[data-id="__scope_boundary__sys"]')).not.toBeNull()
  })

  it('refreshes node data in place on a non-structural change (rename)', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    act(() => { useWorkspaceStore.getState().updateElement('c1', { name: 'C1 Renamed' }) })
    await screen.findByText('C1 Renamed')
    expect(screen.queryByText(/^C1$/)).toBeNull()
  })

  it('shows the minimap only when minimapMode is not "never"', async () => {
    useSettingsStore.setState({ minimapMode: 'always' })
    seed('cont')
    const { unmount } = await renderCanvas()
    expect(document.querySelector('.react-flow__minimap')).not.toBeNull()
    unmount()

    useSettingsStore.setState({ minimapMode: 'never' })
    seed('cont')
    await renderCanvas()
    expect(document.querySelector('.react-flow__minimap')).toBeNull()
  })

  it('reveals an auto-mode minimap while the viewport moves', async () => {
    useSettingsStore.setState({ minimapMode: 'auto' })
    seed('cont')
    await renderCanvas()
    const minimap = document.querySelector('.react-flow__minimap') as HTMLElement
    expect(minimap).not.toBeNull()
    expect(minimap.style.opacity).toBe('0')
    await act(async () => { rf!.setViewport({ x: 40, y: 40, zoom: 1 }) })
    await waitFor(() => {
      const el = document.querySelector('.react-flow__minimap') as HTMLElement
      expect(el.style.opacity).toBe('1')
    })
  })
})

describe('Canvas guide', () => {
  it('auto-opens the guide once for undismissed users and persists dismissal on close', async () => {
    useSettingsStore.setState({ canvasGuideDismissed: false })
    seed('cont')
    await renderCanvas()
    const dialog = await screen.findByRole('dialog', { name: /canvas guide/i })
    expect(dialog).toBeTruthy()

    fireEvent.click(screen.getByLabelText(/dismiss canvas guide/i))
    expect(useWorkspaceStore.getState().canvasGuideOpen).toBe(false)
    expect(useSettingsStore.getState().canvasGuideDismissed).toBe(true)
    expect(screen.queryByRole('dialog', { name: /canvas guide/i })).toBeNull()
  })

  it('does not auto-open the guide when already dismissed', async () => {
    seed('cont')
    await renderCanvas()
    expect(screen.queryByRole('dialog', { name: /canvas guide/i })).toBeNull()
  })
})

describe('Canvas selection', () => {
  it('selects a single element in the store after the inspector delay', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    act(() => { rfStore!.getState().addSelectedNodes(['c1']) })
    await wait(200)
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual(['c1'])
  })

  it('applies multi-node selection immediately', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    act(() => { rfStore!.getState().addSelectedNodes(['c1', 'c2']) })
    await wait(50)
    // The store's array is frozen (immer autoFreeze) — copy before the in-place .sort().
    expect([...useWorkspaceStore.getState().selectedElementIds].sort()).toEqual(['c1', 'c2'])
  })

  it('selects a group after the delay when only the group node is selected', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('Team A')
    act(() => { rfStore!.getState().addSelectedNodes(['group-g1']) })
    await wait(200)
    expect(useWorkspaceStore.getState().selectedGroupId).toBe('g1')
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual([])
  })

  it('prefers element selection when both a group and elements are selected', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    act(() => { rfStore!.getState().addSelectedNodes(['group-g1', 'c1']) })
    await wait(50)
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual(['c1'])
    expect(useWorkspaceStore.getState().selectedGroupId).toBeNull()
  })

  it('keeps the existing element selection when shift-selecting over a group', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    act(() => { useWorkspaceStore.getState().selectElements(['c1']) })
    fireEvent.keyDown(document.body, { key: 'Shift' })
    act(() => { rfStore!.getState().addSelectedNodes(['group-g1']) })
    await wait(200)
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual(['c1'])
    expect(useWorkspaceStore.getState().selectedGroupId).toBeNull()
    fireEvent.keyUp(document.body, { key: 'Shift' })
  })

  it('selects a relationship when its edge is selected', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    act(() => { rfStore!.getState().addSelectedEdges(['r1']) })
    await wait(50)
    expect(useWorkspaceStore.getState().selectedRelationshipId).toBe('r1')
  })

  it('clears the selection when the pane is clicked', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    act(() => { useWorkspaceStore.getState().selectElements(['c1']) })
    const pane = document.querySelector('.react-flow__pane')!
    fireEvent.click(pane)
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual([])
  })

  it('cancels a pending single-node selection when the pane is clicked within the delay', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    act(() => { rfStore!.getState().addSelectedNodes(['c1']) })
    // Click the pane before the 120ms inspector timer fires
    fireEvent.click(document.querySelector('.react-flow__pane')!)
    await wait(200)
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual([])
  })

  it('reconciles React Flow node selection flags with the store selection', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    act(() => { useWorkspaceStore.getState().selectElements(['c2']) })
    await waitFor(() => {
      expect(rf!.getNode('c2')?.selected).toBe(true)
      expect(rf!.getNode('c1')?.selected).toBeFalsy()
    })
    act(() => { useWorkspaceStore.getState().clearSelection() })
    await waitFor(() => {
      expect(rf!.getNode('c2')?.selected).toBeFalsy()
    })
  })
})

describe('Canvas multi-select mode and clicks', () => {
  it('toggles nodes in and out of the selection when multi-select mode is on', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    act(() => { useWorkspaceStore.getState().setMultiSelectMode(true) })

    const c1 = document.querySelector('.react-flow__node[data-id="c1"]')!
    const c2 = document.querySelector('.react-flow__node[data-id="c2"]')!
    fireEvent.click(c1)
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual(['c1'])
    fireEvent.click(c2)
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual(['c1', 'c2'])
    fireEvent.click(c1)
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual(['c2'])
  })

  it('ignores shift-clicks and overlay nodes in multi-select mode', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    act(() => { useWorkspaceStore.getState().setMultiSelectMode(true) })

    const c1 = document.querySelector('.react-flow__node[data-id="c1"]')!
    fireEvent.click(c1, { shiftKey: true })
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual([])

    const group = document.querySelector('.react-flow__node[data-id="group-g1"]')!
    fireEvent.click(group)
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual([])
  })

  it('zooms into a drillable element on double-click', async () => {
    seed('ctx')
    await renderCanvas()
    await screen.findByText('Sys')
    const sysNode = document.querySelector('.react-flow__node[data-id="sys"]')!
    fireEvent.doubleClick(sysNode)
    await waitFor(() => {
      expect(useWorkspaceStore.getState().activeViewKey).toBe('cont')
    })
  })

  it('ignores double-clicks on group and boundary nodes', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    fireEvent.doubleClick(document.querySelector('.react-flow__node[data-id="group-g1"]')!)
    fireEvent.doubleClick(document.querySelector('.react-flow__node[data-id="__scope_boundary__sys"]')!)
    await wait(50)
    expect(useWorkspaceStore.getState().activeViewKey).toBe('cont')
  })
})

describe('Canvas connect', () => {
  it('adds a relationship on connect, dedupes repeats, and ignores self-connections', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    const before = useWorkspaceStore.getState().workspace!.model.relationships.length
    const onConnect = rfStore!.getState().onConnect!
    act(() => {
      onConnect({ source: 'c2', target: 'c1', sourceHandle: null, targetHandle: null })
      onConnect({ source: 'c2', target: 'c1', sourceHandle: null, targetHandle: null })
      onConnect({ source: 'c1', target: 'c1', sourceHandle: null, targetHandle: null })
    })
    const rels = useWorkspaceStore.getState().workspace!.model.relationships
    expect(rels.length).toBe(before + 1)
    expect(rels.at(-1)).toMatchObject({ sourceId: 'c2', destinationId: 'c1' })
  })
})

describe('Canvas node dragging', () => {
  it('persists an element position on drag stop', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    await wait(80)
    const st = rfStore!.getState()
    const node = rf!.getNode('c1')! as Node
    const start = { ...node.position }

    act(() => { st.onNodeDragStart!(mouseEvent('mousedown'), node, [node]) })
    const moved = { ...node, position: { x: start.x + 30, y: start.y + 20 } } as Node
    act(() => { st.onNodeDrag!(mouseEvent('mousemove'), moved, [moved]) })
    act(() => { st.onNodeDragStop!(mouseEvent('mouseup'), moved, [moved]) })

    const ve = useWorkspaceStore.getState().workspace!.views.containerViews[0].elements.find((e) => e.id === 'c1')!
    expect(ve.x).toBeCloseTo(start.x + 30)
    expect(ve.y).toBeCloseTo(start.y + 20)
  })

  it('drags a group overlay as a unit and persists all member positions', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('Team A')
    await wait(80)
    const st = rfStore!.getState()
    const group = rf!.getNode('group-g1')! as Node
    const c1Start = { ...rf!.getNode('c1')!.position }
    const c2Start = { ...rf!.getNode('c2')!.position }

    act(() => { st.onNodeDragStart!(mouseEvent('mousedown'), group, [group]) })
    const moved = { ...group, position: { x: group.position.x + 40, y: group.position.y + 25 } } as Node
    act(() => { st.onNodeDrag!(mouseEvent('mousemove'), moved, [moved]) })
    act(() => { st.onNodeDragStop!(mouseEvent('mouseup'), moved, [moved]) })

    const elements = useWorkspaceStore.getState().workspace!.views.containerViews[0].elements
    const c1 = elements.find((e) => e.id === 'c1')!
    const c2 = elements.find((e) => e.id === 'c2')!
    expect(c1.x).toBeCloseTo(c1Start.x + 40)
    expect(c1.y).toBeCloseTo(c1Start.y + 25)
    expect(c2.x).toBeCloseTo(c2Start.x + 40)
    expect(c2.y).toBeCloseTo(c2Start.y + 25)
  })

  it('drags a container-view scope boundary and moves its members (and nested groups)', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    await wait(80)
    const st = rfStore!.getState()
    const boundary = rf!.getNode('__scope_boundary__sys')! as Node
    const c1Start = { ...rf!.getNode('c1')!.position }

    act(() => { st.onNodeDragStart!(mouseEvent('mousedown'), boundary, [boundary]) })
    const moved = { ...boundary, position: { x: boundary.position.x - 15, y: boundary.position.y + 35 } } as Node
    act(() => { st.onNodeDrag!(mouseEvent('mousemove'), moved, [moved]) })
    act(() => { st.onNodeDragStop!(mouseEvent('mouseup'), moved, [moved]) })

    const c1 = useWorkspaceStore.getState().workspace!.views.containerViews[0].elements.find((e) => e.id === 'c1')!
    expect(c1.x).toBeCloseTo(c1Start.x - 15)
    expect(c1.y).toBeCloseTo(c1Start.y + 35)
  })

  it('drags a component-view scope boundary and moves the contained components', async () => {
    seed('comp')
    await renderCanvas()
    await screen.findByText('Comp1')
    await wait(80)
    const st = rfStore!.getState()
    const boundary = rf!.getNode('__scope_boundary__c1')! as Node
    const compStart = { ...rf!.getNode('comp1')!.position }

    act(() => { st.onNodeDragStart!(mouseEvent('mousedown'), boundary, [boundary]) })
    const moved = { ...boundary, position: { x: boundary.position.x + 12, y: boundary.position.y + 8 } } as Node
    act(() => { st.onNodeDrag!(mouseEvent('mousemove'), moved, [moved]) })
    act(() => { st.onNodeDragStop!(mouseEvent('mouseup'), moved, [moved]) })

    const comp = useWorkspaceStore.getState().workspace!.views.componentViews[0].elements.find((e) => e.id === 'comp1')!
    expect(comp.x).toBeCloseTo(compStart.x + 12)
    expect(comp.y).toBeCloseTo(compStart.y + 8)
  })

  it('does not persist positions when a boundary drag stops without a drag context', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    await wait(80)
    const st = rfStore!.getState()
    const positionsBefore = useWorkspaceStore.getState().workspace!.views.containerViews[0].elements
      .map((e) => ({ id: e.id, x: e.x, y: e.y }))
    const boundary = rf!.getNode('__scope_boundary__sys')! as Node
    const moved = { ...boundary, position: { x: boundary.position.x + 99, y: boundary.position.y + 99 } } as Node
    act(() => { st.onNodeDragStop!(mouseEvent('mouseup'), moved, [moved]) })
    const positionsAfter = useWorkspaceStore.getState().workspace!.views.containerViews[0].elements
      .map((e) => ({ id: e.id, x: e.x, y: e.y }))
    expect(positionsAfter).toEqual(positionsBefore)
  })

  it('ignores drag start on an unknown group and drag on an overlay without context', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    await wait(80)
    const st = rfStore!.getState()
    const ghost = { id: 'group-ghost', position: { x: 0, y: 0 }, data: {} } as Node
    act(() => { st.onNodeDragStart!(mouseEvent('mousedown'), ghost, [ghost]) })
    const boundary = rf!.getNode('__scope_boundary__sys')! as Node
    act(() => { st.onNodeDrag!(mouseEvent('mousemove'), boundary, [boundary]) })
    // No positions changed and nothing crashed
    expect(useWorkspaceStore.getState().workspace).not.toBeNull()
  })
})

describe('Canvas focus', () => {
  it('centers on a focused element and clears the focus request', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    act(() => { useWorkspaceStore.setState({ focusElementId: 'c1' }) })
    await waitFor(() => {
      expect(useWorkspaceStore.getState().focusElementId).toBeNull()
    }, { timeout: 3000 })
  })

  it('gives up and clears focus when the element never appears', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    act(() => { useWorkspaceStore.setState({ focusElementId: 'ghost' }) })
    await waitFor(() => {
      expect(useWorkspaceStore.getState().focusElementId).toBeNull()
    }, { timeout: 5000 })
  }, 10000)
})

describe('Canvas viewport persistence', () => {
  it('saves the viewport per view when a move ends', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    await act(async () => { rf!.setViewport({ x: 5, y: 7, zoom: 1.25 }) })
    await waitFor(() => {
      expect(loadViewport('T', 'cont')).toMatchObject({ x: 5, y: 7, zoom: 1.25 })
    })
  })

  it('restores a saved viewport when switching to a view that has one', async () => {
    seed('ctx')
    saveViewport('T', 'cont', { x: 111, y: 22, zoom: 0.7 })
    await renderCanvas()
    await screen.findByText('Alice')
    act(() => { useWorkspaceStore.getState().setActiveView('cont') })
    await waitFor(() => {
      const vp = rf!.getViewport()
      expect(vp.x).toBeCloseTo(111)
      expect(vp.y).toBeCloseTo(22)
      expect(vp.zoom).toBeCloseTo(0.7)
    }, { timeout: 3000 })
  })
})

describe('Canvas theme cascade', () => {
  it('cascades light-theme canvas variables to the document root and cleans up on unmount', async () => {
    seed('cont')
    const { unmount } = await renderCanvas()
    const root = document.documentElement
    expect(root.hasAttribute('data-canvas-light')).toBe(false)

    act(() => { useSettingsStore.getState().update({ colorTheme: 'light' }) })
    expect(root.hasAttribute('data-canvas-light')).toBe(true)
    expect(root.style.getPropertyValue('--canvas-bg')).toBe('#f8fafc')

    act(() => { useSettingsStore.getState().update({ colorTheme: 'highContrast' }) })
    expect(root.style.getPropertyValue('--canvas-boundary-border')).toBe('#000000')

    unmount()
    expect(root.hasAttribute('data-canvas-light')).toBe(false)
    expect(root.style.getPropertyValue('--canvas-bg')).toBe('')
  })
})

describe('Canvas keyboard interactions', () => {
  it('tracks space-to-pan key state, ignoring keystrokes in form fields', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')

    // Space in a form field must not enable pan mode
    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { code: 'Space' })

    // Space on the body toggles pan mode on and off without crashing
    fireEvent.keyDown(document.body, { code: 'Space' })
    fireEvent.keyUp(document.body, { code: 'Space' })
    input.remove()
    expect(document.querySelector('.react-flow__pane')).not.toBeNull()
  })

  it('resets shift tracking when the window loses focus', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    fireEvent.keyDown(document.body, { key: 'Shift' })
    fireEvent.blur(window)
    // After blur, a group-only selection with a prior element selection must
    // NOT take the shift branch (shiftKeyDown was reset)
    act(() => { useWorkspaceStore.getState().selectElements(['c1']) })
    act(() => { rfStore!.getState().addSelectedNodes(['group-g1']) })
    await wait(200)
    expect(useWorkspaceStore.getState().selectedGroupId).toBe('g1')
  })
})

describe('Canvas rubber-band selection', () => {
  it('runs the selection gesture lifecycle and applies the resulting selection', async () => {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')

    const pane = document.querySelector('.react-flow__pane')!
    fireEvent.keyDown(document.body, { key: 'Shift' })
    await wait(20)
    fireEvent.pointerDown(pane, { button: 0, isPrimary: true, pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(pane, { isPrimary: true, pointerId: 1, clientX: 300, clientY: 300 })
    // Mid-gesture RF selection updates are deferred until the gesture ends
    act(() => { rfStore!.getState().addSelectedNodes(['c1', 'c2']) })
    fireEvent.pointerUp(pane, { button: 0, isPrimary: true, pointerId: 1, clientX: 300, clientY: 300 })
    fireEvent.keyUp(document.body, { key: 'Shift' })

    await waitFor(() => {
      expect([...useWorkspaceStore.getState().selectedElementIds].sort()).toEqual(['c1', 'c2'])
    })
  })
})

// ─── Layout recompute budget (TEA-80) ──────────────────────────────────
//
// A full dagre run is the most expensive thing the canvas does, and the layout
// memo depends on the whole `workspace` object — which, under immer, is a new
// reference after ANY mutation. What keeps a rename or a drag from re-laying
// out the diagram is a single early return in `applyAutoLayout`: every element
// whose position is already saved is "frozen", and a call where nothing is
// unfrozen returns the nodes untouched without building a graph.
//
// Nothing enforces that. Removing the early return would put a dagre run back
// on every keystroke with no visible symptom in any other test — the extra
// layout is computed and then discarded, so the rendered output is identical
// and only the frame budget suffers.
//
// Skipping the layout is only half the story: the nodes handed back untouched
// also have to still carry their saved positions. On most edits that is free —
// the sync effect merges only data/className/draggable into the mounted nodes
// and never replaces positions. The exception is an element-id change, which
// remounts wholesale from the memo's nodes (Canvas.tsx: "return initialNodes");
// that is the one path where losing positions in the memo — by breaking
// `carryForwardMeasurements`, say — collapses the diagram onto the origin with
// every recompute-count assertion here still green, so it gets its own test.
//
// These count calls into dagre itself rather than calls into applyAutoLayout.
// Counting the wrapper, or inferring "would it have run" from its arguments,
// passes happily with the early return deleted — which is the one regression
// worth catching here.
describe('Canvas layout recompute budget', () => {
  /** Mount, let the first layout settle and its positions be written back,
   *  then hand back a spy watching only what happens next. */
  async function mountThenWatchDagre() {
    seed('cont')
    await renderCanvas()
    await screen.findByText('C1')
    await wait(60)
    return vi.spyOn(dagre, 'layout')
  }

  /** c1 as the store currently holds it, for the "did the edit land?" guards:
   *  a negative assertion alone passes just as happily when the action was a
   *  no-op and nothing ever reached the canvas. */
  const containerC1 = () =>
    useWorkspaceStore.getState().workspace!.model.softwareSystems[0].containers.find(c => c.id === 'c1')!
  const viewElementC1 = () =>
    useWorkspaceStore.getState().workspace!.views.containerViews
      .find(v => v.key === 'cont')!.elements.find(e => e.id === 'c1')!

  afterEach(() => { vi.restoreAllMocks() })

  it('does not re-layout when an element is renamed', async () => {
    const spy = await mountThenWatchDagre()
    await act(async () => { useWorkspaceStore.getState().updateElement('c1', { name: 'C1 renamed' }) })
    await wait(60)
    expect(spy).not.toHaveBeenCalled()
    // The rename still reaches the canvas — this must not pass because
    // nothing happened at all.
    await screen.findByText('C1 renamed')
  })

  it('keeps the laid-out positions when an element id change remounts the nodes', async () => {
    // An id edit is the one edit that replaces the mounted nodes with the
    // memo's, so it is the only place a memo that lost its positions shows up.
    // Without it, zeroing every position in `carryForwardMeasurements` leaves
    // all the recompute-count assertions above green.
    const spy = await mountThenWatchDagre()
    const before = { ...rf!.getNode('c1')!.position }
    expect(before).not.toEqual({ x: 0, y: 0 })
    await act(async () => { useWorkspaceStore.getState().updateElementId('c1', 'c1renamed') })
    await wait(60)
    expect(spy).not.toHaveBeenCalled()
    const moved = rf!.getNode('c1renamed')
    expect(moved).toBeDefined()
    expect(moved!.position).toEqual(before)
  })

  it('does not re-layout when a description changes', async () => {
    const spy = await mountThenWatchDagre()
    await act(async () => { useWorkspaceStore.getState().updateElement('c1', { description: 'Now documented' }) })
    await wait(60)
    expect(spy).not.toHaveBeenCalled()
    expect(containerC1().description).toBe('Now documented')
    // ...and the view still resolves, so the quiet spy means "skipped", not
    // "there was nothing on the canvas to lay out".
    expect(screen.getByText('C1')).toBeTruthy()
  })

  it('does not re-layout when a node drag commits', async () => {
    const spy = await mountThenWatchDagre()
    // Drive the real commit path rather than calling the store action: the
    // budget argument rests on positions landing once, on drag stop.
    const st = rfStore!.getState()
    const node = rf!.getNode('c1')! as Node
    const start = { ...node.position }
    const moved = { ...node, position: { x: start.x + 60, y: start.y + 45 } } as Node
    act(() => { st.onNodeDragStart!(mouseEvent('mousedown'), node, [node]) })
    act(() => { st.onNodeDrag!(mouseEvent('mousemove'), moved, [moved]) })
    act(() => { st.onNodeDragStop!(mouseEvent('mouseup'), moved, [moved]) })
    await wait(60)
    expect(spy).not.toHaveBeenCalled()
    expect(viewElementC1().x).toBeCloseTo(start.x + 60)
    expect(viewElementC1().y).toBeCloseTo(start.y + 45)
    expect(screen.getByText('C1')).toBeTruthy()
  })

  it('does not re-layout when a multi-element drag commits', async () => {
    // The plural commit path (`updateNodePositions`) runs for group and
    // boundary drags and writes every member in one mutation — a different
    // write than the single-node case, and just as able to drop x/y.
    const spy = await mountThenWatchDagre()
    const st = rfStore!.getState()
    const group = rf!.getNode('group-g1')! as Node
    const c1Start = { ...rf!.getNode('c1')!.position }
    const moved = { ...group, position: { x: group.position.x + 35, y: group.position.y + 15 } } as Node
    act(() => { st.onNodeDragStart!(mouseEvent('mousedown'), group, [group]) })
    act(() => { st.onNodeDrag!(mouseEvent('mousemove'), moved, [moved]) })
    act(() => { st.onNodeDragStop!(mouseEvent('mouseup'), moved, [moved]) })
    await wait(60)
    expect(spy).not.toHaveBeenCalled()
    expect(viewElementC1().x).toBeCloseTo(c1Start.x + 35)
    expect(viewElementC1().y).toBeCloseTo(c1Start.y + 15)
  })

  it('does not re-layout when the workspace is rebuilt from edited DSL', async () => {
    // Every keystroke in the code pane re-parses and replaces the whole
    // workspace. Positions live in the sidecar rather than the DSL, so this is
    // the path most likely to lose them and silently reintroduce the cost.
    const spy = await mountThenWatchDagre()
    const dsl = (n: number) => `workspace "T" {
  model {
    alice = person "Alice"
    sys = softwareSystem "Sys" {
      c1 = container "C1"
      c2 = container "C2"
    }
    c1 -> c2 "Sends data ${n}"
    alice -> sys "Uses"
  }
  views {
    container sys "cont" {
      include *
    }
  }
}`
    for (let i = 0; i < 3; i++) {
      // replaceWorkspaceFromDSL returns { ok: false } and leaves the store
      // completely untouched on a parse error or an integrity violation. Assert
      // it, or a fixture that stops parsing turns this into a green no-op test.
      let ok = false
      let errors: ParseError[] = []
      await act(async () => {
        ({ ok, errors } = useWorkspaceStore.getState().replaceWorkspaceFromDSL(dsl(i)))
      })
      expect(errors).toEqual([])
      expect(ok).toBe(true)
      await wait(40)
    }
    expect(spy).not.toHaveBeenCalled()
    // ...and the last edit really is what the canvas is now showing. This is
    // the one path that reassigns activeViewKey, so pin that the view still
    // resolves: an unresolved view renders no nodes and never calls dagre.
    expect(useWorkspaceStore.getState().workspace!.model.relationships
      .map(r => r.description)).toContain('Sends data 2')
    expect(rf!.getNodes().some(n => n.id === 'c1')).toBe(true)
  })

  it('does re-layout when an element is added', async () => {
    const spy = await mountThenWatchDagre()
    await act(async () => { useWorkspaceStore.getState().addContainer('sys', 'C3') })
    await wait(60)
    expect(spy).toHaveBeenCalled()
  })

  it('does re-layout on reset & relayout', async () => {
    const spy = await mountThenWatchDagre()
    await act(async () => { useWorkspaceStore.getState().resetAndRelayout('cont') })
    await wait(60)
    expect(spy).toHaveBeenCalled()
  })
})
