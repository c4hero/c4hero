import { describe, it, expect } from 'vitest'
import { serializeDSL, parseDSL } from '@/lib/dsl'
import type { Workspace, Person, SoftwareSystem } from '@/types/model'

function makeWs(): Workspace {
  return {
    name: 'test',
    description: '',
    model: {
      people: [
        { id: 'alice', type: 'person', name: 'Alice', tags: ['Person'], properties: {}, location: 'External' },
        { id: 'bob', type: 'person', name: 'Bob', tags: ['Person'], properties: {}, location: 'Internal' },
      ],
      softwareSystems: [
        { id: 'ext', type: 'softwareSystem', name: 'ExtSys', tags: ['Software System'], properties: {}, containers: [], location: 'External' },
        { id: 'int', type: 'softwareSystem', name: 'IntSys', tags: ['Software System'], properties: {}, containers: [], location: 'Internal' },
      ],
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

describe('native location keyword parsing', () => {
  it('person block with location External is parsed correctly', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice" {
      location External
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const alice = workspace.model.people.find(p => p.name === 'Alice')
    expect(alice?.location).toBe('External')
  })

  it('softwareSystem block with location External is parsed correctly', () => {
    const dsl = `
workspace {
  model {
    ext = softwareSystem "External Payments" {
      location External
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const ext = workspace.model.softwareSystems.find(s => s.name === 'External Payments')
    expect(ext?.location).toBe('External')
  })
})

describe('serializer emits External as a tag, not a location keyword', () => {
  // Real Structurizr rejects the bare `location` keyword inside an element
  // block (only description, tags, url, properties, perspectives are
  // accepted), so c4hero encodes External as an ordinary `External` tag
  // instead, routed through the same tag-sanitising path as every other tag.
  it('External person serializes with an External tag, no location keyword', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    expect(dsl).not.toMatch(/^\s*location\s/m)
    expect(dsl).not.toContain('c4hero.location')
    expect(dsl).toMatch(/person "Alice" "" "External"/)
  })

  it('External softwareSystem serializes with an External tag, no location keyword', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    expect(dsl).not.toMatch(/^\s*location\s/m)
    expect(dsl).not.toContain('"c4hero.location"')
    // Both person Alice and system ExtSys are External; both should carry the tag
    const externalTagCount = (dsl.match(/"External"/g) ?? []).length
    expect(externalTagCount).toBe(2)
  })
})

describe('External location roundtrip', () => {
  it('External person survives serialize → parse', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    const alice = parsed.workspace?.model.people.find(p => p.name === 'Alice') as Person | undefined
    const bob = parsed.workspace?.model.people.find(p => p.name === 'Bob') as Person | undefined
    expect(alice?.location).toBe('External')
    // Bob's location is not serialized since it's the default; parser leaves it undefined
    expect(bob?.location === undefined || bob?.location === 'Internal').toBe(true)
  })

  it('External software system survives serialize → parse', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    const ext = parsed.workspace?.model.softwareSystems.find(s => s.name === 'ExtSys') as SoftwareSystem | undefined
    const int = parsed.workspace?.model.softwareSystems.find(s => s.name === 'IntSys') as SoftwareSystem | undefined
    expect(ext?.location).toBe('External')
    expect(int?.location === undefined || int?.location === 'Internal').toBe(true)
  })
})

describe('serializer emits the inline 3-argument form for external-only elements', () => {
  it('External person with no description serializes inline, no block', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    // alice is only External (no url/status/owner/properties), so being
    // external must NOT force a block body -- it becomes the inline
    // 3-argument form: name, empty description, tags.
    expect(dsl).toMatch(/alice = person "Alice" "" "External"\s*$/m)
  })

  it('External softwareSystem with no description serializes inline, no block', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    expect(dsl).toMatch(/ext = softwareSystem "ExtSys" "" "External"\s*$/m)
  })

  it('External person with no description roundtrips with location and no description', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const alice = workspace.model.people.find(p => p.name === 'Alice')
    expect(alice?.description).toBeUndefined()
    expect(alice?.location).toBe('External')
  })
})
