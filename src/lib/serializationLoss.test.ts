import { describe, it, expect } from 'vitest'
import { findSerializationLoss } from './serializationLoss'
import { serializeDSL, parseDSL } from '@/lib/dsl'
import type { Workspace, SoftwareSystem, Container, Person, Relationship } from '@/types/model'

function person(id: string, name: string, over: Partial<Person> = {}): Person {
  return { id, type: 'person', name, tags: ['Element', 'Person'], properties: {}, ...over }
}
function container(id: string, name: string, over: Partial<Container> = {}): Container {
  return { id, type: 'container', name, tags: ['Element', 'Container'], properties: {}, components: [], ...over }
}
function system(id: string, name: string, containers: Container[] = [], over: Partial<SoftwareSystem> = {}): SoftwareSystem {
  return { id, type: 'softwareSystem', name, tags: ['Element', 'Software System'], properties: {}, containers, ...over }
}
function rel(id: string, sourceId: string, destinationId: string, over: Partial<Relationship> = {}): Relationship {
  return { id, sourceId, destinationId, tags: ['Relationship'], properties: {}, ...over }
}
function ws(over: Partial<Workspace> = {}): Workspace {
  return {
    name: 'T',
    model: { people: [], softwareSystems: [], relationships: [], groups: [], deploymentEnvironments: [] },
    views: {
      systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [],
      dynamicViews: [], deploymentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
    ...over,
  }
}
const codes = (w: Workspace) => findSerializationLoss(w).map(l => l.code)

describe('findSerializationLoss', () => {
  it('says nothing about a workspace that survives the trip intact', () => {
    const w = ws({
      model: {
        people: [person('p1', 'Ops', { description: 'Runs it', properties: { team: 'platform' } })],
        softwareSystems: [system('s1', 'Payments', [container('c1', 'API', { technology: 'Go' })])],
        relationships: [rel('r1', 'p1', 's1', { description: 'uses' })],
        groups: [], deploymentEnvironments: [],
      },
    })
    expect(findSerializationLoss(w)).toEqual([])
  })

  it('leaves an interior backslash alone — it round-trips byte-for-byte', () => {
    expect(codes(ws({ model: { ...ws().model, softwareSystems: [system('s1', 'C:\\Program Files')] } }))).toEqual([])
  })

  describe('unrepresentable backslashes', () => {
    it('flags a trailing backslash, which would escape the closing quote', () => {
      const w = ws({ model: { ...ws().model, softwareSystems: [system('s1', 'Shared Folder X:\\')] } })
      expect(codes(w)).toEqual(['dropped-backslash'])
      expect(findSerializationLoss(w)[0].field).toBe('name')
    })

    it('flags a backslash before n, which would decode as a newline', () => {
      const w = ws({ model: { ...ws().model, softwareSystems: [system('s1', 'Sys', [], { description: 'literal \\not newline' })] } })
      expect(codes(w)).toEqual(['dropped-backslash'])
    })

    it('reaches technology, url and owner as well as name and description', () => {
      const w = ws({
        model: {
          ...ws().model,
          softwareSystems: [system('s1', 'Sys', [container('c1', 'API', {
            technology: 'Go\\', url: 'https://example.com/x\\', owner: 'Team\\',
          })])],
        },
      })
      expect(findSerializationLoss(w).map(l => l.field).sort()).toEqual(['owner', 'technology', 'url'])
    })
  })

  describe('carriage returns', () => {
    it('flags a CRLF, which is saved as a plain newline', () => {
      const w = ws({ model: { ...ws().model, softwareSystems: [system('s1', 'Sys', [], { description: 'one\r\ntwo' })] } })
      expect(codes(w)).toEqual(['normalized-newline'])
    })

    it('says nothing about a plain newline, which round-trips as the \\n escape', () => {
      expect(codes(ws({ model: { ...ws().model, softwareSystems: [system('s1', 'Sys', [], { description: 'one\ntwo' })] } }))).toEqual([])
    })

    it('reports both changes when a value loses a backslash and a carriage return', () => {
      const w = ws({ model: { ...ws().model, softwareSystems: [system('s1', 'Sys', [], { description: 'one\r\ntwo\\' })] } })
      expect(codes(w)).toEqual(['dropped-backslash', 'normalized-newline'])
    })
  })

  describe('tags', () => {
    it('flags a comma, which Structurizr would read as two tags', () => {
      const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { tags: ['Element', 'Person', 'v1,beta'] })] } })
      expect(codes(w)).toEqual(['stripped-tag-comma'])
      expect(findSerializationLoss(w)[0].message).toContain('"v1beta"')
    })

    it('flags two tags that collapse into one, which loses a tag outright', () => {
      const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { tags: ['ab', 'a,b'] })] } })
      expect(codes(w)).toEqual(['merged-tags'])
    })

    it('flags a tag that encodes to nothing', () => {
      const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { tags: ['Element', '\\'] })] } })
      expect(codes(w)).toEqual(['dropped-property'])
    })

    it('flags padding, which Structurizr trims off every tag it reads', () => {
      const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { tags: ['Element', 'Person', 'beta '] })] } })
      expect(codes(w)).toEqual(['trimmed-tag'])
      expect(findSerializationLoss(w)[0].message).toContain('"beta"')
    })

    it('flags a tag of nothing but whitespace, which is trimmed away to nothing', () => {
      const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { tags: ['Element', '  '] })] } })
      expect(codes(w)).toEqual(['dropped-property'])
    })

    it('flags two tags that differ only by padding, which lose one outright', () => {
      const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { tags: ['beta', ' beta'] })] } })
      expect(codes(w)).toEqual(['merged-tags'])
    })

    it('flags a style selector whose padding leaves it matching nothing', () => {
      const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { tags: ['Element', 'beta '] })] } })
      w.views.configuration.styles.elements = [{ tag: 'beta ' }]
      // Both the element's tag and the selector that points at it are named.
      expect(codes(w)).toEqual(['trimmed-tag', 'trimmed-tag'])
    })

    it('flags a carriage return in a tag, which comes back as a newline', () => {
      const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { tags: ['Element', 'a\rb'] })] } })
      expect(codes(w)).toEqual(['normalized-newline'])
    })

    it('says nothing twice about the same tag listed twice', () => {
      const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { tags: ['a,b', 'a,b'] })] } })
      expect(codes(w)).toEqual(['stripped-tag-comma'])
    })

    it('reaches style tag selectors, which stop matching when they change', () => {
      const w = ws()
      w.views.configuration.styles.elements = [{ tag: 'has,comma' }]
      expect(codes(w)).toEqual(['stripped-tag-comma'])
    })
  })

  describe('properties', () => {
    it('flags a key that is renamed on the way out', () => {
      const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { properties: { 'a\\': 'x' } })] } })
      expect(codes(w)).toEqual(['renamed-property-key'])
    })

    it('flags two keys that collide once encoded — one property is simply gone', () => {
      const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { properties: { an: 'x', 'a\\n': 'y' } })] } })
      expect(codes(w)).toEqual(['dropped-property'])
      expect(findSerializationLoss(w)[0].message).toContain('one of them')
    })

    it('flags an entry the serializer refuses to emit at all', () => {
      const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { properties: { k: '\\' } })] } })
      expect(codes(w)).toEqual(['dropped-property'])
    })

    it('flags a lossy property value, not just the key', () => {
      const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { properties: { k: 'x\r\ny' } })] } })
      expect(codes(w)).toEqual(['normalized-newline'])
    })

    it('flags a key renamed by a carriage return, not just by a backslash', () => {
      const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { properties: { 'a\rb': 'x' } })] } })
      expect(codes(w)).toEqual(['renamed-property-key'])
    })

    it('flags an owner that encodes to nothing as dropped, not shortened', () => {
      const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { owner: '\\' })] } })
      expect(codes(w)).toEqual(['dropped-property'])
    })
  })

  it('flags a dynamic view step description, which the view writes itself', () => {
    const w = ws()
    w.views.dynamicViews = [
      { type: 'dynamic', key: 'Flow', elements: [], relationships: [{ id: 'r1', order: '1', description: 'calls\\' }] },
    ]
    expect(codes(w)).toEqual(['dropped-backslash'])
  })

  it('ignores an auto-generated view, which is never written to the file', () => {
    const w = ws()
    w.views.systemLandscapeViews = [
      { type: 'systemLandscape', key: 'Auto', title: 'one\r\ntwo', autoView: true, elements: [], relationships: [] },
    ]
    expect(codes(w)).toEqual([])
  })

  it('never throws on a partially-built workspace', () => {
    for (const broken of [{ name: 'x' }, { name: 'x', model: {}, views: {} }, { name: 'x', model: { people: [{}] } }]) {
      expect(() => findSerializationLoss(broken as unknown as Workspace)).not.toThrow()
    }
  })
})

// The point of this module is that it predicts what the serializer actually
// does. A prediction derived from a second reading of the rules would drift the
// first time the serializer changed, so these drive the real thing: serialize,
// parse it back, and check that a value survives exactly when
// findSerializationLoss stayed quiet about it.
describe('the prediction matches what the serializer really does', () => {
  function roundTrip(w: Workspace): Workspace {
    const { workspace, errors } = parseDSL(serializeDSL(w))
    expect(errors).toEqual([])
    return workspace
  }

  const CASES: { label: string; value: string; survives: boolean }[] = [
    { label: 'interior backslash', value: 'C:\\Program Files', survives: true },
    { label: 'apostrophe', value: "it's", survives: true },
    { label: 'quote', value: 'Say "hi"', survives: true },
    { label: 'backslash before quote', value: 'see "manual\\"', survives: true },
    { label: 'plain newline', value: 'two\nlines', survives: true },
    { label: 'tab', value: 'tab\there', survives: true },
    { label: 'padded', value: '  padded  ', survives: true },
    { label: 'non-ASCII', value: 'ünïcödé ✓ 日本語', survives: true },
    { label: 'trailing backslash', value: 'Shared Folder X:\\', survives: false },
    { label: 'backslash before n', value: 'literal \\not newline', survives: false },
    { label: 'CRLF', value: 'one\r\ntwo', survives: false },
    { label: 'lone CR', value: 'one\rtwo', survives: false },
  ]

  it.each(CASES)('$label: description survives = $survives', ({ value, survives }) => {
    const w = ws({
      model: {
        ...ws().model,
        softwareSystems: [system('s1', 'Sys', [], { description: value })],
      },
    })
    const predicted = findSerializationLoss(w).length === 0
    expect(predicted, 'findSerializationLoss disagrees with the stated expectation').toBe(survives)

    const after = roundTrip(w).model.softwareSystems[0].description
    expect(after === value, `round trip: ${JSON.stringify(value)} -> ${JSON.stringify(after)}`).toBe(survives)
  })

  it.each(CASES)('$label: name survives = $survives', ({ value, survives }) => {
    // Names take the same path but are load-bearing — an element whose name
    // changes is a different element to every downstream tool.
    const w = ws({ model: { ...ws().model, softwareSystems: [system('s1', value)] } })
    const predicted = findSerializationLoss(w).length === 0
    expect(predicted).toBe(survives)
  })

  it('a tag with a comma really does come back renamed', () => {
    const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { tags: ['Element', 'Person', 'v1,beta'] })] } })
    expect(findSerializationLoss(w)).not.toEqual([])
    expect(roundTrip(w).model.people[0].tags).toContain('v1beta')
    expect(roundTrip(w).model.people[0].tags).not.toContain('v1,beta')
  })

  it('two tags that collapse really do come back as one', () => {
    const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { tags: ['ab', 'a,b'] })] } })
    expect(findSerializationLoss(w).map(l => l.code)).toEqual(['merged-tags'])
    const after = roundTrip(w).model.people[0].tags.filter(t => t === 'ab')
    expect(after).toHaveLength(1)
  })

  it('a property whose key is renamed really does come back under the new key', () => {
    const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { properties: { 'a\\n': 'x' } })] } })
    expect(findSerializationLoss(w).map(l => l.code)).toEqual(['renamed-property-key'])
    const props = roundTrip(w).model.people[0].properties
    expect(props['a\\n']).toBeUndefined()
    expect(props.an).toBe('x')
  })

  it('a padded tag really does come back trimmed', () => {
    const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { tags: ['Element', 'Person', 'beta '] })] } })
    expect(findSerializationLoss(w).map(l => l.code)).toEqual(['trimmed-tag'])
    const after = roundTrip(w).model.people[0].tags
    expect(after).toContain('beta')
    expect(after).not.toContain('beta ')
  })

  it('two tags that differ only by padding really do come back as one', () => {
    const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { tags: ['beta', ' beta'] })] } })
    expect(findSerializationLoss(w).map(l => l.code)).toEqual(['merged-tags'])
    expect(roundTrip(w).model.people[0].tags.filter(t => t === 'beta')).toHaveLength(1)
  })

  it('a padded style selector really does stop matching its element', () => {
    const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { tags: ['Element', 'beta '] })] } })
    w.views.configuration.styles.elements = [{ tag: 'beta ' }]
    expect(findSerializationLoss(w)).not.toEqual([])
    const after = roundTrip(w)
    // The element's tag is trimmed on the way back in; the selector, a plain
    // quoted string, is not — so the style is left pointing at nothing.
    expect(after.model.people[0].tags).toContain('beta')
    expect(after.views.configuration.styles.elements[0].tag).toBe('beta ')
  })

  it('a carriage return in a tag really does come back as a newline', () => {
    const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { tags: ['Element', 'a\rb'] })] } })
    expect(findSerializationLoss(w).map(l => l.code)).toEqual(['normalized-newline'])
    expect(roundTrip(w).model.people[0].tags).toContain('a\nb')
  })

  it('a carriage return in a property key really does rename the property', () => {
    const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { properties: { 'a\rb': 'x' } })] } })
    expect(findSerializationLoss(w).map(l => l.code)).toEqual(['renamed-property-key'])
    const props = roundTrip(w).model.people[0].properties
    expect(props['a\rb']).toBeUndefined()
    expect(props['a\nb']).toBe('x')
  })

  it('an owner that encodes to nothing really is gone after a save', () => {
    const w = ws({ model: { ...ws().model, people: [person('p1', 'Ops', { owner: '\\' })] } })
    expect(findSerializationLoss(w).map(l => l.code)).toEqual(['dropped-property'])
    expect(roundTrip(w).model.people[0].owner).toBeUndefined()
  })
})
