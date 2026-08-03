// The Structurizr encoding contract, asserted without needing the CLI.
//
// structurizr-conformance.test.ts proves these rules against the real parser
// but skips when the CLI is absent. These tests pin the same contract in plain
// unit form so it is still covered on a bare checkout, and so a regression
// points at the exact rule that broke.
//
// The rules (verified against structurizr-java 5.0.2):
//   \" and \n are the only escapes; every other backslash is literal, and a
//   missed escape consumes only the backslash (so `a\\"b` decodes to `a\"b`).
//   A backslash before n, or at end of value, is unrepresentable; a backslash
//   before a quote is representable (the quote's own escape covers it).
//   Tags are comma-separated, so a comma inside a tag would split it.
//   `location`, `owner`, `status`, `lineStyle` and `interactionStyle` are not
//   keywords.

import { describe, it, expect } from 'vitest'
import { serializeDSL, parseDSL } from '@/lib/dsl'
import type { Workspace, SoftwareSystem, Container } from '@/types/model'

function wsWith(sys: Partial<SoftwareSystem> & { containers?: Container[] }): Workspace {
  return {
    name: 'Test',
    description: '',
    model: {
      people: [],
      softwareSystems: [{
        id: 'sys', type: 'softwareSystem', name: 'Sys',
        tags: ['Element', 'Software System'], properties: {}, containers: [],
        ...sys,
      } as SoftwareSystem],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [], systemContextViews: [], containerViews: [], componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

function container(name: string, extra: Partial<Container> = {}): Container {
  return {
    id: 'c1', type: 'container', name,
    tags: ['Element', 'Container'], properties: {}, components: [],
    ...extra,
  } as Container
}

describe('string encoding', () => {
  it('emits an interior backslash verbatim', () => {
    expect(serializeDSL(wsWith({ containers: [container('C:\\Program Files')] })))
      .toContain('"C:\\Program Files"')
  })

  it('escapes a double quote as \\"', () => {
    expect(serializeDSL(wsWith({ containers: [container('Say "hi"')] })))
      .toContain('"Say \\"hi\\""')
  })

  it('drops a trailing backslash, which would escape the closing quote', () => {
    // GH #109: `container "Shared Folder X:\\"` swallowed the closing quote
    // and produced "Too many tokens".
    const dsl = serializeDSL(wsWith({ containers: [container('Shared Folder X:\\')] }))
    expect(dsl).toContain('"Shared Folder X:"')
    expect(dsl).not.toContain('X:\\"')
  })

  it('drops a backslash that would read as a newline escape', () => {
    // `a\nb` emitted verbatim would decode as a real newline, corrupting the
    // value — and there is no way to escape the backslash itself.
    const dsl = serializeDSL(wsWith({ containers: [container('a\\nb')] }))
    expect(dsl).toContain('"anb"')
  })

  it('emits backslash-before-quote losslessly and restores it on parse', () => {
    // Raw `x\"y` emits as `x\\"y`: the tokenizer reads the first backslash as
    // a literal miss (consuming one char) and the second as the quote escape.
    const dsl = serializeDSL(wsWith({ containers: [container('x\\"y')] }))
    expect(dsl).toContain('"x\\\\"y"')
    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    expect(parsed.workspace.model.softwareSystems[0].containers[0].name).toBe('x\\"y')
  })

  it('encodes a real newline as \\n', () => {
    expect(serializeDSL(wsWith({ containers: [container('two\nlines')] })))
      .toContain('"two\\nlines"')
  })

  it('leaves a real tab alone, since \\t is not an escape', () => {
    const dsl = serializeDSL(wsWith({ containers: [container('a\tb')] }))
    expect(dsl).toContain('"a\tb"')
    expect(dsl).not.toContain('a\\tb')
  })

  it('round-trips the GH #109 values through parse', () => {
    const ws = wsWith({ containers: [container('Shared Folder X:', { description: "HOST-01 'U:\\'", technology: 'File System' })] })
    const parsed = parseDSL(serializeDSL(ws))
    expect(parsed.errors).toEqual([])
    const c = parsed.workspace.model.softwareSystems[0].containers[0]
    expect(c.name).toBe('Shared Folder X:')
    expect(c.description).toBe("HOST-01 'U:\\'")
    expect(c.technology).toBe('File System')
  })
})

describe('tags', () => {
  it('strips a comma so one tag cannot become two', () => {
    const dsl = serializeDSL(wsWith({ tags: ['Element', 'Software System', 'has,comma'] }))
    expect(dsl).toContain('"hascomma"')
  })

  it('escapes a quote inside a tag instead of emitting it bare', () => {
    const dsl = serializeDSL(wsWith({ tags: ['Element', 'Software System', 'has"quote'] }))
    expect(dsl).toContain('has\\"quote')
  })

  it('still joins multiple tags with a comma', () => {
    const dsl = serializeDSL(wsWith({ tags: ['Element', 'Software System', 'A', 'B'] }))
    expect(dsl).toContain('"A,B"')
  })

  it('skips a style whose tag sanitizes to nothing instead of emitting element ""', () => {
    // `element "" {` is rejected outright by the real parser ("A tag must
    // be specified"), so a selector that sanitizes to empty must not emit.
    const ws = wsWith({})
    ws.views.configuration.styles.elements.push({ tag: ',', background: '#999999' })
    const dsl = serializeDSL(ws)
    expect(dsl).not.toContain('element ""')
    // It was the only style, so the styles block disappears entirely.
    expect(dsl).not.toContain('styles {')
  })

  it('strips the comma from a style tag selector so it still matches the renamed tag', () => {
    // Element tags have commas stripped, so a style keyed on the same tag
    // must be renamed identically or it silently detaches.
    const ws = wsWith({ tags: ['Element', 'Software System', 'has,comma'] })
    ws.views.configuration.styles.elements.push({ tag: 'has,comma', background: '#999999' })
    ws.views.configuration.styles.relationships.push({ tag: 'slow,path', color: '#ff0000' })
    const dsl = serializeDSL(ws)
    expect(dsl).toContain('element "hascomma"')
    expect(dsl).toContain('relationship "slowpath"')
    expect(dsl).not.toContain('"has,comma"')
    expect(dsl).not.toContain('"slow,path"')
  })
})

describe('location and owner are not Structurizr keywords', () => {
  it('emits owner via properties and hoists it back on parse', () => {
    const dsl = serializeDSL(wsWith({ owner: 'Platform Team' }))
    expect(dsl).not.toMatch(/^\s*owner "/m)
    expect(dsl).toContain('"owner" "Platform Team"')

    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    const sys = parsed.workspace.model.softwareSystems[0]
    expect(sys.owner).toBe('Platform Team')
    // ...and does not linger as a stray property, so the round-trip is exact.
    expect(sys.properties.owner).toBeUndefined()
  })

  it('an explicit legacy location Internal wins over an External tag on import', () => {
    // A contradictory legacy file: the bare keyword is the more explicit
    // signal, so it wins and the tag stays put as an opaque user tag.
    const { workspace, errors } = parseDSL(`
workspace {
  model {
    s = softwareSystem "S" "" "External" {
      location Internal
    }
  }
  views {}
}
`)
    expect(errors).toEqual([])
    const sys = workspace.model.softwareSystems[0]
    expect(sys.location).toBe('Internal')
    expect(sys.tags).toContain('External')

    // On save the field wins again: the tag is dropped rather than emitted,
    // because an emitted External tag would flip the element to External on
    // the next parse.
    const dsl = serializeDSL(workspace)
    expect(dsl).not.toContain('External')
    const reparsed = parseDSL(dsl)
    expect(reparsed.errors).toEqual([])
    expect(reparsed.workspace.model.softwareSystems[0].location).not.toBe('External')
  })

  it('leaves an empty owner property as a property, so it survives round-trip', () => {
    // The serializer only re-emits a truthy owner field; hoisting "" would
    // drop the property on the next save.
    const source = `
workspace {
  model {
    s = softwareSystem "S" {
      properties {
        "owner" ""
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(source)
    expect(errors).toEqual([])
    const sys = workspace.model.softwareSystems[0]
    expect(sys.owner).toBeUndefined()
    expect(sys.properties.owner).toBe('')

    const dsl1 = serializeDSL(workspace)
    expect(dsl1).toContain('"owner" ""')
    const reparsed = parseDSL(dsl1)
    expect(serializeDSL(reparsed.workspace)).toBe(dsl1)
  })

  it('keeps an unhoistable c4hero.location value as a plain property', () => {
    // Only External/Internal hoist onto the field; anything else must stay a
    // property so no value is silently lost.
    const { workspace, errors } = parseDSL(`
workspace {
  model {
    s = softwareSystem "S" {
      properties {
        "c4hero.location" "Unspecified"
      }
    }
  }
  views {}
}
`)
    expect(errors).toEqual([])
    const sys = workspace.model.softwareSystems[0]
    expect(sys.location).toBeUndefined()
    expect(sys.properties['c4hero.location']).toBe('Unspecified')

    const dsl1 = serializeDSL(workspace)
    expect(dsl1).toContain('"c4hero.location" "Unspecified"')
    const reparsed = parseDSL(dsl1)
    expect(serializeDSL(reparsed.workspace)).toBe(dsl1)
  })

  it('an explicit Unspecified location also wins over an External tag on save', () => {
    // Same contradiction rule as Internal: any explicit non-External
    // location beats a stray External tag, so a save/reload cycle cannot
    // silently flip the element to External.
    const dsl = serializeDSL(wsWith({ location: 'Unspecified', tags: ['Element', 'Software System', 'External'] }))
    expect(dsl).not.toContain('External')
    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    expect(parsed.workspace.model.softwareSystems[0].location).not.toBe('External')
  })

  it('emits externality as the External tag and maps it back on parse', () => {
    const dsl = serializeDSL(wsWith({ location: 'External' }))
    expect(dsl).not.toContain('location External')
    expect(dsl).toContain('"External"')

    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    const sys = parsed.workspace.model.softwareSystems[0]
    expect(sys.location).toBe('External')
    expect(sys.tags).not.toContain('External')
  })

  it('stores a "__proto__" property as data on parse instead of setting the prototype', () => {
    const source = `
workspace {
  model {
    s = softwareSystem "S" {
      properties {
        "__proto__" "x"
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(source)
    expect(errors).toEqual([])
    const sys = workspace.model.softwareSystems[0]
    expect(Object.getPrototypeOf(sys.properties)).toBe(Object.prototype)
    expect(Object.entries(sys.properties)).toContainEqual(['__proto__', 'x'])

    const dsl1 = serializeDSL(workspace)
    expect(dsl1).toContain('"__proto__" "x"')
    const reparsed = parseDSL(dsl1)
    expect(serializeDSL(reparsed.workspace)).toBe(dsl1)
  })

  it('keeps a user property named after an Object.prototype member', () => {
    // The derived-vs-user merge must not treat inherited keys (constructor,
    // toString, ...) as collisions.
    const dsl = serializeDSL(wsWith({ properties: { constructor: 'x', toString: 'y' } }))
    expect(dsl).toContain('"constructor" "x"')
    expect(dsl).toContain('"toString" "y"')

    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    expect(serializeDSL(parsed.workspace)).toBe(dsl)
  })

  it('emits status via properties and hoists it back on parse', () => {
    const dsl = serializeDSL(wsWith({ status: 'Live' }))
    expect(dsl).not.toMatch(/^\s*status\s/m)
    expect(dsl).toContain('"c4hero.status" "Live"')

    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    const sys = parsed.workspace.model.softwareSystems[0]
    expect(sys.status).toBe('Live')
    expect(sys.properties['c4hero.status']).toBeUndefined()
  })

  it('still accepts the legacy bare status keyword on import', () => {
    const { workspace, errors } = parseDSL(`
workspace {
  model {
    s = softwareSystem "S" {
      status Planned
    }
  }
  views {}
}
`)
    expect(errors).toEqual([])
    expect(workspace.model.softwareSystems[0].status).toBe('Planned')
  })

  it('still accepts the legacy bare owner keyword on import', () => {
    const { workspace, errors } = parseDSL(`
workspace {
  model {
    s = softwareSystem "S" {
      owner "Legacy Team"
    }
  }
  views {}
}
`)
    expect(errors).toEqual([])
    expect(workspace.model.softwareSystems[0].owner).toBe('Legacy Team')
  })
})

describe('lineStyle and interactionStyle are not Structurizr relationship keywords', () => {
  function relWs(): Workspace {
    const ws = wsWith({})
    ws.model.people.push({ id: 'u', type: 'person', name: 'U', tags: ['Element', 'Person'], properties: {} })
    ws.model.relationships.push({
      id: 'rel-1', sourceId: 'u', destinationId: 'sys',
      description: 'Uses', technology: 'REST',
      tags: ['Relationship', 'nightly,batch'],
      properties: { 'sync.source': 'ldap' },
      interactionStyle: 'Asynchronous', lineStyle: 'Orthogonal',
    })
    return ws
  }

  it('emits both via properties, never as bare keywords', () => {
    const dsl = serializeDSL(relWs())
    expect(dsl).not.toMatch(/^\s*lineStyle\s/m)
    expect(dsl).not.toMatch(/^\s*interactionStyle\s/m)
    expect(dsl).toContain('"c4hero.lineStyle" "Orthogonal"')
    expect(dsl).toContain('"c4hero.interactionStyle" "Asynchronous"')
    // User properties still travel alongside the derived ones.
    expect(dsl).toContain('"sync.source" "ldap"')
  })

  it('hoists both back onto the fields on parse, leaving user properties alone', () => {
    const parsed = parseDSL(serializeDSL(relWs()))
    expect(parsed.errors).toEqual([])
    const rel = parsed.workspace.model.relationships[0]
    expect(rel.description).toBe('Uses')
    expect(rel.technology).toBe('REST')
    expect(rel.lineStyle).toBe('Orthogonal')
    expect(rel.interactionStyle).toBe('Asynchronous')
    expect(rel.properties).toEqual({ 'sync.source': 'ldap' })
  })

  it('still accepts the legacy bare keywords on import, and they win over the property form', () => {
    const { workspace, errors } = parseDSL(`
workspace {
  model {
    u = person "U"
    s = softwareSystem "S"
    u -> s "Uses" {
      lineStyle Curved
      interactionStyle Synchronous
      properties {
        "c4hero.lineStyle" "Orthogonal"
        "c4hero.interactionStyle" "Asynchronous"
      }
    }
  }
  views {}
}
`)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0]
    expect(rel.lineStyle).toBe('Curved')
    expect(rel.interactionStyle).toBe('Synchronous')
  })
})

describe('autoLayout', () => {
  it('emits a lowercase rank direction', () => {
    const ws = wsWith({})
    ws.views.systemLandscapeViews.push({
      key: 'k', type: 'systemLandscape', elements: [], relationships: [],
      autoLayout: { direction: 'LR' },
    })
    const dsl = serializeDSL(ws)
    // Structurizr rejects `autoLayout LR` — valid directions are tb|bt|lr|rl.
    expect(dsl).toContain('autoLayout lr')
    expect(dsl).not.toContain('autoLayout LR')
  })

  it('round-trips the direction back to the internal uppercase form', () => {
    const ws = wsWith({})
    ws.views.systemLandscapeViews.push({
      key: 'k', type: 'systemLandscape', elements: [], relationships: [],
      autoLayout: { direction: 'RL' },
    })
    const parsed = parseDSL(serializeDSL(ws))
    expect(parsed.errors).toEqual([])
    expect(parsed.workspace.views.systemLandscapeViews[0].autoLayout?.direction).toBe('RL')
  })
})
