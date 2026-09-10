/**
 * TEA-325 phase A: `!` preprocessor lines c4hero does not evaluate must survive
 * a parse → serialize round trip byte-for-byte, in their original block and
 * order. Before this, saving a file with `!include` silently deleted the line.
 */
import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { isWorkspaceShape } from '@/lib/fileIO'

const DSL = `workspace "Federated" "Org landscape" {
    !const ORG "Acme"
    !var REGION eu-west-1
    !docs docs
    !adrs decisions

    model {
        !include teams/payments/model.dsl
        !include teams/identity/model.dsl
        !const TIER "gold"
        u = person "User"
        sys = softwareSystem "Sys" {
            !docs sys-docs
        }
        u -> sys "Uses"
    }

    views {
        !include views/shared.dsl
        systemLandscape "Land" {
            include *
        }
    }
}
`

function block(text: string, name: 'model' | 'views'): string {
  const start = text.indexOf(`${name} {`)
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    if (text[i] === '}') { depth--; if (depth === 0) return text.slice(start, i + 1) }
  }
  return text.slice(start)
}

describe('preprocessor directives round-trip (TEA-325 A)', () => {
  it('captures directives with their block scope, in source order', () => {
    const { workspace, errors } = parseDSL(DSL)
    expect(errors).toEqual([])
    expect(workspace.directives).toEqual([
      { scope: 'workspace', raw: '!const ORG "Acme"' },
      { scope: 'workspace', raw: '!var REGION eu-west-1' },
      { scope: 'workspace', raw: '!docs docs' },
      { scope: 'workspace', raw: '!adrs decisions' },
      { scope: 'model', raw: '!include teams/payments/model.dsl' },
      { scope: 'model', raw: '!include teams/identity/model.dsl' },
      { scope: 'model', raw: '!const TIER "gold"' },
      { scope: 'views', raw: '!include views/shared.dsl' },
    ])
    // The model itself still parses normally around them.
    expect(workspace.model.people.map((p) => p.name)).toEqual(['User'])
    expect(workspace.model.relationships).toHaveLength(1)
  })

  it('re-emits every directive in its own block, ahead of generated content', () => {
    const { workspace } = parseDSL(DSL)
    const out = serializeDSL(workspace)

    // Workspace-scope lines sit before `model {`.
    const modelAt = out.indexOf('model {')
    for (const line of ['!const ORG "Acme"', '!var REGION eu-west-1', '!docs docs', '!adrs decisions']) {
      const at = out.indexOf(line)
      expect(at, line).toBeGreaterThan(-1)
      expect(at, `${line} before model block`).toBeLessThan(modelAt)
    }

    const model = block(out, 'model')
    expect(model.indexOf('!include teams/payments/model.dsl')).toBeLessThan(model.indexOf('!include teams/identity/model.dsl'))
    expect(model.indexOf('!include teams/identity/model.dsl')).toBeLessThan(model.indexOf('!const TIER "gold"'))
    expect(model.indexOf('!const TIER "gold"')).toBeLessThan(model.indexOf('person "User"'))

    const views = block(out, 'views')
    expect(views.indexOf('!include views/shared.dsl')).toBeLessThan(views.indexOf('systemLandscape'))
  })

  it('is stable: a second round trip is byte-identical to the first', () => {
    const once = serializeDSL(parseDSL(DSL).workspace)
    const twice = serializeDSL(parseDSL(once).workspace)
    expect(twice).toBe(once)
    expect(parseDSL(once).workspace.directives).toEqual(parseDSL(DSL).workspace.directives)
  })

  it('reports unresolved !include as a warning, never an error', () => {
    const { errors, warnings } = parseDSL(DSL)
    expect(errors).toEqual([])
    expect(warnings.map((w) => w.message)).toEqual([
      '!include teams/payments/model.dsl is preserved but not resolved — included content is not shown',
      '!include teams/identity/model.dsl is preserved but not resolved — included content is not shown',
      '!include views/shared.dsl is preserved but not resolved — included content is not shown',
    ])
    expect(warnings[0].line).toBe(8)
  })

  it('consumes !identifiers instead of preserving it (c4hero always writes flat ids)', () => {
    const { workspace } = parseDSL(`workspace {
    !identifiers hierarchical
    model {
        u = person "U"
    }
    views {}
}`)
    expect(workspace.directives).toBeUndefined()
    expect(serializeDSL(workspace)).not.toContain('!identifiers')
  })

  it('leaves workspaces without directives untouched', () => {
    const { workspace } = parseDSL('workspace { model { u = person "U" } views {} }')
    expect(workspace.directives).toBeUndefined()
    expect(serializeDSL(workspace)).not.toContain('!')
  })

  it('crash-recovery shape guard accepts and rejects the directives field correctly', () => {
    const { workspace } = parseDSL(DSL)
    expect(isWorkspaceShape(JSON.parse(JSON.stringify(workspace)))).toBe(true)
    const bad = { ...JSON.parse(JSON.stringify(workspace)), directives: [{ scope: 'nope', raw: '!x' }] }
    expect(isWorkspaceShape(bad)).toBe(false)
    const bad2 = { ...JSON.parse(JSON.stringify(workspace)), directives: 'oops' }
    expect(isWorkspaceShape(bad2)).toBe(false)
  })
})
