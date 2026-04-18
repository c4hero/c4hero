/**
 * Tests that empty string positional args `""` used as slot-fillers (e.g. to
 * skip description in order to specify technology) are normalized to `undefined`
 * by the parser, not stored as empty strings.
 *
 * Without this fix, a container with no description but with extra tags would
 * be serialized as `container "DB" "" "" "Database"`, then parsed back with
 * `description: ""`, changing the model on every roundtrip.
 */
import { describe, it, expect } from 'vitest'
import { parseDSL } from '@/lib/dsl'

describe('empty string positional args are normalized to undefined', () => {
  it('container with empty description placeholder has undefined description after parse', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "Sys" {
      db = container "DB" "" "MySQL"
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const container = workspace.model.softwareSystems[0].containers[0]
    expect(container.technology).toBe('MySQL')
    // Empty string placeholder must NOT become description: ""
    expect(container.description).toBeUndefined()
  })

  it('container with empty technology placeholder has undefined technology after parse', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "Sys" {
      db = container "DB" "A database" "" "Database"
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const container = workspace.model.softwareSystems[0].containers[0]
    expect(container.description).toBe('A database')
    // Empty technology placeholder must NOT become technology: ""
    expect(container.technology).toBeUndefined()
  })

  it('person with empty description placeholder has undefined description', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice" "" "VIP,Person"
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const alice = workspace.model.people[0]
    expect(alice.description).toBeUndefined()
    expect(alice.tags).toContain('VIP')
  })

  it('softwareSystem with empty description placeholder has undefined description', () => {
    const dsl = `
workspace {
  model {
    api = softwareSystem "API" "" "External,Software System"
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const sys = workspace.model.softwareSystems[0]
    expect(sys.description).toBeUndefined()
    expect(sys.tags).toContain('External')
  })

  it('relationship with empty description placeholder has undefined description', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
    alice -> api "" "HTTPS"
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0]
    expect(rel.technology).toBe('HTTPS')
    // Empty string placeholder must NOT become description: ""
    expect(rel.description).toBeUndefined()
  })

  it('container with no description slot at all still has undefined description', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "Sys" {
      db = container "DB"
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const container = workspace.model.softwareSystems[0].containers[0]
    expect(container.description).toBeUndefined()
    expect(container.technology).toBeUndefined()
  })

  it('container with real description is preserved through roundtrip', () => {
    const dsl = `
workspace {
  model {
    sys = softwareSystem "Sys" {
      db = container "DB" "Stores user data" "PostgreSQL"
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const container = workspace.model.softwareSystems[0].containers[0]
    expect(container.description).toBe('Stores user data')
    expect(container.technology).toBe('PostgreSQL')
  })

  it('workspace "" name placeholder is normalized to undefined', () => {
    // workspace "" "My Description" — empty name should not become name:""
    const dsl = `
workspace "" "My Description" {
  model {}
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.name).toBeUndefined()
    expect(workspace.description).toBe('My Description')
  })

  it('workspace "" description placeholder is normalized to undefined', () => {
    // workspace "My Workspace" "" — empty description should not become description:""
    const dsl = `
workspace "My Workspace" "" {
  model {}
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.name).toBe('My Workspace')
    expect(workspace.description).toBeUndefined()
  })
})
