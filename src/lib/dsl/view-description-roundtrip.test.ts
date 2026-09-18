import { describe, it, expect } from 'vitest'
import { parseDSL } from '@/lib/dsl'
import { serialize } from '@/lib/dsl/serializer'

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
