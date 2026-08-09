import { render } from '@testing-library/react'
import { ReactFlow, type Edge, type Node } from '@xyflow/react'
import NodeHandles from './NodeHandles'
import { SIDES, SLOTS, handleId, pickSlots, slotOffset } from '../handleSlots'

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
  it('renders 28 source and 28 target handles per node (4 sides x 7 slots)', () => {
    const { container } = renderFlow()
    const n1Handles = container.querySelectorAll('[data-nodeid="n1"].c4-handle')
    expect(n1Handles.length).toBe(56)
    const sources = container.querySelectorAll('[data-nodeid="n1"].source.c4-handle')
    const targets = container.querySelectorAll('[data-nodeid="n1"].target.c4-handle')
    expect(sources.length).toBe(28)
    expect(targets.length).toBe(28)
  })

  it('renders a handle for every slot the router can route to, at the shared offset', () => {
    // Guards the one hazard of splitting slot names across two modules: a slot
    // the router hands out that the renderer never draws.
    const { container } = renderFlow()
    const routable = new Set(pickSlots(SLOTS.length))
    expect(routable).toEqual(new Set(SLOTS))

    for (const side of SIDES) {
      const alongTop = side === 'left' || side === 'right'
      for (const slot of routable) {
        for (const type of ['source', 'target'] as const) {
          const el = handle(container, 'n1', handleId(side, slot, type))
          expect(alongTop ? el.style.top : el.style.left).toBe(slotOffset(slot))
        }
      }
    }
  })

  it('positions the original slots at 25%/50%/75% along the correct axis', () => {
    const { container } = renderFlow()
    // top/bottom sides offset via `left`
    expect(handle(container, 'n1', 'top-a-source').style.left).toBe('25%')
    expect(handle(container, 'n1', 'top-b-source').style.left).toBe('50%')
    expect(handle(container, 'n1', 'bottom-c-source').style.left).toBe('75%')
    // left/right sides offset via `top`
    expect(handle(container, 'n1', 'left-a-source').style.top).toBe('25%')
    expect(handle(container, 'n1', 'right-c-target').style.top).toBe('75%')
    // the slots added either side of them
    expect(handle(container, 'n1', 'top-x1-source').style.left).toBe('12.5%')
    expect(handle(container, 'n1', 'left-x7-target').style.top).toBe('87.5%')
  })

  it('hides non-centre handles and shows centre handles when no edges connect', () => {
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

  it('reveals exactly the slots an edge lands on, both ends', () => {
    const { container } = renderFlow([
      { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'right-x1-source', targetHandle: 'left-c-target' },
    ])
    // n1's right side: the occupied slot shows as a source dot and a drop zone
    const occupiedSource = handle(container, 'n1', 'right-x1-source')
    expect(occupiedSource.className).toContain('c4-handle-extra')
    expect(occupiedSource.className).not.toContain('c4-handle-hidden-extra')
    expect(handle(container, 'n1', 'right-x1-target').className).not.toContain('c4-handle-hidden-extra')
    // ...while the untouched slots on that same side stay hidden
    expect(handle(container, 'n1', 'right-a-source').className).toContain('c4-handle-hidden-extra')
    // n1 top side is untouched entirely
    expect(handle(container, 'n1', 'top-x1-source').className).toContain('c4-handle-hidden-extra')
    // n2's left side is occupied via targetHandle
    expect(handle(container, 'n2', 'left-c-source').className).toContain('c4-handle-extra')
    expect(handle(container, 'n2', 'left-x1-source').className).toContain('c4-handle-hidden-extra')
    // n2 right side unoccupied
    expect(handle(container, 'n2', 'right-c-source').className).toContain('c4-handle-hidden-extra')
  })

  it('shows six separate points when six edges share a side', () => {
    // The GH #108 case — previously slots 4-6 stacked back onto 1-3.
    const slots = pickSlots(6)
    const { container } = renderFlow(
      slots.map((slot, i) => ({
        id: `e${i}`,
        source: 'n1',
        target: 'n2',
        sourceHandle: handleId('right', slot, 'source'),
        targetHandle: 'left-b-target',
      })),
    )

    const offsets = slots.map((slot) => handle(container, 'n1', handleId('right', slot, 'source')).style.top)
    expect(new Set(offsets).size).toBe(6)
    for (const slot of slots) {
      expect(handle(container, 'n1', handleId('right', slot, 'source')).className)
        .not.toContain('c4-handle-hidden-extra')
    }
  })

  it('ignores edges without handle ids and handle ids with unknown sides or slots', () => {
    const { container } = renderFlow([
      // no handles at all — occupies nothing
      { id: 'e1', source: 'n1', target: 'n2' },
      // unknown side prefixes — filtered by the SIDES guard
      { id: 'e2', source: 'n1', target: 'n2', sourceHandle: 'diagonal-a-source', targetHandle: 'weird-b-target' },
      // known side, slot that isn't in the pool
      { id: 'e3', source: 'n1', target: 'n2', sourceHandle: 'top-zzz-source', targetHandle: 'bottom-zzz-target' },
    ])
    for (const side of SIDES) {
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
