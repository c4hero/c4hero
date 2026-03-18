import { describe, it, expect } from 'vitest'
import { parseDSL as parse } from './index'

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

  it('skips groups with no known members silently', () => {
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
    expect(workspace.model.groups).toHaveLength(0)
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
    // unknownRef couldn't be resolved, so no group is created (0 members → not pushed)
    expect(workspace.model.groups).toHaveLength(0)
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
