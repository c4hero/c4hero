import { describe, it, expect } from 'vitest'
import { parseDSL } from '@/lib/dsl'
import { serialize } from '@/lib/dsl/serializer'
import type { Workspace } from '@/types/model'

describe('group roundtrip', () => {
  it('group block with member references survives serialize → parse', () => {
    const dsl = `
workspace "Test" {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
    group "Frontend Team" {
      alice
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])

    // Re-serialize and re-parse
    const dsl2 = serialize(workspace)
    const { workspace: ws2, errors: errors2 } = parseDSL(dsl2)
    expect(errors2).toEqual([])

    // Group should be preserved
    expect(ws2.model.groups).toHaveLength(1)
    expect(ws2.model.groups[0].name).toBe('Frontend Team')

    // Group should reference Alice by ID
    const alice = ws2.model.people.find(p => p.name === 'Alice')
    expect(alice).toBeDefined()
    expect(ws2.model.groups[0].elementIds).toContain(alice!.id)
  })

  it('multiple groups with different members survive roundtrip', () => {
    const dsl = `
workspace "Multi-group" {
  model {
    alice = person "Alice"
    bob = person "Bob"
    api = softwareSystem "API"
    store = softwareSystem "Store"

    group "Users" {
      alice
      bob
    }
    group "Systems" {
      api
      store
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.model.groups).toHaveLength(2)

    const dsl2 = serialize(workspace)
    const { workspace: ws2, errors: errors2 } = parseDSL(dsl2)
    expect(errors2).toEqual([])

    expect(ws2.model.groups).toHaveLength(2)
    const users = ws2.model.groups.find(g => g.name === 'Users')
    const systems = ws2.model.groups.find(g => g.name === 'Systems')
    expect(users).toBeDefined()
    expect(systems).toBeDefined()
    expect(users!.elementIds).toHaveLength(2)
    expect(systems!.elementIds).toHaveLength(2)
  })

  it('empty group survives serialize → parse', () => {
    const workspace: Workspace = {
      name: 'Test',
      model: {
        people: [],
        softwareSystems: [],
        relationships: [],
        groups: [{ id: 'g1', name: 'Empty Group', elementIds: [] }],
      },
      views: {
        systemLandscapeViews: [],
        systemContextViews: [],
        containerViews: [],
        componentViews: [],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    const dsl = serialize(workspace)
    expect(dsl).toContain('group "Empty Group" {')

    const { workspace: reparsed, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(reparsed.model.groups).toHaveLength(1)
    expect(reparsed.model.groups[0]).toMatchObject({ name: 'Empty Group', elementIds: [] })
  })
})
