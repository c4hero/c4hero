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

describe('serializer emits native location keyword', () => {
  it('External person serializes as "location External" not properties block', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('location External')
    expect(dsl).not.toContain('c4hero.location')
  })

  it('External softwareSystem serializes as "location External" not properties block', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    // Both person Alice and system ExtSys are External; both should use location External
    const locationCount = (dsl.match(/location External/g) ?? []).length
    expect(locationCount).toBe(2)
    expect(dsl).not.toContain('"c4hero.location"')
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

describe('serializer does not emit unnecessary empty string placeholders', () => {
  it('External person with no description serializes without "" before the block', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    // alice is External so has a block body; she has no description.
    // The serializer must NOT emit person "Alice" "" { location External }
    // It should emit person "Alice" { location External }
    expect(dsl).not.toMatch(/person "Alice" "" \{/)
    expect(dsl).toMatch(/person "Alice" \{/)
  })

  it('External softwareSystem with no description serializes without "" before the block', () => {
    const ws = makeWs()
    const dsl = serializeDSL(ws)
    // ExtSys is External so has a block body; it has no description.
    expect(dsl).not.toMatch(/softwareSystem "ExtSys" "" \{/)
    expect(dsl).toMatch(/softwareSystem "ExtSys" \{/)
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
