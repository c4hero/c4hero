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

  it('serializes empty groups', () => {
    const ws = makeWorkspace()
    ws.model.groups.push({ id: 'g1', name: 'Empty Group', elementIds: [] })

    const dsl = serializeDSL(ws)
    expect(dsl).toContain('group "Empty Group" {')
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

  it('sanitizes an invalid identifier ID to produce a valid var name', () => {
    const ws = makeWorkspace()
    ws.model.people.push({ id: '1', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} })
    ws.model.groups.push({ id: 'g1', name: 'Team', elementIds: ['1'] })

    const dsl = serializeDSL(ws)
    expect(dsl).toContain('group "Team"')
    // id '1' starts with a digit → gets sanitized to 'e1'
    expect(dsl).toMatch(/group "Team" \{[\s\S]*e1[\s\S]*\}/)
    expect(dsl).toContain('e1 = person "Alice"')
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

  it('round-trips an intentional empty group', () => {
    const ws = makeWorkspace()
    ws.model.groups.push({ id: 'g1', name: 'Empty Group', elementIds: [] })

    const dsl = serializeDSL(ws)
    const { workspace: reparsed, errors } = parseDSL(dsl)

    expect(errors).toHaveLength(0)
    expect(reparsed.model.groups).toHaveLength(1)
    expect(reparsed.model.groups[0]).toMatchObject({ name: 'Empty Group', elementIds: [] })
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

// ─── Extended Serializer Coverage ─────────────────────────────────────

describe('Serializer — escaping special characters', () => {
  it('escapes double-quotes in person name', () => {
    const ws = makeWorkspace()
    ws.model.people.push({
      id: 'al',
      type: 'person',
      name: 'Alice "Al" Smith',
      tags: ['Element', 'Person'],
      properties: {},
    })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('person "Alice \\"Al\\" Smith"')
  })

  it('escapes double-quotes in system description', () => {
    const ws = makeWorkspace()
    ws.model.softwareSystems.push({
      id: 'sys1',
      type: 'softwareSystem',
      name: 'My System',
      description: 'Handles "special" cases',
      tags: ['Element', 'Software System'],
      properties: {},
      containers: [],
    })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('\\"special\\"')
  })

  it('escapes backslash characters in names', () => {
    const ws = makeWorkspace()
    ws.model.people.push({
      id: 'bp', type: 'person', name: 'Alice\\Bob', tags: ['Element', 'Person'], properties: {},
    })
    const dsl = serializeDSL(ws)
    // Backslash must be doubled in the serialized output
    expect(dsl).toContain('person "Alice\\\\Bob"')
  })

  it('backslash in name survives serialize → parse roundtrip', () => {
    const ws = makeWorkspace()
    ws.model.people.push({
      id: 'bp', type: 'person', name: 'Alice\\Bob', tags: ['Element', 'Person'], properties: {},
    })
    const { workspace: parsed, errors } = parseDSL(serializeDSL(ws))
    expect(errors).toEqual([])
    const person = parsed.model.people.find(p => p.name === 'Alice\\Bob')
    expect(person).toBeDefined()
    expect(person!.name).toBe('Alice\\Bob')
  })
})

describe('Serializer — var name deduplication', () => {
  it('generates unique var names for two people with the same sanitized ID prefix', () => {
    const ws = makeWorkspace()
    ws.model.people.push(
      // IDs '1' and '2' sanitize to 'e1' and 'e2' — already distinct, no dedup needed
      { id: '1', type: 'person', name: 'User', tags: ['Element', 'Person'], properties: {} },
      { id: '2', type: 'person', name: 'User', tags: ['Element', 'Person'], properties: {} },
    )
    const dsl = serializeDSL(ws)
    // Both should appear with distinct var names derived from their IDs
    expect(dsl).toContain('e1 = person "User"')
    expect(dsl).toContain('e2 = person "User"')
  })

  it('handles collision when two IDs sanitize to the same var name', () => {
    const ws = makeWorkspace()
    ws.model.people.push(
      // IDs 'ab-cd' and 'ab_cd' both sanitize to 'ab_cd' → collision
      { id: 'ab-cd', type: 'person', name: 'A', tags: ['Element', 'Person'], properties: {} },
      { id: 'ab_cd', type: 'person', name: 'B', tags: ['Element', 'Person'], properties: {} },
    )
    const dsl = serializeDSL(ws)
    // One gets 'ab_cd', the other gets 'ab_cd_2'
    expect(dsl).toContain('ab_cd = person')
    expect(dsl).toContain('ab_cd_2 = person')
  })
})

describe('Serializer — container/component technology', () => {
  it('serializes container technology', () => {
    const ws = makeWorkspace()
    ws.model.softwareSystems.push({
      id: 'sys',
      type: 'softwareSystem',
      name: 'My System',
      tags: ['Element', 'Software System'],
      properties: {},
      containers: [
        {
          id: 'api',
          type: 'container',
          name: 'API',
          technology: 'Node.js',
          tags: ['Element', 'Container'],
          properties: {},
          components: [],
        },
      ],
    })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('Node.js')
  })

  it('serializes component technology', () => {
    const ws = makeWorkspace()
    ws.model.softwareSystems.push({
      id: 'sys',
      type: 'softwareSystem',
      name: 'My System',
      tags: ['Element', 'Software System'],
      properties: {},
      containers: [
        {
          id: 'svc',
          type: 'container',
          name: 'Service',
          tags: ['Element', 'Container'],
          properties: {},
          components: [
            {
              id: 'ctrl',
              type: 'component',
              name: 'Controller',
              technology: 'Spring MVC',
              tags: ['Element', 'Component'],
              properties: {},
            },
          ],
        },
      ],
    })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('Spring MVC')
  })
})

describe('Serializer — view include * vs explicit', () => {
  it('emits include * for views with wildcard element', () => {
    const ws = makeWorkspace()
    ws.views.systemLandscapeViews.push({
      type: 'systemLandscape',
      key: 'sl1',
      title: 'Landscape',
      elements: [{ id: '*' }],
      relationships: [],
    })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('include *')
  })

  it('emits explicit include refs for non-wildcard views', () => {
    const ws = makeWorkspace()
    ws.model.people.push({ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} })
    ws.views.systemLandscapeViews.push({
      type: 'systemLandscape',
      key: 'sl1',
      title: 'Landscape',
      elements: [{ id: 'alice' }],
      relationships: [],
    })
    const dsl = serializeDSL(ws)
    // Should have 'include alice' not 'include *'
    expect(dsl).toContain('include alice')
    expect(dsl).not.toContain('include *')
  })

  it('emits no include statement for empty element list', () => {
    const ws = makeWorkspace()
    ws.views.systemLandscapeViews.push({
      type: 'systemLandscape',
      key: 'sl1',
      title: 'Landscape',
      elements: [],
      relationships: [],
    })
    const dsl = serializeDSL(ws)
    // No include should be emitted when elements list is empty
    const viewBlock = dsl.split('views {')[1]
    expect(viewBlock).not.toContain('include')
  })
})

describe('Serializer — include * round-trip includes all relationships', () => {
  it('serialize with wildcard → parse → view has all model relationships', () => {
    const ws = makeWorkspace()
    ws.model.people.push({ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} })
    ws.model.softwareSystems.push({
      id: 'myapp',
      type: 'softwareSystem',
      name: 'My App',
      tags: ['Element', 'Software System'],
      properties: {},
      containers: [],
    })
    ws.model.relationships.push({
      id: 'rel-1',
      sourceId: 'alice',
      destinationId: 'myapp',
      description: 'uses',
      tags: ['Relationship'],
      properties: {},
    })
    ws.views.systemLandscapeViews.push({
      type: 'systemLandscape',
      key: 'sl1',
      title: 'Landscape',
      elements: [{ id: '*' }],
      relationships: [{ id: 'rel-1' }],
    })

    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const view = parsed.views.systemLandscapeViews[0]
    expect(view.relationships).toHaveLength(1)
  })
})

// ─── Serializer — properties ─────────────────────────────────────────

describe('Serializer — properties', () => {
  it('element with properties → serialized DSL still contains the element (properties not in DSL is OK)', () => {
    // Properties are stored in sidecar, not DSL — so serializer should NOT emit them
    // but the element itself must still be present
    const ws = makeWorkspace()
    ws.model.people.push({
      id: 'alice',
      type: 'person',
      name: 'Alice',
      tags: ['Element', 'Person'],
      properties: { team: 'Platform' },
    })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('person "Alice"')
  })

  it('workspace with no properties → clean output (no properties block emitted)', () => {
    const ws = makeWorkspace()
    ws.model.people.push({
      id: 'alice',
      type: 'person',
      name: 'Alice',
      tags: ['Element', 'Person'],
      properties: {},
    })
    const dsl = serializeDSL(ws)
    expect(dsl).not.toContain('properties')
  })
})

// ─── Serializer — styles ─────────────────────────────────────────────

describe('Serializer — styles', () => {
  it('workspace with element style → DSL includes styles block with background and color', () => {
    const ws = makeWorkspace()
    ws.views.configuration.styles.elements.push({
      tag: 'Database',
      background: '#336791',
      color: '#ffffff',
    })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('styles {')
    expect(dsl).toContain('element "Database"')
    expect(dsl).toContain('background #336791')
    expect(dsl).toContain('color #ffffff')
  })

  it('workspace with relationship style → DSL includes relationship style', () => {
    const ws = makeWorkspace()
    ws.views.configuration.styles.relationships.push({
      tag: 'Async',
      color: '#ff0000',
    })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('styles {')
    expect(dsl).toContain('relationship "Async"')
    expect(dsl).toContain('color #ff0000')
  })

  it('workspace with no styles → no styles block emitted', () => {
    const ws = makeWorkspace()
    const dsl = serializeDSL(ws)
    expect(dsl).not.toContain('styles {')
  })

  it('element style round-trip: serialize → parse → same style data', () => {
    const ws = makeWorkspace()
    ws.views.configuration.styles.elements.push({
      tag: 'Queue',
      background: '#ff9900',
      shape: 'Pipe',
    })
    const dsl = serializeDSL(ws)
    const { workspace: reparsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const styles = reparsed.views.configuration.styles.elements
    expect(styles.some(s => s.tag === 'Queue' && s.background === '#ff9900')).toBe(true)
  })

  it('relationship style round-trip: serialize → parse → same style data', () => {
    const ws = makeWorkspace()
    ws.views.configuration.styles.relationships.push({
      tag: 'Async',
      color: '#aabbcc',
      dashed: true,
    })
    const dsl = serializeDSL(ws)
    const { workspace: reparsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const relStyles = reparsed.views.configuration.styles.relationships
    expect(relStyles.some(s => s.tag === 'Async')).toBe(true)
  })
})
