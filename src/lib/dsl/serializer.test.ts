import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from './index'
import type { Workspace } from '@/types/model'

function makeWorkspace(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [],
      softwareSystems: [],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

// ─── Group Serialization Tests ────────────────────────────────────────

describe('Group serialization', () => {
  it('emits a group block for non-empty groups', () => {
    const ws = makeWorkspace()
    ws.model.people.push({ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} })
    ws.model.groups.push({ id: 'g1', name: 'Internal', elementIds: ['alice'] })

    const dsl = serializeDSL(ws)
    expect(dsl).toContain('group "Internal"')
    expect(dsl).toContain('alice')
  })

  it('omits empty groups', () => {
    const ws = makeWorkspace()
    ws.model.groups.push({ id: 'g1', name: 'Empty Group', elementIds: [] })

    const dsl = serializeDSL(ws)
    expect(dsl).not.toContain('group "Empty Group"')
  })

  it('uses var name (id) when id is a valid identifier', () => {
    const ws = makeWorkspace()
    ws.model.softwareSystems.push({
      id: 'myApi',
      type: 'softwareSystem',
      name: 'My API',
      tags: ['Element', 'Software System'],
      properties: {},
      containers: [],
    })
    ws.model.groups.push({ id: 'g1', name: 'Systems', elementIds: ['myApi'] })

    const dsl = serializeDSL(ws)
    expect(dsl).toContain('group "Systems"')
    // The group body should reference the var name
    expect(dsl).toMatch(/group "Systems" \{[\s\S]*myApi[\s\S]*\}/)
  })

  it('falls back to raw id when id is not a valid identifier', () => {
    const ws = makeWorkspace()
    ws.model.people.push({ id: '1', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} })
    ws.model.groups.push({ id: 'g1', name: 'Team', elementIds: ['1'] })

    const dsl = serializeDSL(ws)
    expect(dsl).toContain('group "Team"')
    expect(dsl).toMatch(/group "Team" \{[\s\S]*1[\s\S]*\}/)
  })

  it('serializes multiple groups', () => {
    const ws = makeWorkspace()
    ws.model.people.push(
      { id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} },
      { id: 'bob', type: 'person', name: 'Bob', tags: ['Element', 'Person'], properties: {} },
    )
    ws.model.groups.push(
      { id: 'g1', name: 'Team A', elementIds: ['alice'] },
      { id: 'g2', name: 'Team B', elementIds: ['bob'] },
    )

    const dsl = serializeDSL(ws)
    expect(dsl).toContain('group "Team A"')
    expect(dsl).toContain('group "Team B"')
  })

  it('escapes special characters in group names', () => {
    const ws = makeWorkspace()
    ws.model.people.push({ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} })
    ws.model.groups.push({ id: 'g1', name: 'Group "Special"', elementIds: ['alice'] })

    const dsl = serializeDSL(ws)
    expect(dsl).toContain('group "Group \\"Special\\""')
  })
})

// ─── Round-trip Tests ─────────────────────────────────────────────────

describe('Group round-trip (serialize → parse)', () => {
  it('round-trips a group with reference-style members', () => {
    const ws = makeWorkspace()
    ws.model.people.push({ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} })
    ws.model.softwareSystems.push({
      id: 'mySystem',
      type: 'softwareSystem',
      name: 'My System',
      tags: ['Element', 'Software System'],
      properties: {},
      containers: [],
    })
    ws.model.groups.push({ id: 'g1', name: 'Internal', elementIds: ['alice', 'mySystem'] })

    const dsl = serializeDSL(ws)
    const { workspace: reparsed, errors } = parseDSL(dsl)

    expect(errors).toHaveLength(0)
    expect(reparsed.model.groups).toHaveLength(1)
    const g = reparsed.model.groups[0]
    expect(g.name).toBe('Internal')
    expect(g.elementIds).toHaveLength(2)
    expect(g.elementIds).toContain('alice')
    expect(g.elementIds).toContain('mySystem')
  })

  it('preserves group name through round-trip', () => {
    const ws = makeWorkspace()
    ws.model.people.push({ id: 'u1', type: 'person', name: 'User One', tags: ['Element', 'Person'], properties: {} })
    ws.model.groups.push({ id: 'g1', name: 'My Group Name', elementIds: ['u1'] })

    const dsl = serializeDSL(ws)
    const { workspace: reparsed } = parseDSL(dsl)

    expect(reparsed.model.groups[0].name).toBe('My Group Name')
  })

  it('preserves all elements through round-trip regardless of grouping', () => {
    const ws = makeWorkspace()
    ws.model.people.push(
      { id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} },
      { id: 'bob', type: 'person', name: 'Bob', tags: ['Element', 'Person'], properties: {} },
    )
    ws.model.groups.push({ id: 'g1', name: 'Team', elementIds: ['alice'] })

    const dsl = serializeDSL(ws)
    const { workspace: reparsed } = parseDSL(dsl)

    expect(reparsed.model.people).toHaveLength(2)
    expect(reparsed.model.groups).toHaveLength(1)
    expect(reparsed.model.groups[0].elementIds).toContain('alice')
    // bob is not in any group
    expect(reparsed.model.groups[0].elementIds).not.toContain('bob')
  })
})
