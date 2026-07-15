import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from './index'

const BASE_DSL = `
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
        api -> db "Reads catalog from" "SQL"
    }
    views {
        dynamic shop "OrderFlow" "How an order flows through the shop" {
            customer -> spa "Places an order"
            spa -> api
            api -> db "Persists order in"
            autoLayout lr
        }
    }
}
`

describe('dynamic view parsing', () => {
  it('parses interaction steps in order with sequence labels', () => {
    const { workspace: ws, errors } = parseDSL(BASE_DSL)
    expect(errors).toHaveLength(0)
    expect(ws.views.dynamicViews).toHaveLength(1)

    const view = ws.views.dynamicViews[0]
    expect(view.type).toBe('dynamic')
    expect(view.key).toBe('OrderFlow')
    expect(view.description).toBe('How an order flows through the shop')
    expect(view.softwareSystemId).toBe(ws.model.softwareSystems[0].id)
    expect(view.autoLayout?.direction).toBe('LR')

    expect(view.relationships).toHaveLength(3)
    expect(view.relationships.map(r => r.order)).toEqual(['1', '2', '3'])

    // Steps reference the actual model relationships
    const relById = new Map(ws.model.relationships.map(r => [r.id, r]))
    const step1 = relById.get(view.relationships[0].id)!
    expect(step1.sourceId).toBe(ws.model.people[0].id)

    // Step 1 carries a description override; step 2 falls back to the model's
    expect(view.relationships[0].description).toBe('Places an order')
    expect(view.relationships[1].description).toBeUndefined()
  })

  it('derives view elements from step endpoints (deduplicated)', () => {
    const { workspace: ws } = parseDSL(BASE_DSL)
    const view = ws.views.dynamicViews[0]
    const sys = ws.model.softwareSystems[0]
    const ids = view.elements.map(e => e.id)
    expect(ids).toHaveLength(4)
    expect(ids).toEqual(expect.arrayContaining([
      ws.model.people[0].id,
      sys.containers[0].id,
      sys.containers[1].id,
      sys.containers[2].id,
    ]))
  })

  it('disambiguates parallel relationships between the same pair by description', () => {
    const { workspace: ws } = parseDSL(BASE_DSL)
    const view = ws.views.dynamicViews[0]
    const persistRel = ws.model.relationships.find(r => r.description === 'Persists order in')!
    expect(view.relationships[2].id).toBe(persistRel.id)
  })

  it('records an error and skips steps whose relationship is not in the model', () => {
    const dsl = `workspace {
      model {
        a = softwareSystem "A"
        b = softwareSystem "B"
        a -> b "calls"
      }
      views {
        dynamic * "Flow" {
          a -> b
          b -> a "no such relationship"
        }
      }
    }`
    const { workspace: ws, errors } = parseDSL(dsl)
    expect(errors.some(e => e.message.includes('does not exist in the model'))).toBe(true)
    const view = ws.views.dynamicViews[0]
    expect(view.relationships).toHaveLength(1)
    expect(view.relationships[0].order).toBe('1')
  })

  it('flattens parallel-sequence brace groups, numbering continuing through', () => {
    const dsl = `workspace {
      model {
        a = softwareSystem "A"
        b = softwareSystem "B"
        c = softwareSystem "C"
        a -> b "one"
        b -> c "two"
        c -> a "three"
      }
      views {
        dynamic * "Flow" {
          a -> b
          {
            b -> c
          }
          c -> a
        }
      }
    }`
    const { workspace: ws, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = ws.views.dynamicViews[0]
    expect(view.relationships.map(r => r.order)).toEqual(['1', '2', '3'])
    expect(view.elements).toHaveLength(3)
  })

  it('supports container-scoped and unscoped dynamic views', () => {
    const dsl = `workspace {
      model {
        sys = softwareSystem "Sys" {
          web = container "Web" {
            ctrl = component "Controller"
            svc = component "Service"
          }
        }
        ctrl -> svc "delegates to"
      }
      views {
        dynamic web "InsideWeb" {
          ctrl -> svc
        }
        dynamic * "Everything" {
          ctrl -> svc
        }
      }
    }`
    const { workspace: ws, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)

    const scoped = ws.views.dynamicViews[0]
    expect(scoped.containerId).toBe(ws.model.softwareSystems[0].containers[0].id)
    expect(scoped.softwareSystemId).toBeUndefined()

    const unscoped = ws.views.dynamicViews[1]
    expect(unscoped.containerId).toBeUndefined()
    expect(unscoped.softwareSystemId).toBeUndefined()
  })

  it('generates a stable key when the DSL omits one', () => {
    const dsl = `workspace {
      model {
        a = softwareSystem "A"
        b = softwareSystem "B"
        a -> b "calls"
      }
      views {
        dynamic a {
          a -> b
        }
      }
    }`
    const { workspace: ws } = parseDSL(dsl)
    const view = ws.views.dynamicViews[0]
    expect(view.key).toBe('Dynamic-a')
    expect(view.autoKey).toBe(true)
  })
})

describe('dynamic view round-trip (serialize → parse)', () => {
  it('preserves step order, descriptions, and scope through serialize → parse', () => {
    const { workspace: first } = parseDSL(BASE_DSL)
    const dsl = serializeDSL(first)
    const { workspace: second, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)

    const v1 = first.views.dynamicViews[0]
    const v2 = second.views.dynamicViews[0]
    expect(v2.key).toBe(v1.key)
    expect(v2.description).toBe(v1.description)
    expect(v2.softwareSystemId).toBe(second.model.softwareSystems[0].id)
    expect(v2.autoLayout?.direction).toBe('LR')

    expect(v2.relationships).toHaveLength(3)
    expect(v2.relationships.map(r => r.order)).toEqual(['1', '2', '3'])

    // Step endpoints line up pairwise with the original
    const rel1 = new Map(first.model.relationships.map(r => [r.id, r]))
    const rel2 = new Map(second.model.relationships.map(r => [r.id, r]))
    const endpoints = (v: typeof v1, rels: typeof rel1) =>
      v.relationships.map(s => {
        const r = rels.get(s.id)!
        return `${r.sourceId}->${r.destinationId}`
      })
    expect(endpoints(v2, rel2)).toEqual(endpoints(v1, rel1))

    // The description override survives; the fallback step keeps the model description
    expect(v2.relationships[0].description).toBe('Places an order')
    const step2Model = rel2.get(v2.relationships[1].id)!
    expect(step2Model.description).toBe('Submits order to')
  })

  it('emits interaction steps, not include lines, for dynamic views', () => {
    const { workspace: first } = parseDSL(BASE_DSL)
    const dsl = serializeDSL(first)
    const dynamicBlock = dsl.slice(dsl.indexOf('dynamic '))
    expect(dynamicBlock).toContain('customer -> spa "Places an order"')
    expect(dynamicBlock).toContain('spa -> api')
    expect(dynamicBlock).not.toContain('include')
  })

  it('round-trips an unscoped dynamic view with a * scope marker', () => {
    const dsl = `workspace {
      model {
        a = softwareSystem "A"
        b = softwareSystem "B"
        a -> b "calls"
      }
      views {
        dynamic * "Flow" {
          a -> b
        }
      }
    }`
    const { workspace: first } = parseDSL(dsl)
    const serialized = serializeDSL(first)
    expect(serialized).toContain('dynamic * "Flow"')
    const { workspace: second, errors } = parseDSL(serialized)
    expect(errors).toHaveLength(0)
    expect(second.views.dynamicViews[0].relationships).toHaveLength(1)
  })
})
