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

// Structurizr removed the `location` keyword; externality is the `External`
// tag. c4hero keeps the model field (it drives the canvas — see
// canvasBuilders.ts:69 and SystemNode/PersonNode) and maps it to the tag on
// the way out, back to the field on the way in. The bare keyword is still
// accepted on import so older c4hero files keep loading.
describe('legacy location keyword parsing (import back-compat)', () => {
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

describe('serializer emits the External tag, never the location keyword', () => {
  it('does not emit the removed location keyword', () => {
    const dsl = serializeDSL(makeWs())
    expect(dsl).not.toContain('location External')
    expect(dsl).not.toContain('location Internal')
    expect(dsl).not.toContain('c4hero.location')
  })

  it('tags both External elements and leaves Internal ones untagged', () => {
    const dsl = serializeDSL(makeWs())
    expect(dsl).toContain('person "Alice" "" "External"')
    expect(dsl).toContain('softwareSystem "ExtSys" "" "External"')
    // Internal is the default and needs no representation.
    expect(dsl).toContain('person "Bob"')
    expect(dsl).not.toMatch(/"Bob".*External/)
    expect(dsl).not.toMatch(/"IntSys".*External/)
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
  it('opens no block body for an element whose only extra is externality', () => {
    const dsl = serializeDSL(makeWs())
    // Externality is now a positional tag, so no braces are needed at all.
    expect(dsl).not.toMatch(/person "Alice"[^\n]*\{/)
    expect(dsl).not.toMatch(/softwareSystem "ExtSys"[^\n]*\{/)
  })

  it('emits an empty description only where a later positional arg needs it', () => {
    const dsl = serializeDSL(makeWs())
    // tags are the 3rd positional arg, so the description slot must be filled
    // for Alice/ExtSys — but Bob and IntSys have no trailing arg and get none.
    expect(dsl).toContain('person "Alice" "" "External"')
    expect(dsl).not.toMatch(/person "Bob" ""/)
    expect(dsl).not.toMatch(/softwareSystem "IntSys" ""/)
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
