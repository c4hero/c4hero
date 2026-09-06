import { useEffect } from 'react'
import { render, waitFor, screen } from '@testing-library/react'
import {
  ReactFlowProvider,
  useReactFlow,
  useStoreApi,
  type ReactFlowInstance,
} from '@xyflow/react'
import { useWorkspaceStore } from '@/store/workspace'
import { useSettingsStore } from '@/store/settings'
import type { Workspace } from '@/types/model'
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

function makeWorkspace(): Workspace {
  return {
    name: 'T',
    model: {
      people: [],
      softwareSystems: [],
      customElements: [
        { id: 'f1', type: 'custom', name: 'Step 1', metadata: 'flow', properties: {}, tags: [], relationships: [] },
        { id: 'f2', type: 'custom', name: 'Step 2', metadata: 'flow', properties: {}, tags: [], relationships: [] },
        { id: 'f3', type: 'custom', name: 'Step 3', metadata: 'flow', properties: {}, tags: [], relationships: [] },
        { id: 'f4', type: 'custom', name: 'Step 4', metadata: 'flow', properties: {}, tags: [], relationships: [] },
        { id: 'f5', type: 'custom', name: 'Step 5', metadata: 'flow', properties: {}, tags: [], relationships: [] },
        { id: 'f6', type: 'custom', name: 'Step 6', metadata: 'flow', properties: {}, tags: [], relationships: [] },
      ],
      relationships: [
        { id: 'r1', sourceId: 'f1', destinationId: 'f2', description: 'Next', tags: [], properties: {} },
        { id: 'r2', sourceId: 'f2', destinationId: 'f3', description: 'Next', tags: [], properties: {} },
        { id: 'r3', sourceId: 'f3', destinationId: 'f4', description: 'Next', tags: [], properties: {} },
        { id: 'r4', sourceId: 'f4', destinationId: 'f5', description: 'Next', tags: [], properties: {} },
        { id: 'r5', sourceId: 'f5', destinationId: 'f6', description: 'Next', tags: [], properties: {} },
      ],
      groups: [],
      deploymentEnvironments: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      dynamicViews: [],
      deploymentViews: [],
      customViews: [
        {
          type: 'custom',
          key: 'custom-view',
          title: 'My Custom View',
          elements: [
            { id: 'f1' }, { id: 'f2' }, { id: 'f3' }, { id: 'f4' }, { id: 'f5' }, { id: 'f6' }
          ],
          relationships: [
            { id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' }, { id: 'r5' }
          ]
        }
      ],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

// ─── Render harness ────────────────────────────────────────────────────

let rf: ReactFlowInstance | null = null
let rfStore: ReturnType<typeof useStoreApi> | null = null

function Harness() {
  const currentRf = useReactFlow()
  const currentRfStore = useStoreApi()
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
  await waitFor(() => {
    expect(rfStore).not.toBeNull()
    expect(rfStore!.getState().panZoom).not.toBeNull()
  })
  return utils
}

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

describe('Custom View Render', () => {
  it('renders 6 stub flow/ elements as 6 nodes and 5 edges', async () => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.getState().setActiveView('custom-view')
    await renderCanvas()
    
    expect(rf!.getNodes().length).toBe(6)
    expect(rf!.getEdges().length).toBe(5)
  })
})
