/**
 * Tests that element IDs containing hyphens do NOT survive a serialize→parse
 * roundtrip (the bug), and that IDs without hyphens DO survive (the fix).
 *
 * The serializer sanitizes IDs to valid Structurizr DSL identifiers via
 *   id.replace(/[^a-zA-Z0-9_]/g, '_')
 * so a nanoid like `k-cVJpOd` becomes the variable name `k_cVJpOd`.
 * After parsing, the element's ID is `k_cVJpOd` — different from the original.
 * The fix is to generate IDs from an alphabet that excludes `-`.
 */
import { describe, it, expect } from 'vitest'
import { serializeDSL, parseDSL } from '@/lib/dsl'
import type { Workspace } from '@/types/model'

function makeWsWithId(personId: string, sysId: string): Workspace {
  return {
    name: 'test',
    description: '',
    model: {
      people: [
        { id: personId, type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} },
      ],
      softwareSystems: [
        { id: sysId, type: 'softwareSystem', name: 'System', tags: ['Element', 'Software System'], properties: {}, containers: [] },
      ],
      relationships: [
        { id: 'rel1', sourceId: personId, destinationId: sysId, description: 'uses', tags: ['Relationship'], properties: {} },
      ],
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

describe('element ID stability through serialize → parse roundtrip', () => {
  it('hyphen-free IDs survive roundtrip unchanged', () => {
    const ws = makeWsWithId('aBcD1234', 'xYzW5678')
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(parsed.model.people[0].id).toBe('aBcD1234')
    expect(parsed.model.softwareSystems[0].id).toBe('xYzW5678')
  })

  it('hyphen-containing IDs do NOT survive roundtrip unchanged (demonstrates the pre-fix bug)', () => {
    // nanoid default alphabet includes `-`; this test documents the breakage.
    const ws = makeWsWithId('k-cVJpOd', 'x-Yz5678')
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    // The serializer maps `k-cVJpOd` → variable name `k_cVJpOd`.
    // After parse the element ID becomes `k_cVJpOd` — different from original.
    const parsedId = parsed.model.people[0].id
    expect(parsedId).toBe('k_cVJpOd') // hyphens become underscores
    expect(parsedId).not.toBe('k-cVJpOd') // original ID is lost
  })

  it('underscore IDs survive roundtrip unchanged (underscore is valid in DSL identifiers)', () => {
    // Underscores are legal in Structurizr DSL identifiers and survive as-is.
    const ws = makeWsWithId('aBcD_1234', 'xYzW_5678')
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(parsed.model.people[0].id).toBe('aBcD_1234')
    expect(parsed.model.softwareSystems[0].id).toBe('xYzW_5678')
  })

  it('relationship source/destination IDs remain consistent after roundtrip with hyphen-free IDs', () => {
    const ws = makeWsWithId('personABC1', 'sysXYZ9876')
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const rel = parsed.model.relationships[0]
    expect(rel.sourceId).toBe('personABC1')
    expect(rel.destinationId).toBe('sysXYZ9876')
  })

  it('digit-prefixed IDs do NOT survive roundtrip unchanged (demonstrates the pre-fix bug)', () => {
    // The serializer prepends `e` to IDs starting with a digit to produce a valid
    // DSL identifier (e.g. `0abc1234` → varName `e0abc1234`). After parsing the
    // element receives ID `e0abc1234`, not `0abc1234`.
    const ws = makeWsWithId('0abc1234', 'zXyW5678')
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    const parsedPersonId = parsed.model.people[0].id
    expect(parsedPersonId).toBe('e0abc1234') // `e` prefix was added, original lost
    expect(parsedPersonId).not.toBe('0abc1234')
  })

  it('letter-only IDs survive roundtrip unchanged (no e-prefix needed)', () => {
    // IDs composed only of letters are already valid DSL identifiers — no sanitization.
    const ws = makeWsWithId('abcDefGh', 'XyZwVuTs')
    const dsl = serializeDSL(ws)
    const { workspace: parsed, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(parsed.model.people[0].id).toBe('abcDefGh')
    expect(parsed.model.softwareSystems[0].id).toBe('XyZwVuTs')
  })
})
