// The Structurizr encoding contract, asserted without needing the CLI.
//
// structurizr-conformance.test.ts proves these rules against the real parser
// but skips when the CLI is absent. These tests pin the same contract in plain
// unit form so it is still covered on a bare checkout, and so a regression
// points at the exact rule that broke.
//
// The rules (verified against structurizr-java 5.0.2):
//   \" and \n are the only escapes; every other backslash is literal.
//   A backslash before " or n, or at end of value, is unrepresentable.
//   Tags are comma-separated, so a comma inside a tag would split it.
//   `location` and `owner` are not keywords.

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

  it('drops a backslash that would start an escape sequence', () => {
    const dsl = serializeDSL(wsWith({ containers: [container('a\\nb', { technology: 'x\\"y' })] }))
    // Neither may survive as a backslash — Structurizr would read \n as a
    // newline and \" as a quote, corrupting the value either way.
    expect(dsl).toContain('"anb"')
    expect(dsl).toContain('"x\\"y"')
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
