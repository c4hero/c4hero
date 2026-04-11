/**
 * Tests for `include *` wildcard expansion in view definitions.
 * Before this fix, `include *` left a literal `{ id: '*' }` in view.elements,
 * which the Canvas skipped, resulting in empty views when importing DSL files.
 */
import { describe, it, expect } from 'vitest'
import { parseDSL } from '@/lib/dsl'

describe('include * wildcard expansion', () => {
  it('systemLandscape include * expands to all people and systems', () => {
    const dsl = `
workspace "Test" {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
  }
  views {
    systemLandscape "overview" {
      include *
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = workspace.views.systemLandscapeViews[0]
    // No literal * element
    expect(view.elements.some(e => e.id === '*')).toBe(false)
    // Both alice and api should be present
    const aliceId = workspace.model.people[0].id
    const apiId = workspace.model.softwareSystems[0].id
    expect(view.elements.some(e => e.id === aliceId)).toBe(true)
    expect(view.elements.some(e => e.id === apiId)).toBe(true)
  })

  it('container include * expands to containers of the scoped system', () => {
    const dsl = `
workspace "Test" {
  model {
    myApp = softwareSystem "My App" {
      webFront = container "Web Frontend"
      apiBack = container "API Backend"
    }
    external = softwareSystem "External System"
  }
  views {
    container myApp "myAppContainers" {
      include *
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = workspace.views.containerViews[0]
    expect(view.elements.some(e => e.id === '*')).toBe(false)
    const myApp = workspace.model.softwareSystems.find(s => s.name === 'My App')!
    const webFrontId = myApp.containers.find(c => c.name === 'Web Frontend')!.id
    const apiBackId = myApp.containers.find(c => c.name === 'API Backend')!.id
    expect(view.elements.some(e => e.id === webFrontId)).toBe(true)
    expect(view.elements.some(e => e.id === apiBackId)).toBe(true)
    // External system should appear as a system-level element, not a container
    const externalId = workspace.model.softwareSystems.find(s => s.name === 'External System')!.id
    expect(view.elements.some(e => e.id === externalId)).toBe(true)
  })

  it('component include * expands to components of the scoped container', () => {
    const dsl = `
workspace "Test" {
  model {
    sys = softwareSystem "System" {
      api = container "API" {
        authSvc = component "Auth Service"
        orderSvc = component "Order Service"
      }
    }
  }
  views {
    component api "apiComponents" {
      include *
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = workspace.views.componentViews[0]
    expect(view.elements.some(e => e.id === '*')).toBe(false)
    const sys = workspace.model.softwareSystems[0]
    const api = sys.containers[0]
    const authId = api.components.find(c => c.name === 'Auth Service')!.id
    const orderId = api.components.find(c => c.name === 'Order Service')!.id
    expect(view.elements.some(e => e.id === authId)).toBe(true)
    expect(view.elements.some(e => e.id === orderId)).toBe(true)
  })

  it('relationships between expanded elements are populated', () => {
    const dsl = `
workspace "Test" {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
    alice -> api "uses"
  }
  views {
    systemLandscape "overview" {
      include *
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = workspace.views.systemLandscapeViews[0]
    expect(view.relationships).toHaveLength(1)
    const rel = workspace.model.relationships[0]
    expect(view.relationships[0].id).toBe(rel.id)
  })

  it('exclude removes specific elements after include *', () => {
    const dsl = `
workspace "Test" {
  model {
    alice = person "Alice"
    bob = person "Bob"
    api = softwareSystem "API"
  }
  views {
    systemLandscape "overview" {
      include *
      exclude bob
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = workspace.views.systemLandscapeViews[0]
    const bobId = workspace.model.people.find(p => p.name === 'Bob')!.id
    const aliceId = workspace.model.people.find(p => p.name === 'Alice')!.id
    const apiId = workspace.model.softwareSystems[0].id
    // Bob should be excluded
    expect(view.elements.some(e => e.id === bobId)).toBe(false)
    // Alice and API should remain
    expect(view.elements.some(e => e.id === aliceId)).toBe(true)
    expect(view.elements.some(e => e.id === apiId)).toBe(true)
  })

  it('exclude removes explicitly included elements', () => {
    const dsl = `
workspace "Test" {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
  }
  views {
    systemLandscape "overview" {
      include alice
      include api
      exclude alice
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = workspace.views.systemLandscapeViews[0]
    const aliceId = workspace.model.people[0].id
    const apiId = workspace.model.softwareSystems[0].id
    // Alice should be excluded
    expect(view.elements.some(e => e.id === aliceId)).toBe(false)
    // API should remain
    expect(view.elements.some(e => e.id === apiId)).toBe(true)
  })
})
