import { describe, expect, it, vi } from 'vitest'
import { parseDSL } from '@/lib/dsl'
import * as canvasLayout from '@/lib/canvasLayout'
import { buildLayout } from './layout'

vi.mock('@/lib/canvasLayout', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/canvasLayout')>()
  return { ...actual, applyAutoLayout: vi.fn(actual.applyAutoLayout) }
})

const dsl = `workspace "Cache" {
  model {
    a = softwareSystem "Alpha" {
      a1 = container "A one" { a1x = component "X"
        a1y = component "Y" }
      a2 = container "A two"
    }
    b = softwareSystem "Beta" {
      b1 = container "B one"
      b2 = container "B two"
    }
    a1 -> a2 "calls"
    b1 -> b2 "calls"
  }
  views { systemLandscape "Landscape" { include * } }
}`

describe('nested auto-layout is reused across rebuilds', () => {
  it('re-arranges only the card whose contents changed size', () => {
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const view = workspace.views.systemLandscapeViews[0]
    const arrange = vi.mocked(canvasLayout.applyAutoLayout)
    const boxes = (layout: ReturnType<typeof buildLayout>) => layout.nodes.map(n => [n.id, n.x, n.y, n.width, n.height])

    const first = buildLayout(workspace, view)
    expect(arrange).toHaveBeenCalled()

    // The same inputs: nothing is arranged again, and the result is identical.
    arrange.mockClear()
    expect(boxes(buildLayout(workspace, view))).toEqual(boxes(first))
    expect(arrange).not.toHaveBeenCalled()

    // One revealed component reports its measured size, as happens while
    // zooming in. Only the container that holds it is arranged again.
    arrange.mockClear()
    const measured = buildLayout(workspace, view, undefined, true, new Map([['a1x', { width: 301, height: 143, headerHeight: 60 }]]))
    const arranged = arrange.mock.calls.map(call => call[0].map(node => node.id).sort().join())
    expect(new Set(arranged)).toEqual(new Set(['a1x,a1y']))
    expect(measured.byId.get('a1x')!.width / measured.byId.get('a1x')!.scale).toBeCloseTo(301)
  })
})
