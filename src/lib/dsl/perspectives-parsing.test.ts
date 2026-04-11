import { describe, it, expect } from 'vitest'
import { parseDSL } from '@/lib/dsl'

describe('unknown workspace-level keyword blocks', () => {
  it('branding block is skipped without errors', () => {
    const dsl = `
workspace "Test" {
  branding {
    logo "https://example.com/logo.png"
    font "Courier New"
  }
  model {
    api = softwareSystem "API"
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.model.softwareSystems.find(s => s.name === 'API')).toBeDefined()
  })

  it('terminology block is skipped without errors', () => {
    const dsl = `
workspace "Test" {
  model {
    api = softwareSystem "API"
  }
  views {}
  terminology {
    enterprise "Bank"
    person "Customer"
    softwareSystem "App"
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.model.softwareSystems.find(s => s.name === 'API')).toBeDefined()
  })
})

describe('preprocessor directive handling', () => {
  it('!include at workspace level is skipped without consuming next element', () => {
    const dsl = `
workspace {
  !include "config.dsl"
  model {
    api = softwareSystem "API"
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    // Parser cannot evaluate !include, but must not crash or misparse what follows
    expect(workspace.model.softwareSystems.find(s => s.name === 'API')).toBeDefined()
  })

  it('!const in model body is skipped without consuming next element', () => {
    const dsl = `
workspace {
  model {
    !const MY_TAG "CustomTag"
    api = softwareSystem "API"
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(workspace.model.softwareSystems.find(s => s.name === 'API')).toBeDefined()
  })

  it('!identifiers at workspace level is skipped', () => {
    const dsl = `
workspace {
  !identifiers hierarchical
  model {
    api = softwareSystem "API"
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(workspace.model.softwareSystems.find(s => s.name === 'API')).toBeDefined()
  })
})

describe('perspectives block parsing', () => {
  it('perspectives block in softwareSystem body is skipped without errors', () => {
    const dsl = `
workspace {
  model {
    api = softwareSystem "API" {
      perspectives {
        Security "A security perspective"
        Performance "A performance perspective"
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const sys = workspace.model.softwareSystems.find(s => s.name === 'API')
    expect(sys).toBeDefined()
  })

  it('perspectives block in container body is skipped without errors', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "Sys" {
      api = container "API Container" {
        perspectives {
          Security "Secure by design"
        }
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const container = workspace.model.softwareSystems[0]?.containers.find(c => c.name === 'API Container')
    expect(container).toBeDefined()
  })

  it('perspectives block in person body is skipped without errors', () => {
    // Person body uses parseSimpleElementBlock — must also skip unknown brace blocks
    const dsl = `
workspace {
  model {
    alice = person "Alice" {
      perspectives {
        Security "Awareness training required"
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const alice = workspace.model.people.find(p => p.name === 'Alice')
    expect(alice).toBeDefined()
  })

  it('perspectives block in component body is skipped without errors', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "Sys" {
      api = container "API" {
        auth = component "Auth Service" {
          perspectives {
            Security "Authentication layer"
          }
        }
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const component = workspace.model.softwareSystems[0]?.containers[0]?.components.find(c => c.name === 'Auth Service')
    expect(component).toBeDefined()
  })
})

describe('wildcard expansion in views', () => {
  it('systemLandscape include * expands to all people and systems', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    bob = person "Bob"
    api = softwareSystem "API"
    store = softwareSystem "Store"
  }
  views {
    systemLandscape "sl" {
      include *
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const view = workspace.views.systemLandscapeViews[0]
    expect(view.elements).toHaveLength(4) // alice, bob, api, store
  })

  it('systemContext include * expands only to the scoped system and directly connected elements', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    unrelated = person "Unrelated"
    api = softwareSystem "API"
    other = softwareSystem "Other"
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
    expect(errors).toEqual([])
    const view = workspace.views.systemContextViews[0]
    const elementIds = view.elements.map(e => e.id)
    // Should include: api (scope) + alice (connected). NOT unrelated or other.
    expect(elementIds).toContain(workspace.model.softwareSystems.find(s => s.name === 'API')!.id)
    expect(elementIds).toContain(workspace.model.people.find(p => p.name === 'Alice')!.id)
    expect(elementIds).not.toContain(workspace.model.people.find(p => p.name === 'Unrelated')!.id)
    expect(elementIds).not.toContain(workspace.model.softwareSystems.find(s => s.name === 'Other')!.id)
  })
})

describe('configuration block with nested sub-blocks', () => {
  it('configuration block with nested users sub-block is skipped without errors', () => {
    // Structurizr DSL supports `users { ... }` inside `configuration` for access control.
    // The parser should skip unknown nested blocks without corrupting parse state.
    const dsl = `
workspace {
  model {
    api = softwareSystem "API"
  }
  views {}
  configuration {
    scope softwareSystem
    users {
      user1 "read"
      user2 "read,write"
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    // Scope should be recognized despite the unknown nested block
    expect(workspace.scope).toBe('softwaresystem')
    expect(workspace.model.softwareSystems.find(s => s.name === 'API')).toBeDefined()
  })
})
