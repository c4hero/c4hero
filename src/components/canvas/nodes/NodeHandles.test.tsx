import { render } from '@testing-library/react'
import { ReactFlow, type Edge, type Node } from '@xyflow/react'
import NodeHandles from './NodeHandles'

// ─── jsdom stubs required by React Flow (official testing recipe) ─────
class ResizeObserverStub {
  callback: globalThis.ResizeObserverCallback
  constructor(callback: globalThis.ResizeObserverCallback) {
    this.callback = callback
  }
  observe(target: Element) {
    this.callback([{ target } as globalThis.ResizeObserverEntry], this as unknown as ResizeObserver)
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

beforeAll(() => {
  global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
  // @ts-expect-error jsdom has no DOMMatrixReadOnly
  global.DOMMatrixReadOnly = DOMMatrixReadOnlyStub
  Object.defineProperties(global.HTMLElement.prototype, {
    offsetHeight: { get() { return parseFloat((this as HTMLElement).style.height) || 1 }, configurable: true },
    offsetWidth: { get() { return parseFloat((this as HTMLElement).style.width) || 1 }, configurable: true },
  })
  ;(global.SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox =
    () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect
})

// ─── Test harness ──────────────────────────────────────────────────────

function TestNode() {
  return (
    <div style={{ width: 100, height: 60 }}>
      <NodeHandles />
    </div>
  )
}

const nodeTypes = { test: TestNode }

const nodes: Node[] = [
  { id: 'n1', type: 'test', position: { x: 0, y: 0 }, data: {} },
  { id: 'n2', type: 'test', position: { x: 300, y: 0 }, data: {} },
]

function renderFlow(edges: Edge[] = []) {
  return render(
    <div style={{ width: 800, height: 600 }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} />
    </div>,
  )
}

function handle(container: HTMLElement, nodeId: string, handleId: string): HTMLElement {
  const el = container.querySelector(`[data-nodeid="${nodeId}"][data-handleid="${handleId}"]`)
  expect(el).not.toBeNull()
  return el as HTMLElement
}

describe('NodeHandles', () => {
  it('renders 12 source and 12 target handles per node (4 sides x 3 slots)', () => {
    const { container } = renderFlow()
    const n1Handles = container.querySelectorAll('[data-nodeid="n1"].c4-handle')
    expect(n1Handles.length).toBe(24)
    const sources = container.querySelectorAll('[data-nodeid="n1"].source.c4-handle')
    const targets = container.querySelectorAll('[data-nodeid="n1"].target.c4-handle')
    expect(sources.length).toBe(12)
    expect(targets.length).toBe(12)
  })

  it('positions slots at 25%/50%/75% along the correct axis', () => {
    const { container } = renderFlow()
    // top/bottom sides offset via `left`
    expect(handle(container, 'n1', 'top-a-source').style.left).toBe('25%')
    expect(handle(container, 'n1', 'top-b-source').style.left).toBe('50%')
    expect(handle(container, 'n1', 'bottom-c-source').style.left).toBe('75%')
    // left/right sides offset via `top`
    expect(handle(container, 'n1', 'left-a-source').style.top).toBe('25%')
    expect(handle(container, 'n1', 'right-c-target').style.top).toBe('75%')
  })

  it('hides side (a/c) handles and shows center (b) handles when no edges connect', () => {
    const { container } = renderFlow()
    // Center source handle: visible, never hidden
    const centerSource = handle(container, 'n1', 'top-b-source')
    expect(centerSource.className).toContain('c4-handle-visible')
    expect(centerSource.className).not.toContain('c4-handle-hidden-extra')
    // Side source handle: hidden when the side has no connections
    const sideSource = handle(container, 'n1', 'top-a-source')
    expect(sideSource.className).toContain('c4-handle-hidden-extra')
    // Center target handle: no hidden class
    const centerTarget = handle(container, 'n1', 'left-b-target')
    expect(centerTarget.className).toContain('c4-handle-target')
    expect(centerTarget.className).not.toContain('c4-handle-hidden-extra')
    // Side target handle: hidden
    const sideTarget = handle(container, 'n1', 'left-c-target')
    expect(sideTarget.className).toContain('c4-handle-hidden-extra')
  })

  it('reveals extra handles on sides occupied by a source connection', () => {
    const { container } = renderFlow([
      { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'right-a-source', targetHandle: 'left-b-target' },
    ])
    // n1 right side occupied via sourceHandle
    const occupiedSource = handle(container, 'n1', 'right-c-source')
    expect(occupiedSource.className).toContain('c4-handle-extra')
    expect(occupiedSource.className).not.toContain('c4-handle-hidden-extra')
    const occupiedTarget = handle(container, 'n1', 'right-a-target')
    expect(occupiedTarget.className).not.toContain('c4-handle-hidden-extra')
    // n1 top side remains unoccupied
    expect(handle(container, 'n1', 'top-a-source').className).toContain('c4-handle-hidden-extra')
    // n2 left side occupied via targetHandle
    const n2Left = handle(container, 'n2', 'left-a-source')
    expect(n2Left.className).toContain('c4-handle-extra')
    // n2 right side unoccupied
    expect(handle(container, 'n2', 'right-a-source').className).toContain('c4-handle-hidden-extra')
  })

  it('ignores edges without handle ids and handle ids with unknown sides', () => {
    const { container } = renderFlow([
      // no handles at all — occupies nothing
      { id: 'e1', source: 'n1', target: 'n2' },
      // unknown side prefixes — filtered by the SIDES guard
      { id: 'e2', source: 'n1', target: 'n2', sourceHandle: 'diagonal-a-source', targetHandle: 'weird-b-target' },
    ])
    for (const side of ['top', 'bottom', 'left', 'right']) {
      expect(handle(container, 'n1', `${side}-a-source`).className).toContain('c4-handle-hidden-extra')
      expect(handle(container, 'n2', `${side}-a-source`).className).toContain('c4-handle-hidden-extra')
    }
  })

  it('marks target handles as not connectable-start and source center handles connectable', () => {
    const { container } = renderFlow()
    const target = handle(container, 'n1', 'bottom-b-target')
    expect(target.classList.contains('connectablestart')).toBe(false)
    const source = handle(container, 'n1', 'bottom-b-source')
    expect(source.classList.contains('connectablestart')).toBe(true)
  })
})
