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
