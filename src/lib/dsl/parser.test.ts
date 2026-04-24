import { describe, it, expect } from 'vitest'
import { parseDSL as parse, parseDSL } from './index'

// ─── Group Parsing Tests ──────────────────────────────────────────────

describe('Group parsing', () => {
  it('captures a group with elements defined inside it', () => {
    const dsl = `
workspace {
  model {
    group "Backend" {
      person "Alice"
      softwareSystem "API"
    }
  }
}
`
    const { workspace, errors } = parse(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.groups).toHaveLength(1)
    const g = workspace.model.groups[0]
    expect(g.name).toBe('Backend')
    expect(g.elementIds).toHaveLength(2)
  })

  it('creates group members that match the defined element IDs', () => {
    const dsl = `
workspace {
  model {
    group "Internal" {
      alice = person "Alice"
      mySystem = softwareSystem "My System"
    }
  }
}
`
    const { workspace } = parse(dsl)
    const g = workspace.model.groups[0]
    // Element IDs are their var names
    expect(g.elementIds).toContain('alice')
    expect(g.elementIds).toContain('mySystem')
    expect(workspace.model.people[0].id).toBe('alice')
    expect(workspace.model.softwareSystems[0].id).toBe('mySystem')
  })

  it('captures groups with reference-style members (serializer output format)', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    mySystem = softwareSystem "My System"

    group "Internal" {
      alice
      mySystem
    }
  }
}
`
    const { workspace } = parse(dsl)
    expect(workspace.model.groups).toHaveLength(1)
    const g = workspace.model.groups[0]
    expect(g.name).toBe('Internal')
    expect(g.elementIds).toContain('alice')
    expect(g.elementIds).toContain('mySystem')
  })

  it('parses multiple groups', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    bob = person "Bob"
    apiSystem = softwareSystem "API"

    group "Team A" {
      alice
    }
    group "Team B" {
      bob
      apiSystem
    }
  }
}
`
    const { workspace } = parse(dsl)
    expect(workspace.model.groups).toHaveLength(2)
    expect(workspace.model.groups[0].name).toBe('Team A')
    expect(workspace.model.groups[0].elementIds).toEqual(['alice'])
    expect(workspace.model.groups[1].name).toBe('Team B')
    expect(workspace.model.groups[1].elementIds).toContain('bob')
    expect(workspace.model.groups[1].elementIds).toContain('apiSystem')
  })

  it('preserves explicitly empty groups', () => {
    const dsl = `
workspace {
  model {
    group "Empty" {
    }
  }
}
`
    const { workspace, errors } = parse(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.groups).toHaveLength(1)
    expect(workspace.model.groups[0]).toMatchObject({ name: 'Empty', elementIds: [] })
  })

  it('handles unresolvable references without crashing', () => {
    const dsl = `
workspace {
  model {
    group "Maybe" {
      unknownRef
    }
  }
}
`
    const { workspace, errors } = parse(dsl)
    expect(errors).toHaveLength(0)
    // Preserve the explicit group even when its current member refs do not resolve.
    expect(workspace.model.groups).toHaveLength(1)
    expect(workspace.model.groups[0]).toMatchObject({ name: 'Maybe', elementIds: [] })
  })

  it('assigns a default name when no group name is provided', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    group {
      alice
    }
  }
}
`
    const { workspace } = parse(dsl)
    expect(workspace.model.groups).toHaveLength(1)
    expect(workspace.model.groups[0].name).toBeTruthy()
  })

  it('does not create duplicate IDs for group members', () => {
    // elements defined inside group get IDs; refs resolve to same IDs — no duplicates
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    group "Dedup" {
      alice
      alice
    }
  }
}
`
    const { workspace } = parse(dsl)
    const g = workspace.model.groups[0]
    const unique = new Set(g.elementIds)
    expect(unique.size).toBe(g.elementIds.length)
  })

  it('elements defined outside groups are not automatically grouped', () => {
    const dsl = `
workspace {
  model {
    person "Alice"
    person "Bob"
  }
}
`
    const { workspace } = parse(dsl)
    expect(workspace.model.groups).toHaveLength(0)
    expect(workspace.model.people).toHaveLength(2)
  })
})

// ─── Extended Parser Coverage ─────────────────────────────────────────

describe('DSL parser — extended coverage', () => {
  // ── Container / component views with include elements ──

  it('parses a containerView with explicit include elements', () => {
    const dsl = `
workspace {
  model {
    banking = softwareSystem "Internet Banking" {
      webApp = container "Web App"
      apiService = container "API Service"
    }
  }
  views {
    container banking "bankingContainerView" {
      include webApp
      include apiService
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.views.containerViews).toHaveLength(1)
    const view = workspace.views.containerViews[0]
    expect(view.elements).toHaveLength(2)
    const ids = view.elements.map(e => e.id)
    expect(ids).toContain('webApp')
    expect(ids).toContain('apiService')
  })

  it('parses a containerView with include * wildcard — expands to containers', () => {
    const dsl = `
workspace {
  model {
    banking = softwareSystem "Internet Banking" {
      webApp = container "Web App"
    }
  }
  views {
    container banking "bankingContainerView" {
      include *
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = workspace.views.containerViews[0]
    // Wildcard should be expanded — no literal '*' element remains
    expect(view.elements.some(e => e.id === '*')).toBe(false)
    // The web app container should be included
    const banking = workspace.model.softwareSystems[0]
    const webAppId = banking.containers[0].id
    expect(view.elements.some(e => e.id === webAppId)).toBe(true)
  })

  it('parses a componentView with include elements', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "System" {
      svc = container "Service" {
        ctrl = component "Controller"
        repo = component "Repository"
      }
    }
  }
  views {
    component svc "svcComponentView" {
      include ctrl
      include repo
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.views.componentViews).toHaveLength(1)
    const view = workspace.views.componentViews[0]
    const ids = view.elements.map(e => e.id)
    expect(ids).toContain('ctrl')
    expect(ids).toContain('repo')
  })

  // ── systemContext view ──

  it('parses a systemContext view with include *', () => {
    const dsl = `
workspace {
  model {
    banking = softwareSystem "Internet Banking"
  }
  views {
    systemContext banking "bankingContext" {
      include *
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.views.systemContextViews).toHaveLength(1)
    const view = workspace.views.systemContextViews[0]
    expect(view.softwareSystemId).toBe('banking')
  })

  it('parses a systemContext view with explicit element include', () => {
    const dsl = `
workspace {
  model {
    customer = person "Personal Banking Customer"
    banking = softwareSystem "Internet Banking"
  }
  views {
    systemContext banking "bankingContext" {
      include customer
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = workspace.views.systemContextViews[0]
    expect(view.elements.some(e => e.id === 'customer')).toBe(true)
  })

  // ── Relationships with technology and tags ──

  it('parses relationship with technology', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    myApp = softwareSystem "My App"
    alice -> myApp "uses" "HTTP"
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const rel = workspace.model.relationships[0]
    expect(rel.technology).toBe('HTTP')
  })

  it('parses relationship with tags in block', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    myApp = softwareSystem "My App"
    alice -> myApp "uses" "HTTP" {
      tags "async"
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const rel = workspace.model.relationships[0]
    expect(rel.technology).toBe('HTTP')
    expect(rel.tags).toContain('async')
  })

  it('parses relationship with description and technology as block-body keywords', () => {
    // Structurizr also supports description/technology as keywords inside the block body,
    // not just as inline positional args. Block form overrides any inline value.
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
    alice -> api {
      description "Authenticates"
      technology "OAuth2"
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const rel = workspace.model.relationships[0]
    expect(rel.description).toBe('Authenticates')
    expect(rel.technology).toBe('OAuth2')
  })

  it('block-body description overrides inline positional description', () => {
    // If both are present, the block keyword takes precedence (per comment in parser.ts).
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
    alice -> api "inline-description" {
      description "block-description"
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const rel = workspace.model.relationships[0]
    expect(rel.description).toBe('block-description')
  })

  it('parses relationship with description only', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    myApp = softwareSystem "My App"
    alice -> myApp "calls"
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const rel = workspace.model.relationships[0]
    expect(rel.description).toBe('calls')
    expect(rel.sourceId).toBe('alice')
    expect(rel.destinationId).toBe('myApp')
  })

  // ── autoLayout directions ──

  it('parses autoLayout tb', () => {
    const dsl = `
workspace {
  model { alice = person "Alice" }
  views {
    systemLandscape "sl" {
      autoLayout tb
    }
  }
}
`
    const { workspace } = parseDSL(dsl)
    expect(workspace.views.systemLandscapeViews[0].autoLayout?.direction).toBe('TB')
  })

  it('parses autoLayout bt', () => {
    const dsl = `
workspace {
  model { alice = person "Alice" }
  views {
    systemLandscape "sl" {
      autoLayout bt
    }
  }
}
`
    const { workspace } = parseDSL(dsl)
    expect(workspace.views.systemLandscapeViews[0].autoLayout?.direction).toBe('BT')
  })

  it('parses autoLayout lr', () => {
    const dsl = `
workspace {
  model { alice = person "Alice" }
  views {
    systemLandscape "sl" {
      autoLayout lr
    }
  }
}
`
    const { workspace } = parseDSL(dsl)
    expect(workspace.views.systemLandscapeViews[0].autoLayout?.direction).toBe('LR')
  })

  it('parses autoLayout rl', () => {
    const dsl = `
workspace {
  model { alice = person "Alice" }
  views {
    systemLandscape "sl" {
      autoLayout rl
    }
  }
}
`
    const { workspace } = parseDSL(dsl)
    expect(workspace.views.systemLandscapeViews[0].autoLayout?.direction).toBe('RL')
  })

  it('parses autoLayout with rank and node separation', () => {
    const dsl = `
workspace {
  model { alice = person "Alice" }
  views {
    systemLandscape "sl" {
      autoLayout tb 300 100
    }
  }
}
`
    const { workspace } = parseDSL(dsl)
    const layout = workspace.views.systemLandscapeViews[0].autoLayout
    expect(layout?.direction).toBe('TB')
    expect(layout?.rankSeparation).toBe(300)
    expect(layout?.nodeSeparation).toBe(100)
  })

  // ── Parse error recovery ──

  it('recovers from missing closing brace without throwing', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
`
    let result: ReturnType<typeof parseDSL> | undefined
    expect(() => { result = parseDSL(dsl) }).not.toThrow()
    expect(result).toBeDefined()
    expect(result!.workspace).toBeDefined()
  })

  it('recovers from unknown keywords without throwing', () => {
    const dsl = `
workspace {
  model {
    unknownKeyword "something"
    alice = person "Alice"
  }
}
`
    let result: ReturnType<typeof parseDSL> | undefined
    expect(() => { result = parseDSL(dsl) }).not.toThrow()
    expect(result!.workspace.model.people).toHaveLength(1)
  })

  it('returns workspace even when input is completely empty', () => {
    const { workspace } = parseDSL('')
    expect(workspace).toBeDefined()
    expect(workspace.model.people).toHaveLength(0)
  })

  it('handles input with only whitespace gracefully', () => {
    const { workspace } = parseDSL('   \n\n   ')
    expect(workspace).toBeDefined()
  })
})

// ─── DSL parser — properties blocks ────────────────────────────────

describe('DSL parser — properties blocks', () => {
  it('element with properties block does not crash the parser', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice" {
      properties {
        "team" "Platform"
      }
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.people).toHaveLength(1)
    expect(workspace.model.people[0].name).toBe('Alice')
  })

  it('workspace-level properties block does not crash the parser', () => {
    const dsl = `
workspace {
  properties {
    "owner" "Kevin"
  }
  model {
    alice = person "Alice"
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.people).toHaveLength(1)
  })

  it('relationship with empty properties block does not crash', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    myApp = softwareSystem "My App"
    alice -> myApp "uses" {
      properties {
      }
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.relationships).toHaveLength(1)
  })
})

// ─── DSL parser — styles ─────────────────────────────────────────────

describe('DSL parser — styles', () => {
  it('parses element style into views.configuration.styles.elements', () => {
    const dsl = `
workspace {
  model {
    db = softwareSystem "Database"
  }
  views {
    styles {
      element "Database" {
        background "#123456"
      }
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const styles = workspace.views.configuration.styles.elements
    expect(styles).toHaveLength(1)
    expect(styles[0].tag).toBe('Database')
    expect(styles[0].background).toBe('#123456')
  })

  it('parses relationship style into styles.relationships', () => {
    const dsl = `
workspace {
  model {}
  views {
    styles {
      relationship "Async" {
        color "#ff0000"
      }
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const relStyles = workspace.views.configuration.styles.relationships
    expect(relStyles).toHaveLength(1)
    expect(relStyles[0].tag).toBe('Async')
    expect(relStyles[0].color).toBe('#ff0000')
  })

  it('parses multiple element styles', () => {
    const dsl = `
workspace {
  model {}
  views {
    styles {
      element "Database" {
        background "#123456"
      }
      element "Queue" {
        shape "Pipe"
      }
    }
  }
}
`
    const { workspace } = parseDSL(dsl)
    expect(workspace.views.configuration.styles.elements).toHaveLength(2)
  })
})

// ─── DSL parser — directives and themes ────────────────────────────

describe('DSL parser — directives and themes', () => {
  it('unknown !directive at workspace level does not crash', () => {
    const dsl = `
workspace {
  !adrs docs/adrs
  model {
    alice = person "Alice"
  }
}
`
    let result: ReturnType<typeof parseDSL> | undefined
    expect(() => { result = parseDSL(dsl) }).not.toThrow()
    expect(result!.workspace.model.people).toHaveLength(1)
  })

  it('!include directive does not crash', () => {
    const dsl = `
workspace {
  !include model.dsl
  model {
    alice = person "Alice"
  }
}
`
    expect(() => parseDSL(dsl)).not.toThrow()
  })

  it('theme default in views block does not crash', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
  }
  views {
    theme default
  }
}
`
    let result: ReturnType<typeof parseDSL> | undefined
    expect(() => { result = parseDSL(dsl) }).not.toThrow()
    expect(result!.workspace).toBeDefined()
  })

  it('themes line in views block is captured', () => {
    const dsl = `
workspace {
  model {}
  views {
    themes "https://static.structurizr.com/themes/default/theme.json"
  }
}
`
    const { workspace } = parseDSL(dsl)
    expect(workspace.views.configuration.themes).toBeDefined()
    expect(workspace.views.configuration.themes!.length).toBeGreaterThan(0)
  })
})

// ─── DSL parser — edge cases ────────────────────────────────────────

describe('DSL parser — edge cases', () => {
  it('empty workspace DSL parses without error', () => {
    const dsl = `workspace { }`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace).toBeDefined()
    expect(workspace.model.people).toHaveLength(0)
    expect(workspace.model.softwareSystems).toHaveLength(0)
  })

  it('workspace with only model (no views) parses ok and synthesises auto views', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    sys = softwareSystem "My System"
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.people).toHaveLength(1)
    expect(workspace.model.softwareSystems).toHaveLength(1)
    // No views in the DSL → parser synthesises sensible defaults so the canvas
    // has something to render. They're flagged autoView so they don't get
    // serialized back into the source DSL.
    expect(workspace.views.systemLandscapeViews).toHaveLength(1)
    expect(workspace.views.systemLandscapeViews[0].autoView).toBe(true)
    expect(workspace.views.systemContextViews).toHaveLength(1)
    expect(workspace.views.systemContextViews[0].autoView).toBe(true)
  })

  it('nested groups in model (group inside group context)', () => {
    // The parser may not support true nesting, but shouldn't crash
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    bob = person "Bob"
    group "Outer" {
      alice
    }
    group "Inner" {
      bob
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.people).toHaveLength(2)
    // Both groups should parse independently
    expect(workspace.model.groups).toHaveLength(2)
  })

  it('containerView with explicit include elements by var name', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "System" {
      db = container "Database"
      api = container "API"
      web = container "Web App"
    }
  }
  views {
    container sys "sysContainers" {
      include db
      include api
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = workspace.views.containerViews[0]
    expect(view).toBeDefined()
    const ids = view.elements.map(e => e.id)
    expect(ids).toContain('db')
    expect(ids).toContain('api')
    // web not explicitly included
    expect(ids).not.toContain('web')
  })

  it('workspace with name string parses the name', () => {
    const dsl = `
workspace "My Architecture" {
  model {
    alice = person "Alice"
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.people).toHaveLength(1)
  })

  it('workspace with description string does not crash', () => {
    const dsl = `
workspace "My Arch" "A description of the workspace" {
  model {
    alice = person "Alice"
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.people).toHaveLength(1)
  })

  it('element with tags line parses tags', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice" {
      tags "VIP" "Admin"
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const alice = workspace.model.people[0]
    expect(alice.tags).toContain('VIP')
    expect(alice.tags).toContain('Admin')
  })

  it('softwareSystem with containers parses all containers', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "System" {
      c1 = container "Container One"
      c2 = container "Container Two"
      c3 = container "Container Three"
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const sys = workspace.model.softwareSystems[0]
    expect(sys.containers).toHaveLength(3)
  })

  it('container with components parses all components', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "System" {
      svc = container "Service" {
        ctrl = component "Controller"
        repo = component "Repository"
        svc2 = component "Service Layer"
      }
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const container = workspace.model.softwareSystems[0].containers[0]
    expect(container.components).toHaveLength(3)
  })

  it('element style with shape property is parsed', () => {
    const dsl = `
workspace {
  model {}
  views {
    styles {
      element "Database" {
        shape "Cylinder"
        background "#336791"
      }
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const style = workspace.views.configuration.styles.elements[0]
    expect(style.tag).toBe('Database')
    expect(style.shape).toBe('Cylinder')
    expect(style.background).toBe('#336791')
  })

  it('multiple views of different types parse correctly', () => {
    const dsl = `
workspace {
  model {
    user = person "User"
    sys = softwareSystem "System" {
      web = container "Web"
    }
    user -> sys "uses"
  }
  views {
    systemLandscape "landscape" {
      include *
    }
    systemContext sys "context" {
      include *
    }
    container sys "containers" {
      include *
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.views.systemLandscapeViews).toHaveLength(1)
    expect(workspace.views.systemContextViews).toHaveLength(1)
    expect(workspace.views.containerViews).toHaveLength(1)
  })

  it('relationship without description still parses', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    sys = softwareSystem "System"
    alice -> sys
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.relationships).toHaveLength(1)
    expect(workspace.model.relationships[0].sourceId).toBe('alice')
    expect(workspace.model.relationships[0].destinationId).toBe('sys')
  })

  it('container with technology string parses technology', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "System" {
      api = container "API" "Backend API" "Node.js"
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const container = workspace.model.softwareSystems[0].containers[0]
    expect(container.name).toBe('API')
    expect(container.technology).toBe('Node.js')
  })

  it('duplicate include of the same element produces exactly one element in view', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
  }
  views {
    systemLandscape "overview" {
      include alice
      include alice
      include api
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = workspace.views.systemLandscapeViews[0]
    const aliceId = workspace.model.people[0].id
    const apiId = workspace.model.softwareSystems[0].id
    // alice should appear exactly once despite being included twice
    expect(view.elements.filter(e => e.id === aliceId)).toHaveLength(1)
    expect(view.elements.filter(e => e.id === apiId)).toHaveLength(1)
    expect(view.elements).toHaveLength(2)
  })
})

describe('DSL parser — block-form tags keyword', () => {
  it('container with block tags keyword parses extra tags', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "System" {
      db = container "DB" {
        tags "Database"
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const container = workspace.model.softwareSystems[0].containers[0]
    expect(container.tags).toContain('Element')
    expect(container.tags).toContain('Container')
    expect(container.tags).toContain('Database')
  })

  it('softwareSystem with block tags keyword parses extra tags', () => {
    const dsl = `
workspace {
  model {
    ext = softwareSystem "External" {
      tags "ThirdParty"
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const sys = workspace.model.softwareSystems[0]
    expect(sys.tags).toContain('Software System')
    expect(sys.tags).toContain('ThirdParty')
  })

  it('component with block tags keyword parses extra tags', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "System" {
      api = container "API" {
        ctrl = component "Controller" {
          tags "Spring MVC"
        }
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const comp = workspace.model.softwareSystems[0].containers[0].components[0]
    expect(comp.tags).toContain('Component')
    expect(comp.tags).toContain('Spring MVC')
  })

  it('block tags with comma-separated values in a single string are each added individually', () => {
    // The serializer emits tags as "Tag1,Tag2" — a comma-separated string.
    // The parser must split on comma and add each tag separately.
    const dsl = `
workspace {
  model {
    sys = softwareSystem "System" {
      q = container "Queue" {
        tags "MessageBus,Async"
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const container = workspace.model.softwareSystems[0].containers[0]
    expect(container.tags).toContain('MessageBus')
    expect(container.tags).toContain('Async')
    // Should NOT contain the raw unsplit string
    expect(container.tags).not.toContain('MessageBus,Async')
  })

  it('block tags with inline positional tags combine correctly', () => {
    // Inline positional arg "VIP" AND block tags "Premium" — both should appear
    const dsl = `
workspace {
  model {
    alice = person "Alice" "" "VIP" {
      tags "Premium"
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const alice = workspace.model.people[0]
    expect(alice.tags).toContain('VIP')
    expect(alice.tags).toContain('Premium')
    // No duplicates
    expect(alice.tags.filter(t => t === 'VIP')).toHaveLength(1)
    expect(alice.tags.filter(t => t === 'Premium')).toHaveLength(1)
  })
})

// ─── DSL parser — sibling element loss regression ────────────────────

describe('DSL parser — unknown brace-block in element body does not lose siblings', () => {
  it('containers defined after an unknown annotation block in softwareSystem body are not lost', () => {
    // Regression: unknown identifier with a brace block inside a softwareSystem body
    // used to consume the parent closing RBRACE, discarding all subsequent containers.
    const dsl = `
workspace {
  model {
    sys = softwareSystem "Sys" {
      unknownAnnotation "value" {
        someKey "someValue"
      }
      webApp = container "Web App"
      api = container "API"
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const sys = workspace.model.softwareSystems[0]
    expect(sys.containers).toHaveLength(2)
    expect(sys.containers.map(c => c.name)).toContain('Web App')
    expect(sys.containers.map(c => c.name)).toContain('API')
  })

  it('components defined after an unknown annotation block in container body are not lost', () => {
    // Regression: same issue inside container bodies for components.
    const dsl = `
workspace {
  model {
    sys = softwareSystem "Sys" {
      api = container "API" {
        unknownAnnotation {
          flag true
        }
        auth = component "Auth"
        db = component "DB"
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const container = workspace.model.softwareSystems[0].containers[0]
    expect(container.components).toHaveLength(2)
    expect(container.components.map(c => c.name)).toContain('Auth')
    expect(container.components.map(c => c.name)).toContain('DB')
  })

  it('elements in model body after an unknown identifier brace block are not lost', () => {
    // Regression: unknown IDENTIFIER at model body level with a brace block
    // used to consume the parent workspace closing RBRACE.
    const dsl = `
workspace {
  model {
    unknownThing "value" {
      key "value"
    }
    alice = person "Alice"
    api = softwareSystem "API"
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.people).toHaveLength(1)
    expect(workspace.model.softwareSystems).toHaveLength(1)
  })

  it('view elements after an unknown annotation brace block are not lost', () => {
    // Regression: unknown keyword with a brace block inside a view body used to consume
    // the view's closing RBRACE, losing all include/exclude statements that followed.
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
  }
  views {
    systemLandscape "sl" "Landscape" {
      unknownAnnotation "value" {
        someKey "someValue"
      }
      include alice
      include api
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = workspace.views.systemLandscapeViews[0]
    expect(view.elements.some(e => e.id === 'alice')).toBe(true)
    expect(view.elements.some(e => e.id === 'api')).toBe(true)
  })
})

// ─── DSL parser — error recovery ─────────────────────────────────────

describe('DSL parser — unresolved relationship reference errors', () => {
  it('produces an error when a relationship uses an undefined source variable', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "System"
    ghost -> sys "calls"
  }
  views {}
}
`
    const { errors } = parseDSL(dsl)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some(e => /unresolved reference/i.test(e.message))).toBe(true)
  })

  it('produces an error when a relationship uses an undefined destination variable', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    alice -> ghost "calls"
  }
  views {}
}
`
    const { errors } = parseDSL(dsl)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some(e => /unresolved reference/i.test(e.message))).toBe(true)
  })

  it('still parses valid model elements despite unresolved reference errors', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
    ghost -> api "calls"
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    // The error should be recorded but parsing continues
    expect(errors.length).toBeGreaterThan(0)
    // Valid elements are still returned
    expect(workspace.model.people).toHaveLength(1)
    expect(workspace.model.softwareSystems).toHaveLength(1)
  })
})
