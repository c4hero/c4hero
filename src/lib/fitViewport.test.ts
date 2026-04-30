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

    expect(getCanvasFitInsets(canvas)).toEqual({
      top: 72,
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

    const [viewport, fitOptions] = vi.mocked(reactFlow.setViewport).mock.calls[0]
    expect(viewport.x).toBeCloseTo(-160)
    expect(viewport.y).toBeCloseTo(-64)
    expect(viewport.zoom).toBeCloseTo(2.32)
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

    expect(reactFlow.setViewport).toHaveBeenCalledWith(
      { x: 100, y: 0, zoom: 8 },
      { duration: 0 },
    )
  })
})
