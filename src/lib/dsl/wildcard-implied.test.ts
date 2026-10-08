/**
 * The implied relationships an `include *` static view draws (#230). The
 * expectations were checked against the Structurizr CLI's JSON export of the
 * same DSL, which lists implied relationships in each view, except where a
 * test says otherwise.
 */
import { describe, it, expect } from 'vitest'
import { parseDSL } from '@/lib/dsl'
import { modelImpliedRelationships, wildcardImpliedRelationships } from './wildcard'
import { serialize } from './serializer'
import type { View, Workspace } from '@/types/model'

/** The DSL from #230: relationships declared below the level the views show. */
const ISSUE_DSL = `
workspace "Container view include *" {
  model {
    user = person "User"
    a = softwareSystem "System A" {
      web = container "Web" {
        ctrl = component "Controller"
      }
      db = container "Database"
    }
    b = softwareSystem "System B" {
      api = container "B API"
    }
    user -> ctrl "Uses"
    web -> db "Reads from"
    web -> api "Calls" "HTTPS"
  }
  views {
    systemLandscape "Landscape" {
      include *
    }
    systemContext a "ContextA" {
      include *
    }
    container a "ContainersA" {
      include *
    }
    component web "ComponentsWeb" {
      include *
    }
  }
}`

function load(dsl: string): Workspace {
  const { workspace, errors } = parseDSL(dsl)
  expect(errors).toHaveLength(0)
  return workspace
}

function viewOf(ws: Workspace, key: string): View {
  const views = [
    ...ws.views.systemLandscapeViews,
    ...ws.views.systemContextViews,
    ...ws.views.containerViews,
    ...ws.views.componentViews,
    ...(ws.views.dynamicViews ?? []),
    ...(ws.views.deploymentViews ?? []),
  ]
  return views.find(v => v.key === key)!
}

function nameOf(ws: Workspace, id: string): string {
  for (const p of ws.model.people) if (p.id === id) return p.name
  for (const s of ws.model.softwareSystems) {
    if (s.id === id) return s.name
    for (const c of s.containers) {
      if (c.id === id) return c.name
      for (const comp of c.components) if (comp.id === id) return comp.name
    }
  }
  return id
}

/** `Source -> Destination 'description'` for each implied relationship. */
function implied(ws: Workspace, key: string): string[] {
  return wildcardImpliedRelationships(ws.model, viewOf(ws, key))
    .map(r => `${nameOf(ws, r.sourceId)} -> ${nameOf(ws, r.destinationId)} '${r.relationship.description ?? ''}'`)
}

/** Two systems, a container in each, and the given relationship lines. */
function twoSystems(relationships: string, views = `
    systemContext a "Context" {
      include *
    }
    container a "Containers" {
      include *
    }`): Workspace {
  return load(`
workspace {
  model {
    a = softwareSystem "System A" {
      web = container "Web"
    }
    b = softwareSystem "System B" {
      api = container "B API"
      api2 = container "B API 2"
    }
${relationships}
  }
  views {${views}
  }
}`)
}

describe('wildcardImpliedRelationships', () => {
  it('draws the issue\'s container view relationships at the level it shows', () => {
    const ws = load(ISSUE_DSL)
    expect(implied(ws, 'ContainersA')).toEqual([
      "User -> Web 'Uses'",
      "Web -> System B 'Calls'",
    ])
  })

  it('implies system level relationships in context and landscape views', () => {
    const ws = load(ISSUE_DSL)
    const systemLevel = ["User -> System A 'Uses'", "System A -> System B 'Calls'"]
    expect(implied(ws, 'ContextA')).toEqual(systemLevel)
    expect(implied(ws, 'Landscape')).toEqual(systemLevel)
  })

  it('implies a component view\'s relationships to sibling containers and other systems', () => {
    const ws = load(`
workspace {
  model {
    user = person "User"
    a = softwareSystem "System A" {
      web = container "Web" {
        ctrl = component "Controller"
      }
      db = container "Database"
      worker = container "Worker" {
        job = component "Job"
      }
    }
    b = softwareSystem "System B" {
      api = container "B API" {
        ep = component "Endpoint"
      }
    }
    user -> ctrl "Uses"
    ctrl -> db "Reads"
    ctrl -> ep "Calls"
    db -> api "Replicates"
    job -> ctrl "Triggers"
    job -> db "Job writes"
  }
  views {
    component web "Components" {
      include *
    }
  }
}`)
    // Structurizr shows Database and Worker (sibling containers) and System B
    // (another system), and also draws the implied relationships between
    // two of those shown elements, like Database -> System B.
    expect(implied(ws, 'Components')).toEqual([
      "Controller -> System B 'Calls'",
      "Database -> System B 'Replicates'",
      "Worker -> Controller 'Triggers'",
      "Worker -> Database 'Job writes'",
    ])
  })

  it('names a pair after the first relationship that implies it', () => {
    const ws = twoSystems(`
    web -> api "First" "HTTP"
    web -> api2 "Second" "gRPC"`)
    const [first] = wildcardImpliedRelationships(ws.model, viewOf(ws, 'Containers'))
    expect(implied(ws, 'Containers')).toEqual(["Web -> System B 'First'"])
    expect(first.relationship.technology).toBe('HTTP')
  })

  it('implies nothing over an explicit relationship declared first', () => {
    const ws = twoSystems(`
    a -> b "Explicit"
    web -> api "Calls"`)
    expect(implied(ws, 'Context')).toEqual([])
    expect(implied(ws, 'Containers')).toEqual(["Web -> System B 'Calls'"])
  })

  it('keeps the implied relationship next to an explicit one declared later', () => {
    // Structurizr creates the implied relationship when `web -> api` is
    // declared and the explicit one beside it afterwards: both are drawn.
    const ws = twoSystems(`
    web -> api "Calls"
    a -> b "Explicit"`)
    expect(implied(ws, 'Context')).toEqual(["System A -> System B 'Calls'"])
  })

  it('is directional: a relationship the other way does not stand in for it', () => {
    const ws = twoSystems(`
    b -> a "Back"
    web -> api "Calls"
    api -> web "Callback"`)
    expect(implied(ws, 'Context')).toEqual(["System A -> System B 'Calls'"])
    expect(implied(ws, 'Containers')).toEqual([
      "Web -> System B 'Calls'",
      "System B -> Web 'Callback'",
    ])
  })

  it('still draws an implied relationship when the one it comes from is excluded', () => {
    const ws = twoSystems('    web -> api "Calls"', `
    container a "Containers" {
      include *
      exclude "web -> api"
    }`)
    expect(implied(ws, 'Containers')).toEqual(["Web -> System B 'Calls'"])
  })

  it('leaves out an implied relationship whose pair the view excludes', () => {
    // `exclude "a -> b"` removes every relationship from a to b in
    // Structurizr, the implied one included.
    const ws = twoSystems(`
    web -> api "Calls"
    a -> b "Explicit"`, `
    systemContext a "Context" {
      include *
      exclude "a -> b"
    }`)
    expect(implied(ws, 'Context')).toEqual([])
  })

  it('draws none in a view without include *, or in dynamic and deployment views', () => {
    // Structurizr does draw User -> Web in the `Explicit` view too; views
    // with their own include lists keep drawing only the relationships they
    // list, as before #230, until they get the same treatment.
    const ws = load(`
workspace {
  model {
    user = person "User"
    a = softwareSystem "System A" {
      web = container "Web" {
        ctrl = component "Controller"
      }
    }
    user -> ctrl "Uses"
    deploymentEnvironment "Live" {
      deploymentNode "Server" {
        containerInstance web
      }
    }
  }
  views {
    container a "Explicit" {
      include user web
    }
    dynamic a "Flow" {
      user -> web "Uses"
    }
    deployment a "Live" "Deployed" {
      include *
    }
  }
}`)
    expect(implied(ws, 'Explicit')).toEqual([])
    expect(implied(ws, 'Flow')).toEqual([])
    expect(implied(ws, 'Deployed')).toEqual([])
  })

  it('gives each implied relationship an id no model relationship has', () => {
    const ws = twoSystems('    web -> api "Calls"')
    const view = viewOf(ws, 'Containers')
    const [first] = wildcardImpliedRelationships(ws.model, view)
    // A relationship that happens to carry that id (an imported workspace
    // could) must not share an edge id with the implied one.
    ws.model.relationships.push({ id: first.id, sourceId: 'b', destinationId: 'a', tags: ['Relationship'], properties: {} })
    const ids = wildcardImpliedRelationships(ws.model, view).map(r => r.id)
    expect(ids).toHaveLength(1)
    expect(ws.model.relationships.map(r => r.id)).not.toContain(ids[0])
  })
})

/** The model of the review fixture: two relationships below the level the
 *  context and container views show, a component next to its container's
 *  own relationship to the same container, and a person-to-system one. */
function excludesWorkspace(views: string): Workspace {
  return load(`
workspace {
  model {
    user = person "User"
    a = softwareSystem "System A" {
      web = container "Web" {
        ctrl = component "Controller"
        svc = component "Service"
      }
      db = container "Database"
    }
    b = softwareSystem "System B" {
      api = container "B API"
    }
    user -> ctrl "Uses"
    svc -> db "Service reads"
    web -> db "Web reads"
    web -> api "Calls"
    user -> b "Direct"
  }
  views {${views}
  }
}`)
}

/** Every arrow view `key` draws: the relationships it lists, then the
 *  implied ones, each as `Source -> Destination 'description'`, sorted. */
function arrows(ws: Workspace, key: string): string[] {
  const view = viewOf(ws, key)
  const listed = view.relationships.map(r => ws.model.relationships.find(m => m.id === r.id)!)
    .map(r => `${nameOf(ws, r.sourceId)} -> ${nameOf(ws, r.destinationId)} '${r.description ?? ''}'`)
  return [...listed, ...implied(ws, key)].sort()
}

/** The trimmed `exclude` lines of the view whose header names `key`. */
function excludeLines(dsl: string, key: string): string[] {
  const lines = dsl.split('\n').map(l => l.trim())
  const start = lines.findIndex(l => l.includes(`"${key}"`) && l.endsWith('{'))
  return lines.slice(start + 1, lines.indexOf('}', start)).filter(l => l.startsWith('exclude '))
}

describe('relationship excludes in include * views (#230)', () => {
  // Each expectation is what the Structurizr CLI's JSON export lists for the
  // same view: an `exclude "a -> b"` line applies to implied relationships
  // too, `*` stands for any element, and each end must match exactly.
  const VIEWS = `
    systemContext a "XAll" {
      include *
      exclude "* -> *"
    }
    container a "CAll" {
      include *
      exclude "* -> *"
    }
    systemContext a "XUser" {
      include *
      exclude "user -> *"
    }
    systemContext a "XAB" {
      include *
      exclude "a -> b"
    }
    systemContext a "XUserCtrl" {
      include *
      exclude "user -> ctrl"
    }
    container a "CWebB" {
      include *
      exclude "web -> b"
    }
    container a "CStarB" {
      include *
      exclude "* -> b"
    }
    container a "CWebDb" {
      include *
      exclude "web -> db"
    }
    container a "CUserWeb" {
      include *
      exclude "user -> web"
    }
    container a "CAB" {
      include *
      exclude "a -> b"
    }`

  it('hides every arrow with * -> *, implied ones included', () => {
    const ws = excludesWorkspace(VIEWS)
    expect(arrows(ws, 'XAll')).toEqual([])
    expect(arrows(ws, 'CAll')).toEqual([])
  })

  it('hides what a wildcard end matches, and nothing else', () => {
    const ws = excludesWorkspace(VIEWS)
    expect(arrows(ws, 'XUser')).toEqual(["System A -> System B 'Calls'"])
    expect(arrows(ws, 'CStarB')).toEqual([
      "User -> Web 'Uses'",
      "Web -> Database 'Service reads'",
      "Web -> Database 'Web reads'",
    ])
  })

  it('hides an implied pair that no model relationship has', () => {
    const ws = excludesWorkspace(VIEWS)
    expect(arrows(ws, 'XAB')).toEqual(["User -> System A 'Uses'", "User -> System B 'Direct'"])
    expect(arrows(ws, 'CWebB')).toEqual([
      "User -> System B 'Direct'",
      "User -> Web 'Uses'",
      "Web -> Database 'Service reads'",
      "Web -> Database 'Web reads'",
    ])
    expect(arrows(ws, 'CUserWeb')).toEqual([
      "User -> System B 'Direct'",
      "Web -> Database 'Service reads'",
      "Web -> Database 'Web reads'",
      "Web -> System B 'Calls'",
    ])
  })

  it('hides an implied relationship next to the explicit one between the same pair', () => {
    const ws = excludesWorkspace(VIEWS)
    expect(arrows(ws, 'CWebDb')).toEqual([
      "User -> System B 'Direct'",
      "User -> Web 'Uses'",
      "Web -> System B 'Calls'",
    ])
  })

  it('matches each end exactly, not an element inside it', () => {
    const ws = excludesWorkspace(VIEWS)
    // Neither hides the arrows that `user -> ctrl` or `web -> api` imply.
    expect(arrows(ws, 'XUserCtrl')).toEqual([
      "System A -> System B 'Calls'",
      "User -> System A 'Uses'",
      "User -> System B 'Direct'",
    ])
    expect(arrows(ws, 'CAB')).toContain("Web -> System B 'Calls'")
  })

  it('saves each line as written', () => {
    const ws = excludesWorkspace(VIEWS)
    const saved = serialize(ws)
    expect(excludeLines(saved, 'XAll')).toEqual(['exclude "* -> *"'])
    expect(excludeLines(saved, 'CAll')).toEqual(['exclude "* -> *"'])
    expect(excludeLines(saved, 'XUser')).toEqual(['exclude "user -> *"'])
    expect(excludeLines(saved, 'XAB')).toEqual(['exclude "a -> b"'])
    expect(excludeLines(saved, 'CWebB')).toEqual(['exclude "web -> b"'])
    expect(excludeLines(saved, 'CStarB')).toEqual(['exclude "* -> b"'])
    expect(excludeLines(saved, 'CUserWeb')).toEqual(['exclude "user -> web"'])

    const reloaded = load(saved)
    for (const key of ['XAll', 'CAll', 'XUser', 'XAB', 'XUserCtrl', 'CWebB', 'CStarB', 'CWebDb', 'CUserWeb', 'CAB']) {
      expect(arrows(reloaded, key)).toEqual(arrows(ws, key))
    }
  })

  it('saves a relationship hidden on the canvas next to the view\'s lines, once', () => {
    const ws = excludesWorkspace(VIEWS)
    const direct = ws.model.relationships.find(r => r.description === 'Direct')!
    // Hidden on the canvas, as removeRelationshipFromView records it.
    for (const key of ['XAB', 'CStarB']) {
      const view = viewOf(ws, key)
      view.relationships = view.relationships.filter(r => r.id !== direct.id)
      view.excludedRelationshipIds = [...new Set([...view.excludedRelationshipIds ?? [], direct.id])]
    }
    const saved = serialize(ws)
    expect(excludeLines(saved, 'XAB')).toEqual(['exclude "a -> b"', 'exclude "user -> b"'])
    // `* -> b` already hides it, so it gets no line of its own.
    expect(excludeLines(saved, 'CStarB')).toEqual(['exclude "* -> b"'])
  })

  it('keeps a line in a view with its own include list', () => {
    const ws = excludesWorkspace(`
    systemContext a "Listed" {
      include user a b
      exclude "* -> *"
    }`)
    expect(arrows(ws, 'Listed')).toEqual([])
    expect(excludeLines(serialize(ws), 'Listed')).toEqual(['exclude "* -> *"'])
  })
})

describe('modelImpliedRelationships', () => {
  it('works the implied relationships out once per model', () => {
    const ws = twoSystems('    web -> api "Calls"')
    const first = modelImpliedRelationships(ws.model)
    expect(modelImpliedRelationships(ws.model)).toBe(first)
    // A store edit replaces the relationship list…
    const edited = { ...ws.model, relationships: [...ws.model.relationships] }
    expect(modelImpliedRelationships(edited)).not.toBe(first)
    expect(modelImpliedRelationships(edited)).toEqual(first)
    // …or the software systems, when the hierarchy changes.
    const moved = { ...ws.model, softwareSystems: [...ws.model.softwareSystems] }
    expect(modelImpliedRelationships(moved)).not.toBe(first)
  })

  it('notices a relationship pushed in place', () => {
    const ws = twoSystems('    web -> api "Calls"')
    // web -> api implies Web -> System B, System A -> B API and System A -> System B.
    expect(modelImpliedRelationships(ws.model)).toHaveLength(3)
    ws.model.relationships.push({ id: 'back', sourceId: 'api', destinationId: 'web', description: 'Back', tags: ['Relationship'], properties: {} })
    expect(modelImpliedRelationships(ws.model)).toHaveLength(6)
  })
})
