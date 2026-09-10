/**
 * TEA-167: files saved by c4hero before TEA-163 used JSON-style escapes
 * (`\\` for a backslash, `\t` for a tab). The modern lexer mirrors
 * Structurizr, where only `\"` and `\n` are escapes, so such files read back
 * drifted. They are detected by the keyword lines only that old serializer
 * wrote, decoded with the old rule, and migrated on the next save.
 */
import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { detectLegacyEscapes, lex } from './lexer'

// What pre-TEA-163 c4hero actually wrote for a container named `C:\Program Files`
// with a tab in its description and a status.
const LEGACY = `workspace "Old" {
    model {
        sys = softwareSystem "Sys" {
            c1 = container "C:\\\\Program Files" "col1\\tcol2" "Win" {
                status Live
            }
        }
    }
    views {
    }
}
`

describe('detectLegacyEscapes', () => {
  it.each([
    ['status', 'status Live'],
    ['location', 'location External'],
    ['lineStyle', 'lineStyle Curved'],
    ['interactionStyle', 'interactionStyle Synchronous'],
    ['owner', 'owner "Team Payments"'],
  ])('recognises a bare %s line', (_k, line) => {
    expect(detectLegacyEscapes(`workspace {\n  model {\n    a = person "A" {\n      ${line}\n    }\n  }\n}`)).toBe(true)
  })

  it('ignores the same words inside strings, quoted property keys, and comments', () => {
    expect(detectLegacyEscapes('workspace { model { a = person "status Live" } }')).toBe(false)
    expect(detectLegacyEscapes('workspace { model { a = person "A" {\n properties {\n "status" "Live"\n }\n } } }')).toBe(false)
    expect(detectLegacyEscapes('workspace {\n // status Live\n model { } }')).toBe(false)
    expect(detectLegacyEscapes('workspace {\n model {\n statusPage = softwareSystem "S"\n } }')).toBe(false)
  })

  it('is false for modern c4hero output', () => {
    const { workspace } = parseDSL(LEGACY)
    expect(detectLegacyEscapes(serializeDSL(workspace))).toBe(false)
  })
})

describe('legacy decoding', () => {
  it('decodes \\\\ and \\t in legacy mode and leaves them literal otherwise', () => {
    const src = '"a\\\\b\\tc\\"d\\ne"'
    const legacy = lex(src, { legacyEscapes: true }).tokens[0].value
    const modern = lex(src).tokens[0].value
    expect(legacy).toBe('a\\b\tc"d\ne')
    expect(modern).toBe('a\\\\b\\tc"d\ne')
  })

  it('a legacy file loads with the values the user originally typed', () => {
    const { workspace, legacyEscapes, warnings, errors } = parseDSL(LEGACY)
    expect(errors).toEqual([])
    expect(legacyEscapes).toBe(true)
    const c1 = workspace.model.softwareSystems[0].containers[0]
    expect(c1.name).toBe('C:\\Program Files')
    expect(c1.description).toBe('col1\tcol2')
    expect(c1.status).toBe('Live')
    expect(warnings[0].message).toMatch(/Saved by an older c4hero/)
  })

  it('saving migrates the file: modern output reads back identically and is no longer legacy', () => {
    const first = parseDSL(LEGACY)
    const migrated = serializeDSL(first.workspace)
    expect(migrated).toContain('"C:\\Program Files"')     // one literal backslash
    expect(migrated).not.toContain('status Live')          // emitted as a tag/property now
    const second = parseDSL(migrated)
    expect(second.legacyEscapes).toBe(false)
    expect(second.warnings.some((w) => /older c4hero/.test(w.message))).toBe(false)
    const c1 = second.workspace.model.softwareSystems[0].containers[0]
    expect(c1.name).toBe('C:\\Program Files')
    expect(c1.description).toBe('col1\tcol2')
    expect(c1.status).toBe('Live')
  })

  it('the modern rule is untouched for files without a legacy marker', () => {
    const { workspace, legacyEscapes } = parseDSL('workspace { model { a = person "C:\\\\x" } }')
    expect(legacyEscapes).toBe(false)
    expect(workspace.model.people[0].name).toBe('C:\\\\x')
  })
})

describe('the residual gap is surfaced, not silent', () => {
  it('warns when \\\\ or \\t appear in strings but no legacy marker is present', () => {
    const looks = (src: string) => lex(src).legacyLookingEscapes
    expect(looks('workspace { model { a = person "C:\\\\x" } }')).toBe(true)
    expect(looks('workspace { model { a = person "a\\tb" } }')).toBe(true)
    expect(looks('workspace { model { a = person "C:\\x" } }')).toBe(false)
    expect(looks('workspace { // "\\\\" in a comment\n model { } }')).toBe(false)
    expect(lex('"a\\\\b"', { legacyEscapes: true }).legacyLookingEscapes).toBe(false)

    const { warnings, legacyEscapes } = parseDSL('workspace { model { a = person "C:\\\\x" } }')
    expect(legacyEscapes).toBe(false)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toMatch(/Structurizr reads literally/)
  })

  it('does not warn about a plain modern file', () => {
    const { warnings } = parseDSL('workspace { model { a = person "C:\\x" "say \\"hi\\"" } }')
    expect(warnings).toEqual([])
  })
})
