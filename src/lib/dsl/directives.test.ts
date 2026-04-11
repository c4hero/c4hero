/**
 * Tests for Structurizr DSL directives (! prefixed).
 * These workspace-level configuration directives should be parsed without errors,
 * even though c4hero doesn't use them — real DSL files often include them.
 */
import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'

describe('Structurizr ! directives', () => {
  it('parses !identifiers without errors', () => {
    const dsl = `
workspace "Test" {
  !identifiers hierarchical
  model {
    alice = person "Alice"
  }
  views {
    systemLandscape "overview" {
      include *
    }
  }
}
`
    const { errors, workspace } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.people).toHaveLength(1)
    expect(workspace.model.people[0].name).toBe('Alice')
  })

  it('parses !impliedRelationships without errors', () => {
    const dsl = `
workspace "Test" {
  !impliedRelationships true
  model {
    alice = person "Alice"
    api = softwareSystem "API"
  }
  views {}
}
`
    const { errors, workspace } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.softwareSystems).toHaveLength(1)
  })

  it('parses !include line without errors', () => {
    const dsl = `
workspace "Test" {
  !include some/file.dsl
  model {
    alice = person "Alice"
  }
  views {}
}
`
    // !include won't actually load the file, but it should not cause a parse error
    const { errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
  })

  it('parses multiple ! directives together', () => {
    const dsl = `
workspace "Test" {
  !identifiers hierarchical
  !impliedRelationships false
  model {
    sys = softwareSystem "System"
  }
  views {
    systemLandscape "overview" {
      include *
    }
  }
}
`
    const { errors, workspace } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.model.softwareSystems).toHaveLength(1)
  })
})

describe('themes roundtrip', () => {
  it('preserves themes through serialize → parse', () => {
    const dsl = `
workspace "Test" {
  model {
    alice = person "Alice"
  }
  views {
    systemLandscape "overview" {
      include *
    }
    styles {}
    themes "https://static.structurizr.com/themes/default/theme.json"
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.views.configuration.themes).toEqual([
      'https://static.structurizr.com/themes/default/theme.json',
    ])

    // Roundtrip: serialize and re-parse
    const reserialized = serializeDSL(workspace)
    const { workspace: parsed2, errors: errors2 } = parseDSL(reserialized)
    expect(errors2).toHaveLength(0)
    expect(parsed2.views.configuration.themes).toEqual(
      workspace.views.configuration.themes,
    )
  })

  it('preserves multiple themes through roundtrip', () => {
    const dsl = `
workspace "Test" {
  model {}
  views {
    systemLandscape "overview" {
      include *
    }
    themes "https://example.com/theme1.json" "https://example.com/theme2.json"
  }
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toHaveLength(0)
    expect(workspace.views.configuration.themes).toHaveLength(2)

    const reserialized = serializeDSL(workspace)
    const { workspace: reparsed, errors: errors2 } = parseDSL(reserialized)
    expect(errors2).toHaveLength(0)
    expect(reparsed.views.configuration.themes).toEqual(workspace.views.configuration.themes)
  })
})
