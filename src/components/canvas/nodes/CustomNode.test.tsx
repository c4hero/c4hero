import { render, screen } from '@testing-library/react'
import { ReactFlow } from '@xyflow/react'
import CustomNode from './CustomNode'
import type { C4NodeData } from './types'
import type { CustomElement } from '@/types/model'

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

describe('CustomNode', () => {
  it('renders name and metadata badge', () => {
    const el: CustomElement = {
      id: 'custom-1',
      type: 'custom',
      name: 'My Custom Thing',
      metadata: 'SpecialData',
      tags: [],
      properties: { 'key': 'value' },
      relationships: [],
    }
    const nodeData: C4NodeData = { element: el }

    const utils = render(
      <div style={{ width: 800, height: 600 }}>
        <ReactFlow
          nodes={[{
            id: el.id,
            type: 'custom',
            position: { x: 0, y: 0 },
            data: nodeData as unknown as Record<string, unknown>,
          }]}
          nodeTypes={{ custom: CustomNode }}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          minZoom={0.1}
        />
      </div>,
    )

    const node = utils.container.querySelector('.c4-node') as HTMLElement
    expect(node).not.toBeNull()
    expect(screen.getByText('My Custom Thing')).toBeTruthy()
    expect(screen.getByText('SpecialData')).toBeTruthy()
  })

  it('renders default Custom badge when metadata is absent', () => {
    const el: CustomElement = {
      id: 'custom-1',
      type: 'custom',
      name: 'Another Custom',
      tags: [],
      properties: {},
      relationships: [],
    }
    const nodeData: C4NodeData = { element: el }

    const utils = render(
      <div style={{ width: 800, height: 600 }}>
        <ReactFlow
          nodes={[{
            id: el.id,
            type: 'custom',
            position: { x: 0, y: 0 },
            data: nodeData as unknown as Record<string, unknown>,
          }]}
          nodeTypes={{ custom: CustomNode }}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          minZoom={0.1}
        />
      </div>,
    )

    const node = utils.container.querySelector('.c4-node') as HTMLElement
    expect(node).not.toBeNull()
    expect(screen.getByText('Another Custom')).toBeTruthy()
    expect(screen.getByText('Custom')).toBeTruthy()
  })
})
