import { describe, it, expect } from 'vitest'
import { parseDSL } from '@/lib/dsl'
import { serialize } from '@/lib/dsl/serializer'
import type { View, Workspace } from '@/types/model'

describe('view description roundtrip', () => {
  it('systemLandscape view description survives serialize → parse', () => {
    const dsl = `
workspace "Test" {
  model {
    alice = person "Alice"
  }
  views {
    systemLandscape "sl1" "Landscape" {
      description "All software systems and their users."
      include alice
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.views.systemLandscapeViews[0].description).toBe('All software systems and their users.')

    const dsl2 = serialize(workspace)
    expect(dsl2).toContain('description "All software systems and their users."')

    const { workspace: ws2, errors: errors2 } = parseDSL(dsl2)
    expect(errors2).toEqual([])
    expect(ws2.views.systemLandscapeViews[0].description).toBe('All software systems and their users.')
  })

  it('systemContext view description survives serialize → parse', () => {
    const dsl = `
workspace {
  model {
    api = softwareSystem "API"
    alice = person "Alice"
    alice -> api "Uses"
  }
  views {
    systemContext api "ctx1" "API Context" {
      description "Context for the API system."
      include *
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.views.systemContextViews[0].description).toBe('Context for the API system.')

    const dsl2 = serialize(workspace)
    const { workspace: ws2, errors: errors2 } = parseDSL(dsl2)
    expect(errors2).toEqual([])
    expect(ws2.views.systemContextViews[0].description).toBe('Context for the API system.')
  })

  it('container view description survives serialize → parse', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "System" {
      webApp = container "Web App"
    }
  }
  views {
    container sys "containers1" "System Containers" {
      description "All containers in the system."
      include webApp
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.views.containerViews[0].description).toBe('All containers in the system.')

    const dsl2 = serialize(workspace)
    expect(dsl2).toContain('description "All containers in the system."')

    const { workspace: ws2, errors: errors2 } = parseDSL(dsl2)
    expect(errors2).toEqual([])
    expect(ws2.views.containerViews[0].description).toBe('All containers in the system.')
  })

  it('component view description survives serialize → parse', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "System" {
      api = container "API" {
        auth = component "Auth Service"
      }
    }
  }
  views {
    component api "apiComponents" "API Components" {
      description "Internal components of the API container."
      include auth
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.views.componentViews[0].description).toBe('Internal components of the API container.')

    const dsl2 = serialize(workspace)
    expect(dsl2).toContain('description "Internal components of the API container."')

    const { workspace: ws2, errors: errors2 } = parseDSL(dsl2)
    expect(errors2).toEqual([])
    expect(ws2.views.componentViews[0].description).toBe('Internal components of the API container.')
  })

  it('view without description does not emit description block', () => {
    const dsl = `
workspace {
  model {
    api = softwareSystem "API"
  }
  views {
    systemContext api "ctx1" {
      title "API Context"
      include api
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const dsl2 = serialize(workspace)
    expect(dsl2).not.toContain('description')
  })

  it('serializes view titles with the Structurizr title keyword', () => {
    const dsl = `
workspace {
  model {
    api = softwareSystem "API"
  }
  views {
    systemContext api "ctx1" {
      title "API Context"
      include api
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])

    const dsl2 = serialize(workspace)
    expect(dsl2).toContain('systemContext api "ctx1" {')
    expect(dsl2).toContain('title "API Context"')
    expect(dsl2).not.toContain('systemContext api "ctx1" "API Context"')
  })

  it('parses the optional positional view string as a Structurizr description', () => {
    const dsl = `
workspace {
  model {
    api = softwareSystem "API"
  }
  views {
    systemContext api "ctx1" "Context view for API" {
      include api
    }
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])

    const view = workspace.views.systemContextViews[0]
    expect(view.description).toBe('Context view for API')
    expect(view.title).toBe('Context view for API')
  })

  // #233: the canvas labels a view by its positional description, but saving
  // that label as a `title` replaced the default title Structurizr renders. It
  // goes back into the header, where Structurizr reads it as the description.
  describe('positional description is saved as the description only (#233)', () => {
    const dsl = `
workspace {
  model {
    user = person "User"
    sys = softwareSystem "System" {
      web = container "Web" {
        ui = component "UI"
      }
      api = container "API"
      web -> api "Calls"
    }
    user -> sys "Uses"
    deploymentEnvironment "Live" {
      deploymentNode "Server" {
        containerInstance web
      }
    }
  }
  views {
    systemLandscape "land" "Landscape description" {
      include *
    }
    systemContext sys "ctx" "Context description" {
      include *
    }
    container sys "cont" "Container description" {
      include *
    }
    component web "comp" "Component description" {
      include *
    }
    dynamic sys "dyn" "Dynamic description" {
      web -> api "Calls"
    }
    deployment sys "Live" "dep" "Deployment description" {
      include *
    }
  }
}
`
    const allViews = (ws: Workspace): View[] => [
      ...ws.views.systemLandscapeViews,
      ...ws.views.systemContextViews,
      ...ws.views.containerViews,
      ...ws.views.componentViews,
      ...ws.views.dynamicViews,
      ...ws.views.deploymentViews,
    ]
    const headings = (ws: Workspace) => allViews(ws).map(v => ({ key: v.key, title: v.title, description: v.description }))

    it('labels each view type by its header description, marked as derived', () => {
      const { workspace, errors } = parseDSL(dsl)
      expect(errors).toEqual([])
      expect(allViews(workspace)).toHaveLength(6)
      for (const view of allViews(workspace)) {
        expect(view.title).toBe(view.description)
        expect(view.autoTitle).toBe(true)
      }
    })

    it('writes it back into the header, not as a title, for every view type', () => {
      const { workspace } = parseDSL(dsl)
      const output = serialize(workspace)
      expect(output).not.toMatch(/^\s*title /m)
      expect(output).not.toMatch(/^\s*description /m)
      for (const view of allViews(workspace)) {
        expect(output).toContain(`"${view.key}" "${view.description}" {`)
      }

      const { workspace: reparsed, errors } = parseDSL(output)
      expect(errors).toEqual([])
      expect(headings(reparsed)).toEqual(headings(workspace))
      expect(allViews(reparsed).every(v => v.autoTitle)).toBe(true)
    })

    it('saves an explicit body title next to the positional description', () => {
      const { workspace, errors } = parseDSL(`
workspace {
  model {
    sys = softwareSystem "System" {
      web = container "Web"
      api = container "API"
      web -> api "Calls"
    }
  }
  views {
    container sys "cont" "Container description" {
      title "Containers"
      include *
    }
    dynamic sys "dyn" "Dynamic description" {
      title "Checkout"
      web -> api "Calls"
    }
  }
}
`)
      expect(errors).toEqual([])
      const [container] = workspace.views.containerViews
      const [dynamic] = workspace.views.dynamicViews
      expect(container).toMatchObject({ title: 'Containers', description: 'Container description' })
      expect(container.autoTitle).toBeFalsy()
      expect(dynamic).toMatchObject({ title: 'Checkout', description: 'Dynamic description' })
      expect(dynamic.autoTitle).toBeFalsy()

      const output = serialize(workspace)
      expect(output).toContain('title "Containers"')
      expect(output).toContain('description "Container description"')
      expect(output).toContain('title "Checkout"')
      expect(output).toContain('description "Dynamic description"')
      expect(headings(parseDSL(output).workspace)).toEqual(headings(workspace))
    })

    it('keeps both the header string and a body description that replaces it', () => {
      // Structurizr keeps the body description; the header string is still
      // what the canvas shows, so it stays in the header rather than becoming
      // a title.
      const { workspace, errors } = parseDSL(`
workspace {
  model {
    sys = softwareSystem "System" {
      web = container "Web"
      api = container "API"
      web -> api "Calls"
    }
  }
  views {
    systemLandscape "land" "Landscape" {
      description "All software systems"
      include *
    }
    dynamic sys "dyn" "Checkout" {
      description "How an order is placed"
      web -> api "Calls"
    }
  }
}
`)
      expect(errors).toEqual([])
      expect(workspace.views.systemLandscapeViews[0]).toMatchObject({ title: 'Landscape', description: 'All software systems', autoTitle: true })
      expect(workspace.views.dynamicViews[0]).toMatchObject({ title: 'Checkout', description: 'How an order is placed', autoTitle: true })

      const output = serialize(workspace)
      expect(output).not.toMatch(/^\s*title /m)
      expect(output).toContain('systemLandscape "land" "Landscape" {')
      expect(output).toContain('description "All software systems"')
      expect(output).toContain('dynamic sys "dyn" "Checkout" {')
      expect(output).toContain('description "How an order is placed"')
      expect(headings(parseDSL(output).workspace)).toEqual(headings(workspace))
    })

    it('keeps an empty body description that blanks the header string', () => {
      // Structurizr applies `description ""` over the header string, so the
      // view has no description. Dropping it would bring the header text back.
      const { workspace, errors } = parseDSL(`
workspace {
  model {
    sys = softwareSystem "System" {
      web = container "Web"
      api = container "API"
      web -> api "Calls"
    }
  }
  views {
    container sys "cont" "Header text" {
      description ""
      include *
    }
    dynamic sys "dyn" "Checkout" {
      description ""
      web -> api "Calls"
    }
  }
}
`)
      expect(errors).toEqual([])
      expect(workspace.views.containerViews[0]).toMatchObject({ title: 'Header text', description: '', autoTitle: true })

      const output = serialize(workspace)
      expect(output).toContain('container sys "cont" "Header text" {')
      expect(output).toContain('dynamic sys "dyn" "Checkout" {')
      expect(output.match(/^\s*description ""$/gm)).toHaveLength(2)
      expect(output).not.toMatch(/^\s*title /m)
      expect(headings(parseDSL(output).workspace)).toEqual(headings(workspace))
    })
  })

  it('roundtrips a relationship excluded from one static view', () => {
    const dsl = `
workspace {
  model {
    user = person "User"
    api = softwareSystem "API"
    user -> api "Uses"
  }
  views {
    systemLandscape "land" {
      include user
      include api
      exclude "user -> api"
    }
  }
}
`
    const first = parseDSL(dsl)
    expect(first.errors).toEqual([])
    expect(first.workspace.views.systemLandscapeViews[0].relationships).toEqual([])

    const output = serialize(first.workspace)
    expect(output).toContain('exclude "user -> api"')
    const second = parseDSL(output)
    expect(second.errors).toEqual([])
    expect(second.workspace.views.systemLandscapeViews[0].relationships).toEqual([])
  })

  it('roundtrips all parallel relationships covered by a directed-pair exclusion', () => {
    const dsl = `
workspace {
  model {
    user = person "User"
    api = softwareSystem "API"
    user -> api "Reads"
    user -> api "Writes"
  }
  views {
    systemLandscape "land" {
      include *
      exclude "user -> api"
    }
  }
}
`
    const first = parseDSL(dsl)
    expect(first.errors).toEqual([])
    const view = first.workspace.views.systemLandscapeViews[0]
    expect(view.relationships).toEqual([])
    expect(view.excludedRelationshipIds).toHaveLength(2)

    const output = serialize(first.workspace)
    expect(output.match(/exclude "user -> api"/g)).toHaveLength(1)
    const second = parseDSL(output)
    expect(second.errors).toEqual([])
    expect(second.workspace.views.systemLandscapeViews[0].relationships).toEqual([])
  })
})
