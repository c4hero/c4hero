import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL, GroupSerializationError } from '@/lib/dsl'

describe('Structurizr-conformant group roundtrip', () => {
  it('emits declarations inside their group instead of post-hoc references', () => {
    const { workspace, errors } = parseDSL(`
workspace "Test" {
  model {
    group "Frontend Team" {
      alice = person "Alice"
    }
    api = softwareSystem "API"
  }
  views {}
}
`)
    expect(errors).toEqual([])

    const dsl = serializeDSL(workspace)
    expect(dsl).toContain('group "Frontend Team" {\n            alice = person "Alice"\n        }')
    expect(dsl.indexOf('group "Frontend Team"')).toBeLessThan(dsl.indexOf('alice = person "Alice"'))

    const reparsed = parseDSL(dsl)
    expect(reparsed.errors).toEqual([])
    expect(reparsed.workspace.model.groups).toHaveLength(1)
    expect(reparsed.workspace.model.groups[0]).toMatchObject({
      name: 'Frontend Team',
      elementIds: ['alice'],
    })
  })

  it('keeps disjoint groups as siblings', () => {
    const { workspace, errors } = parseDSL(`
workspace "Multi-group" {
  model {
    group "Users" {
      alice = person "Alice"
      bob = person "Bob"
    }
    group "Systems" {
      api = softwareSystem "API"
      store = softwareSystem "Store"
    }
  }
  views {}
}
`)
    expect(errors).toEqual([])

    const dsl = serializeDSL(workspace)
    expect(dsl).toContain('group "Users"')
    expect(dsl).toContain('group "Systems"')
    const reparsed = parseDSL(dsl)
    expect(reparsed.errors).toEqual([])
    expect(reparsed.workspace.model.groups).toHaveLength(2)
    expect(reparsed.workspace.model.groups.find(g => g.name === 'Users')?.elementIds).toHaveLength(2)
    expect(reparsed.workspace.model.groups.find(g => g.name === 'Systems')?.elementIds).toHaveLength(2)
  })

  it('preserves an intentional empty group', () => {
    const { workspace, errors } = parseDSL(`
workspace "Test" {
  model {
    group "Empty Group" {
    }
  }
  views {}
}
`)
    expect(errors).toEqual([])

    const dsl = serializeDSL(workspace)
    expect(dsl).toContain('group "Empty Group" {\n        }')
    const reparsed = parseDSL(dsl)
    expect(reparsed.errors).toEqual([])
    expect(reparsed.workspace.model.groups[0]).toMatchObject({ name: 'Empty Group', elementIds: [] })
  })

  it('infers nested groups from strict subset membership and emits the separator', () => {
    const { workspace, errors } = parseDSL(`
workspace "Nested" {
  model {
    properties {
      "structurizr.groupSeparator" "/"
    }
    group "Outer" {
      c = softwareSystem "C"
      group "Inner" {
        a = softwareSystem "A"
        b = softwareSystem "B"
      }
    }
  }
  views {}
}
`)
    expect(errors).toEqual([])
    expect(workspace.model.groups.find(g => g.name === 'Inner')?.elementIds).toEqual(['a', 'b'])
    expect(new Set(workspace.model.groups.find(g => g.name === 'Outer')?.elementIds)).toEqual(new Set(['a', 'b', 'c']))

    const dsl = serializeDSL(workspace)
    expect(dsl).toContain('"structurizr.groupSeparator" "/"')
    expect(dsl).toMatch(/group "Outer" \{[\s\S]*group "Inner" \{[\s\S]*a = softwareSystem/)

    const reparsed = parseDSL(dsl)
    expect(reparsed.errors).toEqual([])
    expect(reparsed.workspace.model.groups.find(g => g.name === 'Inner')?.elementIds).toEqual(['a', 'b'])
    expect(new Set(reparsed.workspace.model.groups.find(g => g.name === 'Outer')?.elementIds)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('retains explicit nesting when parent and child have equal aggregate members', () => {
    const parsed = parseDSL(`
workspace {
  model {
    properties {
      "structurizr.groupSeparator" "/"
    }
    group "Outer" {
      group "Inner" {
        a = softwareSystem "A"
      }
    }
  }
  views {}
}
`)
    expect(parsed.errors).toEqual([])
    const inner = parsed.workspace.model.groups.find(g => g.name === 'Inner')
    const outer = parsed.workspace.model.groups.find(g => g.name === 'Outer')
    expect(inner?.parentId).toBe(outer?.id)

    const dsl = serializeDSL(parsed.workspace)
    expect(dsl).toMatch(/group "Outer" \{\s+group "Inner" \{\s+a = softwareSystem/s)
    const reparsed = parseDSL(dsl)
    expect(reparsed.errors).toEqual([])
    const reparsedInner = reparsed.workspace.model.groups.find(g => g.name === 'Inner')
    const reparsedOuter = reparsed.workspace.model.groups.find(g => g.name === 'Outer')
    expect(reparsedInner?.parentId).toBe(reparsedOuter?.id)
  })

  it('retains container- and component-level group blocks', () => {
    const source = `
workspace "Scoped" {
  model {
    sys = softwareSystem "System" {
      group "Applications" {
        web = container "Web" {
          group "Layers" {
            ui = component "UI"
            api = component "API"
          }
        }
        db = container "Database"
      }
    }
  }
  views {}
}
`
    const parsed = parseDSL(source)
    expect(parsed.errors).toEqual([])
    expect(parsed.workspace.model.groups.find(g => g.name === 'Applications')?.elementIds).toEqual(['web', 'db'])
    expect(parsed.workspace.model.groups.find(g => g.name === 'Layers')?.elementIds).toEqual(['ui', 'api'])

    const dsl = serializeDSL(parsed.workspace)
    expect(dsl).toMatch(/softwareSystem "System" \{[\s\S]*group "Applications" \{[\s\S]*web = container/)
    expect(dsl).toMatch(/web = container "Web" \{[\s\S]*group "Layers" \{[\s\S]*ui = component/)

    const reparsed = parseDSL(dsl)
    expect(reparsed.errors).toEqual([])
    expect(reparsed.workspace.model.groups.find(g => g.name === 'Applications')?.elementIds).toEqual(['web', 'db'])
    expect(reparsed.workspace.model.groups.find(g => g.name === 'Layers')?.elementIds).toEqual(['ui', 'api'])
  })

  it('normalizes an inline component group to a valid group block', () => {
    const parsed = parseDSL(`
workspace {
  model {
    sys = softwareSystem "System" {
      web = container "Web" {
        adapter = component "Adapter" {
          group "Adapters"
        }
      }
    }
  }
  views {}
}
`)
    expect(parsed.errors).toEqual([])
    expect(parsed.workspace.model.groups.find(g => g.name === 'Adapters')?.elementIds).toEqual(['adapter'])
    expect(serializeDSL(parsed.workspace)).toMatch(/group "Adapters" \{\s+adapter = component/)
  })

  it('preserves a hierarchy whose parent also has members at another abstraction scope', () => {
    const parsed = parseDSL(`
workspace {
  model {
    sys = softwareSystem "System" {
      web = container "Web"
      api = container "API"
    }
  }
  views {}
}
`)
    expect(parsed.errors).toEqual([])
    parsed.workspace.model.groups = [
      { id: 'inner', name: 'Applications', elementIds: ['web', 'api'] },
      { id: 'outer', name: 'Secure Zone', elementIds: ['sys', 'web', 'api'] },
    ]

    const dsl = serializeDSL(parsed.workspace)
    expect(dsl).toMatch(/softwareSystem "System" \{[\s\S]*group "Secure Zone" \{[\s\S]*group "Applications"/)
    expect(parseDSL(dsl).errors).toEqual([])
  })

  it('blocks crossing memberships with an actionable error', () => {
    const parsed = parseDSL(`
workspace {
  model {
    a = softwareSystem "A"
    b = softwareSystem "B"
    c = softwareSystem "C"
  }
  views {}
}
`)
    parsed.workspace.model.groups = [
      { id: 'one', name: 'One', elementIds: ['a', 'b'] },
      { id: 'two', name: 'Two', elementIds: ['b', 'c'] },
    ]

    expect(() => serializeDSL(parsed.workspace)).toThrow(GroupSerializationError)
    expect(() => serializeDSL(parsed.workspace)).toThrow(/groups "One" and "Two".*"B" belongs to both/s)
  })

  it('blocks equal memberships because neither group is a strict parent', () => {
    const parsed = parseDSL(`
workspace {
  model {
    a = softwareSystem "A"
  }
  views {}
}
`)
    parsed.workspace.model.groups = [
      { id: 'one', name: 'One', elementIds: ['a'] },
      { id: 'two', name: 'Two', elementIds: ['a'] },
    ]

    expect(() => serializeDSL(parsed.workspace)).toThrow(/groups "One" and "Two"/)
  })

  it('blocks separator characters in nested group names', () => {
    const parsed = parseDSL(`
workspace {
  model {
    a = softwareSystem "A"
    b = softwareSystem "B"
  }
  views {}
}
`)
    parsed.workspace.model.groups = [
      { id: 'inner', name: 'Inner/Team', elementIds: ['a'] },
      { id: 'outer', name: 'Outer', elementIds: ['a', 'b'] },
    ]

    expect(() => serializeDSL(parsed.workspace)).toThrow(/group names may not contain.*separator/s)
  })
})
