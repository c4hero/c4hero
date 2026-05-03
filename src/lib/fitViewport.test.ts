import type { Node, ReactFlowInstance } from '@xyflow/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CANVAS_FIT_CHROME_ATTRIBUTE, fitContentNodesToViewport, fitNodesToViewport, getCanvasFitInsets } from './fitViewport'

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function setElementRect(element: HTMLElement, bounds: DOMRect) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(bounds)
}

function makeNode(id: string, x: number, y: number, width: number, height: number): Node {
  return {
    id,
    position: { x, y },
    data: {},
    measured: { width, height },
  } as Node
}

describe('fitViewport', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('derives fit insets from the top, left, and bottom floating chrome', () => {
    const canvas = rect(0, 0, 1000, 800)
    const top = document.createElement('div')
    const left = document.createElement('div')
    const bottom = document.createElement('div')
    top.setAttribute(CANVAS_FIT_CHROME_ATTRIBUTE, 'top')
    left.setAttribute(CANVAS_FIT_CHROME_ATTRIBUTE, 'left')
    bottom.setAttribute(CANVAS_FIT_CHROME_ATTRIBUTE, 'bottom')
    document.body.append(top, left, bottom)
    setElementRect(top, rect(400, 14, 200, 44))
    setElementRect(left, rect(14, 300, 44, 200))
    setElementRect(bottom, rect(300, 742, 400, 44))

    // top inset uses TOP_CHROME_CLEARANCE (4px); all other sides use the
    // standard 14px clearance. Horizontal mirroring happens at fitNodesToViewport
    // call time (not inside getCanvasFitInsets), so right stays at 0 here.
    expect(getCanvasFitInsets(canvas)).toEqual({
      top: 62,
      right: 0,
      bottom: 72,
      left: 72,
    })
  })

  it('centers fitted nodes inside the chrome-free canvas area', () => {
    const canvas = document.createElement('div')
    canvas.className = 'react-flow'
    document.body.append(canvas)
    setElementRect(canvas, rect(0, 0, 1000, 800))

    const top = document.createElement('div')
    const left = document.createElement('div')
    const bottom = document.createElement('div')
    top.setAttribute(CANVAS_FIT_CHROME_ATTRIBUTE, 'top')
    left.setAttribute(CANVAS_FIT_CHROME_ATTRIBUTE, 'left')
    bottom.setAttribute(CANVAS_FIT_CHROME_ATTRIBUTE, 'bottom')
    document.body.append(top, left, bottom)
    setElementRect(top, rect(400, 14, 200, 44))
    setElementRect(left, rect(14, 300, 44, 200))
    setElementRect(bottom, rect(300, 742, 400, 44))

    const reactFlow = { setViewport: vi.fn() } as unknown as ReactFlowInstance

    fitNodesToViewport(
      reactFlow,
      [makeNode('a', 100, 100, 400, 200)],
      { duration: 0, padding: 0, maxZoom: 10 },
    )

    // With the new inset model: top=62, left=72, right=72 (mirrored from left),
    // bottom=72. Usable area 856×666; 400×200 node bounds fit at zoom 2.14
    // (width-bound). Center of usable area is (500, 395).
    const [viewport, fitOptions] = vi.mocked(reactFlow.setViewport).mock.calls[0]
    expect(viewport.x).toBeCloseTo(-142)
    expect(viewport.y).toBeCloseTo(-33)
    expect(viewport.zoom).toBeCloseTo(2.14)
    expect(fitOptions).toEqual({ duration: 0 })
  })

  it('fits only content nodes, not group or boundary overlays', () => {
    const canvas = document.createElement('div')
    canvas.className = 'react-flow'
    document.body.append(canvas)
    setElementRect(canvas, rect(0, 0, 1000, 800))

    const reactFlow = {
      getNodes: () => [
        makeNode('content', 0, 0, 100, 100),
        makeNode('group-content', 10_000, 10_000, 500, 500),
        makeNode('__scope_boundary__', -10_000, -10_000, 500, 500),
      ],
      setViewport: vi.fn(),
    } as unknown as ReactFlowInstance

    fitContentNodesToViewport(reactFlow, { duration: 0, padding: 0, maxZoom: 10 })

    // No chrome → only the 16px bottom floor applies, leaving 1000×784 usable.
    // Node 100×100 fits at 7.84x (height-bound). Centered → x=108, y=0.
    expect(reactFlow.setViewport).toHaveBeenCalledWith(
      { x: expect.closeTo(108) as unknown as number, y: expect.closeTo(0) as unknown as number, zoom: expect.closeTo(7.84) as unknown as number },
      { duration: 0 },
    )
  })
})
