/**
 * Tests for `include *` wildcard expansion in view definitions.
 * Before this fix, `include *` left a literal `{ id: '*' }` in view.elements,
 * which the Canvas skipped, resulting in empty views when importing DSL files.
 */
import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import type { Workspace, View } from '@/types/model'

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

  it('container include * shows the other system, not its container, for a cross-system relationship', () => {
    // When a container in the scoped system calls a container in another system,
    // Structurizr's implied relationships connect the scoped container to the
    // other SYSTEM, and that is what `include *` adds — never the foreign
    // container itself (#230).
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
    const otherApp = workspace.model.softwareSystems.find(s => s.name === 'Other App')!
    const dbId = otherApp.containers[0].id
    // The scoped container should appear
    expect(view.elements.some(e => e.id === apiId)).toBe(true)
    // The related container's system appears in its place
    expect(view.elements.some(e => e.id === otherApp.id)).toBe(true)
    expect(view.elements.some(e => e.id === dbId)).toBe(false)
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

describe('include * round-trips through a save (#230)', () => {
  // The issue's fixture: Structurizr shows [User, Web, Database, System B] —
  // User through its relationship to a component of Web, System B through
  // Web's relationship to one of its containers.
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
        web -> api "Calls"
    }
    views {
        container a "ContainersA" {
            include *
            autolayout lr
        }
    }
}
`

  function names(ws: Workspace, view: View): string[] {
    const byId = new Map<string, string>()
    for (const p of ws.model.people) byId.set(p.id, p.name)
    for (const s of ws.model.softwareSystems) {
      byId.set(s.id, s.name)
      for (const c of s.containers) {
        byId.set(c.id, c.name)
        for (const comp of c.components) byId.set(comp.id, comp.name)
      }
    }
    return view.elements.map(e => byId.get(e.id) ?? e.id).sort()
  }

  /** The trimmed lines inside the view block whose header contains `header`. */
  function viewBody(dsl: string, header: string): string[] {
    const lines = dsl.split('\n').map(l => l.trim())
    const start = lines.findIndex(l => l.includes(header) && l.endsWith('{'))
    expect(start).toBeGreaterThanOrEqual(0)
    const end = lines.indexOf('}', start)
    return lines.slice(start + 1, end)
  }

  function parseClean(dsl: string): Workspace {
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    return workspace
  }

  it('container include * matches Structurizr on the issue fixture', () => {
    const ws = parseClean(ISSUE_DSL)
    const view = ws.views.containerViews[0]
    expect(view.includeAll).toBe(true)
    expect(names(ws, view)).toEqual(['Database', 'System B', 'User', 'Web'])
  })

  it('container include * promotes another system\'s component to its system and ignores the scope system\'s own relationships', () => {
    const ws = parseClean(`
workspace {
    model {
        user = person "User"
        admin = person "Admin"
        a = softwareSystem "System A" {
            web = container "Web" {
                ctrl = component "Controller"
            }
        }
        b = softwareSystem "System B" {
            api = container "B API" {
                bctl = component "B Controller"
            }
        }
        c = softwareSystem "System C"
        bctl -> ctrl "Calls back"
        admin -> a "Administers"
        user -> api "Uses"
        a -> c "Feeds"
    }
    views {
        container a "ContainersA" {
            include *
        }
    }
}
`)
    // admin, user and System C only relate to the system itself or to another
    // system's container — Structurizr's container view leaves them out.
    expect(names(ws, ws.views.containerViews[0])).toEqual(['System B', 'Web'])
  })

  it('writes include * back for container, system context, landscape and component views', () => {
    const dsl = `
workspace {
    model {
        user = person "User"
        a = softwareSystem "System A" {
            web = container "Web" {
                ctrl = component "Controller"
            }
            db = container "Database"
        }
        user -> ctrl "Uses"
        web -> db "Reads from"
    }
    views {
        systemLandscape "Landscape" {
            include *
        }
        systemContext a "Context" {
            include *
        }
        container a "Containers" {
            include *
        }
        component web "Components" {
            include *
        }
    }
}
`
    const first = parseClean(dsl)
    const saved = serializeDSL(first)
    for (const key of ['Landscape', 'Context', 'Containers', 'Components']) {
      expect(viewBody(saved, `"${key}"`)).toEqual(['include *'])
    }
    const second = parseClean(saved)
    const viewsOf = (ws: Workspace) => [
      ...ws.views.systemLandscapeViews,
      ...ws.views.systemContextViews,
      ...ws.views.containerViews,
      ...ws.views.componentViews,
    ]
    expect(viewsOf(second).map(v => names(second, v))).toEqual(viewsOf(first).map(v => names(first, v)))
    expect(viewsOf(second).every(v => v.includeAll)).toBe(true)
  })

  it('keeps an explicit include written alongside include *', () => {
    const ws = parseClean(ISSUE_DSL
      .replace('user = person "User"\n', 'user = person "User"\n        ops = person "Ops"\n')
      .replace('include *\n', 'include *\n            include ops\n'))
    expect(names(ws, ws.views.containerViews[0])).toEqual(['Database', 'Ops', 'System B', 'User', 'Web'])

    const saved = serializeDSL(ws)
    expect(viewBody(saved, '"ContainersA"')).toEqual(['include *', 'include ops', 'autoLayout lr'])
    const reparsed = parseClean(saved)
    expect(names(reparsed, reparsed.views.containerViews[0])).toEqual(names(ws, ws.views.containerViews[0]))
  })

  it('round-trips include * plus an element exclude', () => {
    const ws = parseClean(ISSUE_DSL.replace('include *\n', 'include *\n            exclude user\n'))
    expect(names(ws, ws.views.containerViews[0])).toEqual(['Database', 'System B', 'Web'])

    const saved = serializeDSL(ws)
    expect(viewBody(saved, '"ContainersA"')).toEqual(['include *', 'exclude user', 'autoLayout lr'])
    const reparsed = parseClean(saved)
    expect(names(reparsed, reparsed.views.containerViews[0])).toEqual(['Database', 'System B', 'Web'])
  })

  it('saves an element hidden from a wildcard view as an exclude', () => {
    const ws = parseClean(ISSUE_DSL)
    const view = ws.views.containerViews[0]
    // What hiding it on the canvas does (removeElementsFromView).
    view.elements = view.elements.filter(e => e.id !== 'db')
    view.excludedElementIds = ['db']

    const saved = serializeDSL(ws)
    expect(viewBody(saved, '"ContainersA"')).toEqual(['include *', 'exclude db', 'autoLayout lr'])
    const reparsed = parseClean(saved)
    expect(names(reparsed, reparsed.views.containerViews[0])).toEqual(['System B', 'User', 'Web'])
  })

  it('does not save an element the canvas has not picked up yet as hidden', () => {
    const ws = parseClean(ISSUE_DSL)
    // A relationship drawn in another view makes Ops eligible here; the view
    // has not been re-expanded. Structurizr shows Ops, and so does c4hero
    // once the file is reopened: nothing hides it.
    ws.model.people.push({ id: 'ops', type: 'person', name: 'Ops', tags: ['Element', 'Person'], properties: {} })
    ws.model.relationships.push({ id: 'r-ops', sourceId: 'ops', destinationId: 'ctrl', tags: ['Relationship'], properties: {} })

    const saved = serializeDSL(ws)
    expect(viewBody(saved, '"ContainersA"')).toEqual(['include *', 'autoLayout lr'])
    expect(names(parseClean(saved), parseClean(saved).views.containerViews[0])).toContain('Ops')
  })

  it('keeps an author include and exclude even where c4hero\'s expansion makes them look redundant', () => {
    // `!impliedRelationships false` is not modelled, so c4hero's wildcard
    // adds User and System B here and Structurizr's adds neither: the
    // explicit include is what shows User in Structurizr. Both lines are
    // written back as the author wrote them.
    const ws = parseClean(ISSUE_DSL
      .replace('include *\n', 'include *\n            include user\n            exclude b\n')
      .replace('    model {', '    !impliedRelationships false\n    model {'))
    const saved = serializeDSL(ws)
    expect(viewBody(saved, '"ContainersA"')).toEqual(['include *', 'exclude b', 'include user', 'autoLayout lr'])
  })

  it('applies include and exclude lines in order, as Structurizr does', () => {
    const shown = (body: string) => {
      const ws = parseClean(ISSUE_DSL.replace('include *\n', body))
      return names(ws, ws.views.containerViews[0])
    }
    // A later include brings an excluded element back; an exclude only
    // removes what the view holds so far.
    expect(shown('include *\n            exclude user\n            include user\n')).toContain('User')
    expect(shown('exclude user\n            include *\n')).toContain('User')
    expect(shown('include *\n            exclude user\n            include user\n            exclude user\n')).not.toContain('User')
    // Hiding System B makes room for its container.
    expect(shown('include *\n            exclude b\n            include api\n')).toEqual(['B API', 'Database', 'User', 'Web'])
  })

  it('keeps only the excludes that hide something from the wildcard', () => {
    const recorded = (body: string) => {
      const ws = parseClean(ISSUE_DSL.replace('include *\n', body))
      return ws.views.containerViews[0].excludedElementIds
    }
    expect(recorded('include *\n            exclude user\n')).toEqual(['user'])
    // Before the wildcard, or undone by a later include, an exclude hides
    // nothing in Structurizr, so a later edit must not make it hide anything.
    expect(recorded('exclude user\n            include *\n')).toBeUndefined()
    expect(recorded('include *\n            exclude user\n            include user\n')).toBeUndefined()

    const ws = parseClean(ISSUE_DSL.replace('include *\n', 'exclude user\n            include *\n'))
    expect(viewBody(serializeDSL(ws), '"ContainersA"')).toEqual(['include *', 'autoLayout lr'])
  })

  it('saves a hidden container next to one of its components so Structurizr shows the component', () => {
    const ws = parseClean(`
workspace {
    model {
        user = person "User"
        a = softwareSystem "System A" {
            web = container "Web" {
                ctrl = component "Controller"
            }
            db = container "Database" {
                repo = component "Repo"
            }
        }
        user -> ctrl "Uses"
        ctrl -> db "Reads from"
    }
    views {
        component web "Components" {
            include *
            exclude db
            include repo
        }
    }
}
`)
    expect(names(ws, ws.views.componentViews[0])).toEqual(['Controller', 'Repo', 'User'])
    const saved = serializeDSL(ws)
    expect(viewBody(saved, '"Components"')).toEqual(['include *', 'exclude db', 'include repo'])
    const reparsed = parseClean(saved)
    expect(names(reparsed, reparsed.views.componentViews[0])).toEqual(['Controller', 'Repo', 'User'])
  })

  it('excludes a container a new relationship brings in next to one of its shown components', () => {
    // Repo shows in Database's place. Once a relationship makes the wildcard
    // add Database, Structurizr would keep Database and skip `include repo`
    // (and Repo before `include *` is an error there), so the save hides
    // Database first, whichever edit added the relationship.
    const ws = parseClean(`
workspace {
    model {
        user = person "User"
        a = softwareSystem "System A" {
            web = container "Web" {
                ctrl = component "Controller"
            }
            db = container "Database" {
                repo = component "Repo"
            }
        }
        user -> ctrl "Uses"
    }
    views {
        component web "Components" {
            include *
            include repo
        }
    }
}
`)
    expect(names(ws, ws.views.componentViews[0])).toEqual(['Controller', 'Repo', 'User'])
    ws.model.relationships.push({ id: 'ctrlDb', sourceId: 'ctrl', destinationId: 'db', description: 'Reads from', tags: ['Relationship'], properties: {} })

    const saved = serializeDSL(ws)
    expect(viewBody(saved, '"Components"')).toEqual(['include *', 'exclude db', 'include repo'])
    const reparsed = parseClean(saved)
    expect(names(reparsed, reparsed.views.componentViews[0])).toEqual(['Controller', 'Repo', 'User'])
    expect(serializeDSL(reparsed)).toBe(saved)
  })

  it('writes an element whose parent the wildcard adds before include *, where Structurizr keeps it', () => {
    // Structurizr skips an element whose parent or child is already in the
    // view: `include api` first shows B API and keeps System B out.
    const ws = parseClean(ISSUE_DSL.replace('include *\n', 'include api\n            include *\n'))
    expect(names(ws, ws.views.containerViews[0])).toEqual(['B API', 'Database', 'User', 'Web'])

    const saved = serializeDSL(ws)
    expect(viewBody(saved, '"ContainersA"')).toEqual(['include api', 'include *', 'autoLayout lr'])
    const reparsed = parseClean(saved)
    expect(names(reparsed, reparsed.views.containerViews[0])).toEqual(['B API', 'Database', 'User', 'Web'])

    // The other way round, the wildcard's System B comes first and the
    // container is skipped, as in Structurizr.
    const late = parseClean(ISSUE_DSL.replace('include *\n', 'include *\n            include api\n'))
    expect(names(late, late.views.containerViews[0])).toEqual(['Database', 'System B', 'User', 'Web'])
  })

  it('drops a recorded exclude once its element is gone, and never writes one for a shown element', () => {
    const ws = parseClean(ISSUE_DSL.replace('include *\n', 'include *\n            exclude user\n            exclude db\n'))
    const view = ws.views.containerViews[0]
    expect(view.excludedElementIds).toEqual(['user', 'db'])
    // user is deleted from the model; db is shown again.
    ws.model.people = []
    ws.model.relationships = ws.model.relationships.filter(r => r.sourceId !== 'user')
    view.elements.push({ id: 'db' })
    expect(viewBody(serializeDSL(ws), '"ContainersA"')).toEqual(['include *', 'autoLayout lr'])
  })

  it('keeps plain include * when a container is added to the scoped system', () => {
    const ws = parseClean(ISSUE_DSL)
    // What addContainer does: the model gains the container and every
    // container view of its system shows it.
    ws.model.softwareSystems[0].containers.push({
      id: 'cache', type: 'container', name: 'Cache', tags: ['Element', 'Container'], properties: {}, components: [],
    })
    ws.views.containerViews[0].elements.push({ id: 'cache' })

    const saved = serializeDSL(ws)
    expect(viewBody(saved, '"ContainersA"')).toEqual(['include *', 'autoLayout lr'])
    const reparsed = parseClean(saved)
    expect(names(reparsed, reparsed.views.containerViews[0])).toEqual(['Cache', 'Database', 'System B', 'User', 'Web'])
  })

  it('saves an element the wildcard would not add as its own include', () => {
    const ws = parseClean(ISSUE_DSL)
    // A person dropped onto the view with no relationship yet.
    ws.model.people.push({ id: 'ops', type: 'person', name: 'Ops', tags: ['Element', 'Person'], properties: {} })
    ws.views.containerViews[0].elements.push({ id: 'ops' })

    const saved = serializeDSL(ws)
    expect(viewBody(saved, '"ContainersA"')).toEqual(['include *', 'include ops', 'autoLayout lr'])
    const reparsed = parseClean(saved)
    expect(names(reparsed, reparsed.views.containerViews[0])).toContain('Ops')
  })
})

describe('include * adds what Structurizr adds (#230)', () => {
  // Checked against the Structurizr CLI export, with implied relationships on
  // (its default). Each case is one model with different relationships.
  function views(relationships: string) {
    const { workspace: ws, errors } = parseDSL(`
workspace {
    model {
        user = person "User"
        a = softwareSystem "System A" {
            web = container "Web" {
                ctrl = component "Controller"
                svc = component "Service"
            }
            db = container "Database" {
                repo = component "Repo"
            }
            worker = container "Worker" {
                job = component "Job"
            }
        }
        b = softwareSystem "System B" {
            api = container "B API" {
                bctl = component "B Controller"
            }
            bdb = container "B DB"
        }
        ${relationships}
    }
    views {
        systemContext a "Context" {
            include *
        }
        container a "Containers" {
            include *
        }
        component web "Components" {
            include *
        }
    }
}
`)
    expect(errors).toEqual([])
    const byId = new Map<string, string>()
    for (const p of ws.model.people) byId.set(p.id, p.name)
    for (const sys of ws.model.softwareSystems) {
      byId.set(sys.id, sys.name)
      for (const c of sys.containers) {
        byId.set(c.id, c.name)
        for (const comp of c.components) byId.set(comp.id, comp.name)
      }
    }
    const shown = (v: View) => v.elements.map(e => byId.get(e.id) ?? e.id).sort()
    return {
      context: shown(ws.views.systemContextViews[0]),
      containers: shown(ws.views.containerViews[0]),
      components: shown(ws.views.componentViews[0]),
    }
  }

  it.each([
    ['ctrl -> api', ['System A', 'System B']],
    ['ctrl -> bctl', ['System A', 'System B']],
    ['bctl -> ctrl', ['System A', 'System B']],
    ['web -> api', ['System A', 'System B']],
    ['a -> api', ['System A', 'System B']],
    ['user -> ctrl', ['System A', 'User']],
    ['user -> api', ['System A']],
    ['ctrl -> db', ['System A']],
  ])('system context: %s', (rel, expected) => {
    expect(views(`${rel} "Uses"`).context).toEqual(expected)
  })

  it.each([
    ['ctrl -> api', ['Controller', 'Service', 'System B']],
    ['ctrl -> bctl', ['Controller', 'Service', 'System B']],
    ['bctl -> ctrl', ['Controller', 'Service', 'System B']],
    ['ctrl -> b', ['Controller', 'Service', 'System B']],
    ['ctrl -> db', ['Controller', 'Database', 'Service']],
    ['ctrl -> repo', ['Controller', 'Database', 'Service']],
    ['repo -> ctrl', ['Controller', 'Database', 'Service']],
    ['db -> ctrl', ['Controller', 'Database', 'Service']],
    ['ctrl -> user', ['Controller', 'Service', 'User']],
    ['user -> web', ['Controller', 'Service']],
    ['web -> api', ['Controller', 'Service']],
    ['ctrl -> svc', ['Controller', 'Service']],
  ])('component: %s', (rel, expected) => {
    expect(views(`${rel} "Uses"`).components).toEqual(expected)
  })

  it('component: two containers of another system show that system once', () => {
    expect(views('ctrl -> api "Uses"\n        svc -> bdb "Uses"').components).toEqual(['Controller', 'Service', 'System B'])
  })

  it('component: a sibling container and one of its components show that container once', () => {
    expect(views('ctrl -> db "Uses"\n        ctrl -> repo "Uses"').components).toEqual(['Controller', 'Database', 'Service'])
    expect(views('ctrl -> job "Uses"\n        svc -> worker "Uses"').components).toEqual(['Controller', 'Service', 'Worker'])
  })

  it('container: the scoped system\'s own relationships do not count', () => {
    expect(views('a -> b "Uses"\n        user -> a "Uses"').containers).toEqual(['Database', 'Web', 'Worker'])
    expect(views('bctl -> ctrl "Uses"').containers).toEqual(['Database', 'System B', 'Web', 'Worker'])
  })
})
