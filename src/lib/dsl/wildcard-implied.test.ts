/**
 * The implied relationships an `include *` static view draws (#230). The
 * expectations were checked against the Structurizr CLI's JSON export of the
 * same DSL, which lists implied relationships in each view, except where a
 * test says otherwise.
 */
import { describe, it, expect } from 'vitest'
import { parseDSL } from '@/lib/dsl'
import { wildcardImpliedRelationships } from './wildcard'
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
