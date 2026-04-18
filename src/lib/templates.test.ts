import { describe, it, expect } from 'vitest'
import {
  createBigBankSample,
  createMicroservicesTemplate,
  createMonolithTemplate,
  createEventDrivenTemplate,
  createBlankWorkspace,
} from './templates'
import { serializeDSL, parseDSL } from '@/lib/dsl'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countContainers(ws: ReturnType<typeof createBigBankSample>) {
  return ws.model.softwareSystems.reduce((n, s) => n + (s.containers?.length ?? 0), 0)
}

function countComponents(ws: ReturnType<typeof createBigBankSample>) {
  return ws.model.softwareSystems.reduce(
    (n, s) => n + (s.containers ?? []).reduce((m, c) => m + (c.components?.length ?? 0), 0),
    0,
  )
}

// ---------------------------------------------------------------------------
// createBigBankSample
// ---------------------------------------------------------------------------

describe('createBigBankSample', () => {
  it('returns a workspace with the correct name', () => {
    expect(createBigBankSample().name).toBe('Big Bank plc')
  })

  it('contains 3 people, 4 software systems, 28 relationships', () => {
    const ws = createBigBankSample()
    expect(ws.model.people).toHaveLength(3)
    expect(ws.model.softwareSystems).toHaveLength(4)
    expect(ws.model.relationships).toHaveLength(28)
  })

  it('contains 5 containers and 6 components', () => {
    const ws = createBigBankSample()
    expect(countContainers(ws)).toBe(5)
    expect(countComponents(ws)).toBe(6)
  })

  it('has 1 landscape, 1 systemContext, 1 container, 1 component view', () => {
    const ws = createBigBankSample()
    expect(ws.views.systemLandscapeViews).toHaveLength(1)
    expect(ws.views.systemContextViews).toHaveLength(1)
    expect(ws.views.containerViews).toHaveLength(1)
    expect(ws.views.componentViews).toHaveLength(1)
  })

  it('all elements have required fields (id, type, name, tags, properties)', () => {
    const ws = createBigBankSample()
    for (const p of ws.model.people) {
      expect(p.id).toBeTruthy()
      expect(p.type).toBe('person')
      expect(p.name).toBeTruthy()
      expect(p.tags).toBeDefined()
      expect(p.properties).toBeDefined()
    }
    for (const sys of ws.model.softwareSystems) {
      expect(sys.id).toBeTruthy()
      expect(sys.type).toBe('softwareSystem')
      expect(sys.name).toBeTruthy()
      for (const c of sys.containers ?? []) {
        expect(c.id).toBeTruthy()
        expect(c.type).toBe('container')
        for (const comp of c.components ?? []) {
          expect(comp.id).toBeTruthy()
          expect(comp.type).toBe('component')
        }
      }
    }
  })

  it('all relationships have sourceId, destinationId, and tags', () => {
    const ws = createBigBankSample()
    for (const r of ws.model.relationships) {
      expect(r.id).toBeTruthy()
      expect(r.sourceId).toBeTruthy()
      expect(r.destinationId).toBeTruthy()
      expect(r.tags).toBeDefined()
    }
  })

  it('survives DSL serialize → parse roundtrip without errors', () => {
    const ws = createBigBankSample()
    const { errors } = parseDSL(serializeDSL(ws))
    expect(errors).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// createMicroservicesTemplate
// ---------------------------------------------------------------------------

describe('createMicroservicesTemplate', () => {
  it('returns a workspace with a descriptive name', () => {
    const ws = createMicroservicesTemplate()
    expect(ws.name).toBeTruthy()
  })

  it('contains 1 person, 1 software system, 7 containers, 12 relationships', () => {
    const ws = createMicroservicesTemplate()
    expect(ws.model.people).toHaveLength(1)
    expect(ws.model.softwareSystems).toHaveLength(1)
    expect(countContainers(ws)).toBe(7)
    expect(ws.model.relationships).toHaveLength(12)
  })

  it('has 1 landscape view and 1 container view', () => {
    const ws = createMicroservicesTemplate()
    expect(ws.views.systemLandscapeViews).toHaveLength(1)
    expect(ws.views.containerViews).toHaveLength(1)
  })

  it('survives DSL serialize → parse roundtrip without errors', () => {
    const ws = createMicroservicesTemplate()
    const { errors } = parseDSL(serializeDSL(ws))
    expect(errors).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// createMonolithTemplate
// ---------------------------------------------------------------------------

describe('createMonolithTemplate', () => {
  it('returns a workspace with a descriptive name', () => {
    const ws = createMonolithTemplate()
    expect(ws.name).toBeTruthy()
  })

  it('contains 2 people, 2 software systems, 3 containers, 9 relationships', () => {
    const ws = createMonolithTemplate()
    expect(ws.model.people).toHaveLength(2)
    expect(ws.model.softwareSystems).toHaveLength(2)
    expect(countContainers(ws)).toBe(3)
    expect(ws.model.relationships).toHaveLength(9)
  })

  it('has 1 landscape view and 1 container view', () => {
    const ws = createMonolithTemplate()
    expect(ws.views.systemLandscapeViews).toHaveLength(1)
    expect(ws.views.containerViews).toHaveLength(1)
  })

  it('survives DSL serialize → parse roundtrip without errors', () => {
    const ws = createMonolithTemplate()
    const { errors } = parseDSL(serializeDSL(ws))
    expect(errors).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// createEventDrivenTemplate
// ---------------------------------------------------------------------------

describe('createEventDrivenTemplate', () => {
  it('returns a workspace with a descriptive name', () => {
    const ws = createEventDrivenTemplate()
    expect(ws.name).toBeTruthy()
  })

  it('contains 1 person, 2 software systems, 7 containers, 12 relationships', () => {
    const ws = createEventDrivenTemplate()
    expect(ws.model.people).toHaveLength(1)
    expect(ws.model.softwareSystems).toHaveLength(2)
    expect(countContainers(ws)).toBe(7)
    expect(ws.model.relationships).toHaveLength(12)
  })

  it('has 1 landscape view and 1 container view', () => {
    const ws = createEventDrivenTemplate()
    expect(ws.views.systemLandscapeViews).toHaveLength(1)
    expect(ws.views.containerViews).toHaveLength(1)
  })

  it('survives DSL serialize → parse roundtrip without errors', () => {
    const ws = createEventDrivenTemplate()
    const { errors } = parseDSL(serializeDSL(ws))
    expect(errors).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// createBlankWorkspace
// ---------------------------------------------------------------------------

describe('createBlankWorkspace', () => {
  it('(no scope) returns a system landscape view and no software systems', () => {
    const ws = createBlankWorkspace()
    expect(ws.views.systemLandscapeViews).toHaveLength(1)
    expect(ws.model.softwareSystems).toHaveLength(0)
    expect(ws.scope).toBeUndefined()
  })

  it('(landscape scope) returns a system landscape view and no software systems', () => {
    const ws = createBlankWorkspace('landscape')
    expect(ws.views.systemLandscapeViews).toHaveLength(1)
    expect(ws.model.softwareSystems).toHaveLength(0)
    expect(ws.scope).toBe('landscape')
  })

  it('(softwaresystem scope) returns a placeholder system and a systemContext view', () => {
    const ws = createBlankWorkspace('softwaresystem')
    expect(ws.model.softwareSystems).toHaveLength(1)
    expect(ws.views.systemContextViews).toHaveLength(1)
    expect(ws.views.systemLandscapeViews).toHaveLength(0)
    expect(ws.scope).toBe('softwaresystem')
  })

  it('(softwaresystem scope) systemContext view references the placeholder system', () => {
    const ws = createBlankWorkspace('softwaresystem')
    const sys = ws.model.softwareSystems[0]
    const view = ws.views.systemContextViews[0]
    expect(view.softwareSystemId).toBe(sys.id)
  })

  it('(no scope) landscape view has autoLayout set', () => {
    const ws = createBlankWorkspace()
    expect(ws.views.systemLandscapeViews[0].autoLayout).toBeDefined()
  })

  it('all blank workspaces have the required views/model structure', () => {
    for (const scope of [undefined, 'landscape', 'softwaresystem'] as const) {
      const ws = createBlankWorkspace(scope)
      expect(ws.model.relationships).toEqual([])
      expect(ws.views.containerViews).toEqual([])
      expect(ws.views.componentViews).toEqual([])
      expect(ws.views.configuration.styles.elements).toEqual([])
      expect(ws.views.configuration.styles.relationships).toEqual([])
    }
  })
})
