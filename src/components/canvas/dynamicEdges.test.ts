import { describe, it, expect } from 'vitest'
import type { Node } from '@xyflow/react'
import { parseDSL } from '@/lib/dsl'
import { buildEdges } from './canvasBuilders'

const DYNAMIC_DSL = `
workspace "Ordering" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Web Shop" {
            spa = container "Single-Page App"
            api = container "API"
            db = container "Database"
        }
        customer -> spa "Places order using"
        spa -> api "Submits order to" "JSON/HTTPS"
        api -> db "Persists order in" "SQL"
    }
    views {
        dynamic shop "OrderFlow" "Order flow" {
            customer -> spa "Places an order"
            spa -> api
            api -> db "Persists order in"
        }
    }
}
`

function laidOut(ids: string[]): Node[] {
  return ids.map((id, i) => ({
    id,
    type: 'container',
    position: { x: i * 300, y: 0 },
    measured: { width: 200, height: 100 },
    data: {},
  }))
}

const NO_FILTERS = { tags: [], statuses: [], techs: [], teams: [] }

describe('dynamic view edges', () => {
  it('carries the sequence order label and step description onto each edge', () => {
    const { workspace: ws } = parseDSL(DYNAMIC_DSL)
    const view = ws.views.dynamicViews[0]
    const nodes = laidOut(view.elements.map(e => e.id))

    const edges = buildEdges(ws, view, nodes, NO_FILTERS)
    // One edge per interaction step, in sequence.
    const byId = new Map(view.relationships.map(r => [r.id, r]))
    expect(edges).toHaveLength(view.relationships.length)

    for (const edge of edges) {
      const step = byId.get(edge.id)!
      const data = edge.data as { order?: string; stepDescription?: string }
      expect(data.order).toBe(step.order)
    }

    const orders = edges.map(e => (e.data as { order?: string }).order)
    expect(orders).toEqual(['1', '2', '3'])
  })

  it('passes the per-step description override through edge data', () => {
    const { workspace: ws } = parseDSL(DYNAMIC_DSL)
    const view = ws.views.dynamicViews[0]
    const nodes = laidOut(view.elements.map(e => e.id))

    const edges = buildEdges(ws, view, nodes, NO_FILTERS)
    const step1 = view.relationships[0]
    const edge1 = edges.find(e => e.id === step1.id)!
    expect((edge1.data as { stepDescription?: string }).stepDescription).toBe('Places an order')

    // Step 2 has no override — stepDescription is undefined so the edge falls
    // back to the model relationship's own description.
    const step2 = view.relationships[1]
    const edge2 = edges.find(e => e.id === step2.id)!
    expect((edge2.data as { stepDescription?: string }).stepDescription).toBeUndefined()
  })
})
