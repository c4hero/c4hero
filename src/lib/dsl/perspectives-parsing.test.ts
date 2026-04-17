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
    const { workspace } = parseDSL(dsl)
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
    const { workspace } = parseDSL(dsl)
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
    const { workspace } = parseDSL(dsl)
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

describe('unknown brace block in element bodies does not eat subsequent siblings', () => {
  it('unknown brace block in softwareSystem body does not discard later containers', () => {
    // Before the fix: the inner `}` of the unknown block terminated parseSoftwareSystemBody,
    // causing all containers defined after it to be silently lost.
    const dsl = `
workspace {
  model {
    sys = softwareSystem "Sys" {
      unknownExtension "config" {
        key "value"
      }
      api = container "API"
      db = container "Database"
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const sys = workspace.model.softwareSystems.find(s => s.name === 'Sys')
    expect(sys).toBeDefined()
    expect(sys?.containers.find(c => c.name === 'API')).toBeDefined()
    expect(sys?.containers.find(c => c.name === 'Database')).toBeDefined()
  })

  it('unknown brace block in container body does not discard later components', () => {
    // Before the fix: the inner `}` of the unknown block terminated parseContainerBody,
    // causing all components defined after it to be silently lost.
    const dsl = `
workspace {
  model {
    sys = softwareSystem "Sys" {
      api = container "API" {
        unknownExtension "config" {
          key "value"
        }
        auth = component "Auth Service"
        orders = component "Orders Service"
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const container = workspace.model.softwareSystems[0]?.containers.find(c => c.name === 'API')
    expect(container).toBeDefined()
    expect(container?.components.find(c => c.name === 'Auth Service')).toBeDefined()
    expect(container?.components.find(c => c.name === 'Orders Service')).toBeDefined()
  })

  it('unknown brace block on next line in softwareSystem body is also handled', () => {
    // Test the case where `{` is on the line after the keyword (not inline)
    const dsl = `
workspace {
  model {
    sys = softwareSystem "Sys"
    {
      unknownKeyword
      {
        nested "stuff"
      }
      web = container "Web"
    }
  }
  views {}
}
`
    // This is unusual DSL (brace on its own line), but the parser should not crash.
    // Even if it can't parse `sys` correctly in this form, the subsequent parse must not throw.
    const { workspace } = parseDSL(dsl)
    // At minimum, no exception was thrown. The workspace itself may be partially parsed.
    expect(workspace).toBeDefined()
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
    const { workspace } = parseDSL(dsl)
    // Scope should be recognized despite the unknown nested block
    expect(workspace.scope).toBe('softwaresystem')
    expect(workspace.model.softwareSystems.find(s => s.name === 'API')).toBeDefined()
  })
})

describe('unknown brace block in view body does not eat the view closing RBRACE', () => {
  it('unknown keyword with brace block in systemLandscape view body does not terminate view early', () => {
    // Before the fix: unknown keyword + brace block on next line caused the inner `}`
    // to terminate the view body loop, cutting off any subsequent include/autolayout directives.
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
  }
  views {
    systemLandscape "sl" {
      unknownDirective
      {
        key "value"
      }
      include *
    }
  }
}
`
    const { workspace } = parseDSL(dsl)
    const view = workspace.views.systemLandscapeViews[0]
    expect(view).toBeDefined()
    // include * after the unknown block must still be processed
    expect(view.elements.length).toBeGreaterThan(0)
  })

  it('unknown keyword with inline brace block in systemContext view body does not eat siblings', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
    alice -> api "uses"
  }
  views {
    systemContext api "ctx" {
      unknownPlugin "config" { key "value" }
      include *
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const view = workspace.views.systemContextViews[0]
    expect(view).toBeDefined()
    expect(view.elements.length).toBeGreaterThan(0)
  })
})

describe('unknown keyword with brace block in model body does not eat subsequent elements', () => {
  it('unknown keyword with brace block on next line in model body does not drop subsequent softwareSystems', () => {
    // Before the fix: the inner `}` of the unknown block terminated parseModelBody,
    // causing all elements defined after it to be silently lost.
    const dsl = `
workspace {
  model {
    unknownExtension
    {
      key "value"
    }
    alice = person "Alice"
    api = softwareSystem "API"
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.model.people.find(p => p.name === 'Alice')).toBeDefined()
    expect(workspace.model.softwareSystems.find(s => s.name === 'API')).toBeDefined()
  })

  it('unknown keyword with inline brace block in model body does not drop subsequent elements', () => {
    const dsl = `
workspace {
  model {
    unknownPlugin "config" { key "value" }
    alice = person "Alice"
    api = softwareSystem "API"
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.model.people.find(p => p.name === 'Alice')).toBeDefined()
    expect(workspace.model.softwareSystems.find(s => s.name === 'API')).toBeDefined()
  })
})

describe('unknown keyword/identifier with brace block in views body does not drop subsequent views', () => {
  it('unknown keyword with brace block on next line in views body does not drop subsequent views', () => {
    // parseViewsBody unknown KEYWORD fallthrough lacked the LBRACE guard:
    // the `{` was left unconsumed and the next `}` terminated the views loop.
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
    alice -> api "uses"
  }
  views {
    unknownExtension
    {
      key "value"
    }
    systemLandscape "sl" {
      include *
    }
  }
}
`
    const { workspace } = parseDSL(dsl)
    expect(workspace.views.systemLandscapeViews).toHaveLength(1)
    expect(workspace.views.systemLandscapeViews[0].elements.length).toBeGreaterThan(0)
  })

  it('unknown identifier with inline brace block in views body does not drop subsequent views', () => {
    // parseViewsBody had no IDENTIFIER handler at all — unknown identifiers with
    // brace blocks left stray tokens that corrupted the parse position.
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
    alice -> api "uses"
  }
  views {
    unknownPlugin "config" { key "value" }
    systemLandscape "sl" {
      include *
    }
  }
}
`
    const { workspace } = parseDSL(dsl)
    expect(workspace.views.systemLandscapeViews).toHaveLength(1)
    expect(workspace.views.systemLandscapeViews[0].elements.length).toBeGreaterThan(0)
  })
})

describe('unknown KEYWORD with inline brace block does not eat parent closing RBRACE', () => {
  it('recognized DSL keyword with inline brace block in softwareSystem body does not drop later containers', () => {
    // Keywords like `styles`, `users`, `branding` are in the lexer KEYWORDS set but not
    // handled inside softwareSystem body — they fall through to the unknown-KEYWORD path.
    // Before the fix, skipToNextLine() consumed the inline `{`, so the block content was
    // processed by the outer loop until `}` prematurely terminated it.
    const dsl = `
workspace {
  model {
    sys = softwareSystem "Sys" {
      styles { color "#ff0000" }
      api = container "API"
      db = container "Database"
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const sys = workspace.model.softwareSystems.find(s => s.name === 'Sys')
    expect(sys).toBeDefined()
    expect(sys?.containers.find(c => c.name === 'API')).toBeDefined()
    expect(sys?.containers.find(c => c.name === 'Database')).toBeDefined()
  })

  it('recognized DSL keyword with inline brace block in container body does not drop later components', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "Sys" {
      api = container "API" {
        users { user1 "read" }
        auth = component "Auth"
        orders = component "Orders"
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const container = workspace.model.softwareSystems[0]?.containers[0]
    expect(container?.components.find(c => c.name === 'Auth')).toBeDefined()
    expect(container?.components.find(c => c.name === 'Orders')).toBeDefined()
  })
})

describe('unknown brace block in relationship body does not eat the relationship closing RBRACE', () => {
  it('unknown keyword with brace block in relationship body does not drop subsequent tags', () => {
    // Before the fix: the inner `}` of the unknown block terminated the relationship
    // body loop, leaving subsequent directives (tags, etc.) unparsed.
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
    alice -> api "uses" {
      unknownExtension {
        key "value"
      }
      tags "Important"
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0]
    expect(rel).toBeDefined()
    expect(rel.description).toBe('uses')
    expect(rel.tags).toContain('Important')
  })

  it('unknown identifier with inline brace block in relationship body does not drop subsequent tags', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
    alice -> api "uses" {
      unknownPlugin "config" { key "value" }
      tags "Critical"
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0]
    expect(rel).toBeDefined()
    expect(rel.tags).toContain('Critical')
  })
})

describe('standalone IDENTIFIER with inline multiline brace block does not eat subsequent elements', () => {
  it('standalone IDENTIFIER with inline { on same line but multiline body does not drop subsequent elements', () => {
    // `skipToNextLine()` consumed the `{` when it was on the same line as the identifier,
    // letting the block body pollute the model parse loop. The LBRACE-aware while-loop fix
    // stops before `{` and then calls skipBraceBlock().
    const dsl = `
workspace {
  model {
    unknownPlugin "config" {
      key "value"
    }
    alice = person "Alice"
    api = softwareSystem "API"
  }
  views {}
}
`
    const { workspace } = parseDSL(dsl)
    expect(workspace.model.people.find(p => p.name === 'Alice')).toBeDefined()
    expect(workspace.model.softwareSystems.find(s => s.name === 'API')).toBeDefined()
  })
})

describe('IDENTIFIER = unknownKeyword { block } does not eat subsequent model elements', () => {
  it('deploymentEnvironment with inline brace block does not drop subsequent elements', () => {
    // Before fix: `foo = deploymentEnvironment "Prod" {` — after consuming `=`, the parser was
    // at `deploymentEnvironment` (a KEYWORD). Since it's not 'person' or 'softwareSystem',
    // it called skipToNextLine() which consumed `deploymentEnvironment "Prod" {`.
    // The block content then polluted the model parse loop, and the closing `}` prematurely
    // ended parseModelBody, silently dropping alice and api.
    const dsl = `
workspace {
  model {
    prod = deploymentEnvironment "Production" {
      deploymentNode "AWS" {
        containerInstance appContainer
      }
    }
    alice = person "Alice"
    api = softwareSystem "API"
  }
  views {}
}
`
    const { workspace } = parseDSL(dsl)
    expect(workspace.model.people.find(p => p.name === 'Alice')).toBeDefined()
    expect(workspace.model.softwareSystems.find(s => s.name === 'API')).toBeDefined()
  })

  it('nested brace block assigned to unknown keyword in model body does not drop subsequent elements', () => {
    const dsl = `
workspace {
  model {
    env = unknownElement "Env" {
      child = nestedThing "Child" {
        leafProperty "value"
      }
    }
    alice = person "Alice"
  }
  views {}
}
`
    const { workspace } = parseDSL(dsl)
    expect(workspace.model.people.find(p => p.name === 'Alice')).toBeDefined()
  })

  it('IDENTIFIER = nonKeyword value { block } in model body does not drop subsequent elements', () => {
    // After `=`, the next token is not a KEYWORD — falls into the else branch at line 543.
    const dsl = `
workspace {
  model {
    foo = someValue "arg" {
      someProperty "val"
    }
    api = softwareSystem "API"
  }
  views {}
}
`
    const { workspace } = parseDSL(dsl)
    expect(workspace.model.softwareSystems.find(s => s.name === 'API')).toBeDefined()
  })
})

describe('IDENTIFIER = unknownKeyword { block } inside softwareSystem body does not eat siblings', () => {
  it('unknown element type with brace block inside softwareSystem does not drop subsequent containers', () => {
    // In parseSoftwareSystemBody: `x = unknownKeyword { ... }` used skipToNextLine()
    // which consumed the `{`, letting the block content pollute the outer loop.
    const dsl = `
workspace {
  model {
    sys = softwareSystem "Sys" {
      foo = deploymentNode "FooNode" {
        someProperty "value"
      }
      db = container "Database"
      api = container "API"
    }
  }
  views {}
}
`
    const { workspace } = parseDSL(dsl)
    const sys = workspace.model.softwareSystems.find(s => s.name === 'Sys')
    expect(sys).toBeDefined()
    expect(sys?.containers.find(c => c.name === 'Database')).toBeDefined()
    expect(sys?.containers.find(c => c.name === 'API')).toBeDefined()
  })

  it('unknown element type with multiline brace block inside container body does not drop subsequent components', () => {
    // A multiline block is the critical case: skipToNextLine() consumes the `{` but not `}`,
    // so the closing `}` of the inner block terminates the outer parseContainerBody loop early,
    // dropping auth and gateway.
    const dsl = `
workspace {
  model {
    sys = softwareSystem "Sys" {
      app = container "App" {
        ext = unknownThing "ext" {
          key "val"
        }
        auth = component "Auth Service"
        gateway = component "Gateway"
      }
    }
  }
  views {}
}
`
    const { workspace } = parseDSL(dsl)
    const sys = workspace.model.softwareSystems.find(s => s.name === 'Sys')
    const app = sys?.containers.find(c => c.name === 'App')
    expect(app?.components.find(c => c.name === 'Auth Service')).toBeDefined()
    expect(app?.components.find(c => c.name === 'Gateway')).toBeDefined()
  })
})
