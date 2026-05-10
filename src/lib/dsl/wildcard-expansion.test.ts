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

  it('systemContext include * expands to the scoped system plus directly connected elements only', () => {
    // For a system context view, include * means the scoped system plus all
    // people/systems with a relationship to the scope OR to one of its containers
    // /components — not the full landscape. (The container-level promotion is the
    // user-friendly equivalent of Structurizr's "implied relationships".)
    const dsl = `
workspace "Test" {
  model {
    alice = person "Alice"
    bob = person "Bob"
    api = softwareSystem "API"
    external = softwareSystem "External"
    alice -> api "uses"
  }
  views {
    systemContext api "ctx" {
      include *
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = workspace.views.systemContextViews[0]
    expect(view.elements.some(e => e.id === '*')).toBe(false)
    const aliceId = workspace.model.people.find(p => p.name === 'Alice')!.id
    const bobId = workspace.model.people.find(p => p.name === 'Bob')!.id
    const apiId = workspace.model.softwareSystems.find(s => s.name === 'API')!.id
    const externalId = workspace.model.softwareSystems.find(s => s.name === 'External')!.id
    // api (scope) and alice (directly connected) should appear
    expect(view.elements.some(e => e.id === apiId)).toBe(true)
    expect(view.elements.some(e => e.id === aliceId)).toBe(true)
    // bob and external have no relationship to api — they should NOT appear
    expect(view.elements.some(e => e.id === bobId)).toBe(false)
    expect(view.elements.some(e => e.id === externalId)).toBe(false)
  })

  it('systemContext include * follows relationships through the scope system\'s containers', () => {
    // When a DSL author writes relationships at container granularity (the common
    // pattern), the system context should still summarize the system's collaborators.
    // Without this, the view would contain only the scope system and look broken.
    const dsl = `
workspace "Test" {
  model {
    teacher = person "Teacher"
    author = person "Content Author"
    ext = softwareSystem "External Service" "External" "External"
    unrelated = softwareSystem "Unrelated"
    pubSvc = softwareSystem "Pub Service" {
      api = container "API"
      db = container "DB" "Postgres" "Database"
    }
    teacher -> api "browses"
    api -> ext "fetches"
    api -> db "reads"
    author -> pubSvc "writes"
  }
  views {
    systemContext pubSvc "ctx" {
      include *
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = workspace.views.systemContextViews[0]
    const pubSvcId = workspace.model.softwareSystems.find(s => s.name === 'Pub Service')!.id
    const teacherId = workspace.model.people.find(p => p.name === 'Teacher')!.id
    const authorId = workspace.model.people.find(p => p.name === 'Content Author')!.id
    const extId = workspace.model.softwareSystems.find(s => s.name === 'External Service')!.id
    const unrelatedId = workspace.model.softwareSystems.find(s => s.name === 'Unrelated')!.id
    const apiId = workspace.model.softwareSystems.find(s => s.name === 'Pub Service')!.containers.find(c => c.name === 'API')!.id
    // Scope system itself
    expect(view.elements.some(e => e.id === pubSvcId)).toBe(true)
    // Teacher (relates to api container of scope) — promoted to system context
    expect(view.elements.some(e => e.id === teacherId)).toBe(true)
    // External service (relates to api container of scope) — promoted
    expect(view.elements.some(e => e.id === extId)).toBe(true)
    // Author (relates to scope system directly) — included
    expect(view.elements.some(e => e.id === authorId)).toBe(true)
    // Containers of the scope system MUST NOT appear in the system context
    expect(view.elements.some(e => e.id === apiId)).toBe(false)
    // Unrelated system has no relationship anywhere — NOT included
    expect(view.elements.some(e => e.id === unrelatedId)).toBe(false)
  })

  it('container include * expands to containers of the scoped system plus related external elements', () => {
    const dsl = `
workspace "Test" {
  model {
    user = person "User"
    myApp = softwareSystem "My App" {
      webFront = container "Web Frontend"
      apiBack = container "API Backend"
    }
    external = softwareSystem "External System"
    unrelated = softwareSystem "Unrelated"
    user -> webFront "uses"
    apiBack -> external "calls"
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
    const userId = workspace.model.people.find(p => p.name === 'User')!.id
    const externalId = workspace.model.softwareSystems.find(s => s.name === 'External System')!.id
    const unrelatedId = workspace.model.softwareSystems.find(s => s.name === 'Unrelated')!.id
    // Scoped system's containers
    expect(view.elements.some(e => e.id === webFrontId)).toBe(true)
    expect(view.elements.some(e => e.id === apiBackId)).toBe(true)
    // Related external elements
    expect(view.elements.some(e => e.id === userId)).toBe(true)
    expect(view.elements.some(e => e.id === externalId)).toBe(true)
    // Unrelated system should NOT appear
    expect(view.elements.some(e => e.id === unrelatedId)).toBe(false)
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

  it('container include * includes containers from other systems that are directly related', () => {
    // When a container in the scoped system calls a container in another system,
    // the external container should appear in the view (not just the parent system).
    const dsl = `
workspace "Test" {
  model {
    myApp = softwareSystem "My App" {
      api = container "API"
    }
    otherApp = softwareSystem "Other App" {
      db = container "Database"
    }
    api -> db "reads"
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
    const apiId = workspace.model.softwareSystems.find(s => s.name === 'My App')!.containers[0].id
    const dbId = workspace.model.softwareSystems.find(s => s.name === 'Other App')!.containers[0].id
    // The scoped container should appear
    expect(view.elements.some(e => e.id === apiId)).toBe(true)
    // The related container from the other system should also appear
    expect(view.elements.some(e => e.id === dbId)).toBe(true)
  })

  it('component include * shows parent container as boundary for related components in other containers', () => {
    // When ComponentA calls ComponentB (which lives in ContainerY), ContainerY should
    // appear in the view as a C4 boundary element, not ComponentB directly.
    const dsl = `
workspace "Test" {
  model {
    sys = softwareSystem "System" {
      frontendCont = container "Frontend" {
        loginComp = component "Login"
      }
      backendCont = container "Backend" {
        authComp = component "Auth"
      }
    }
    loginComp -> authComp "verifies"
  }
  views {
    component frontendCont "frontendComponents" {
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
    const frontend = sys.containers.find(c => c.name === 'Frontend')!
    const backend = sys.containers.find(c => c.name === 'Backend')!
    const loginId = frontend.components[0].id
    const authId = backend.components[0].id
    // Login component (in scoped container) should appear
    expect(view.elements.some(e => e.id === loginId)).toBe(true)
    // Backend container (parent of auth) should appear as the C4 boundary
    expect(view.elements.some(e => e.id === backend.id)).toBe(true)
    // The internal auth component itself should NOT appear (it lives behind the boundary)
    expect(view.elements.some(e => e.id === authId)).toBe(false)
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
