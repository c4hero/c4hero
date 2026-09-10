import { describe, it, expect } from 'vitest'
import { resolveIncludes, locateLine, normalizeIncludePath } from './includeResolver'

function fs(files: Record<string, string>) {
  return { read: async (p: string) => (p in files ? files[p] : null) }
}

const ROOT = `workspace "Org" {
    model {
        !include teams/payments.dsl
        u = person "User"
        !include teams/identity.dsl
    }
    views {
        !include views.dsl
    }
}
`

describe('normalizeIncludePath', () => {
  it('resolves relative to the including file and strips . segments', () => {
    expect(normalizeIncludePath('', 'a.dsl')).toBe('a.dsl')
    expect(normalizeIncludePath('teams', './sub/b.dsl')).toBe('teams/sub/b.dsl')
    expect(normalizeIncludePath('teams/sub', '../c.dsl')).toBe('teams/c.dsl')
    expect(normalizeIncludePath('', '"quoted name.dsl"')).toBe('quoted name.dsl')
    expect(normalizeIncludePath('', 'win\\style.dsl')).toBe('win/style.dsl')
  })

  it('rejects absolute paths, URLs, and escapes above the root', () => {
    expect(normalizeIncludePath('', '/etc/passwd')).toBeNull()
    expect(normalizeIncludePath('', 'C:\\x.dsl')).toBeNull()
    expect(normalizeIncludePath('', 'https://example.com/x.dsl')).toBeNull()
    expect(normalizeIncludePath('', '../outside.dsl')).toBeNull()
    expect(normalizeIncludePath('teams', '../../outside.dsl')).toBeNull()
  })
})

describe('resolveIncludes', () => {
  it('splices included content after each !include line and keeps the line', async () => {
    const r = await resolveIncludes(ROOT, fs({
      'teams/payments.dsl': 'pay = softwareSystem "Payments"\n',
      'teams/identity.dsl': 'idp = softwareSystem "Identity"\n',
      'views.dsl': 'systemLandscape "Land" { include * }\n',
    }))
    expect(r.errors).toEqual([])
    expect(r.files).toEqual(['teams/payments.dsl', 'teams/identity.dsl', 'views.dsl'])
    expect(r.scopes.get('teams/payments.dsl')).toBe('model')
    expect(r.scopes.get('views.dsl')).toBe('views')
    const lines = r.content.split('\n')
    expect(lines[2]).toBe('        !include teams/payments.dsl')
    expect(lines[3]).toBe('pay = softwareSystem "Payments"')
    expect(lines[4]).toBe('        u = person "User"')
    expect(lines[5]).toBe('        !include teams/identity.dsl')
    expect(lines[6]).toBe('idp = softwareSystem "Identity"')
    expect(r.content.endsWith('\n')).toBe(true)
  })

  it('maps flattened lines back to their file and line', async () => {
    const r = await resolveIncludes(ROOT, fs({
      'teams/payments.dsl': 'pay = softwareSystem "Payments"\nbilling = softwareSystem "Billing"\n',
      'teams/identity.dsl': 'idp = softwareSystem "Identity"\n',
      'views.dsl': 'systemLandscape "Land" { include * }\n',
    }))
    expect(locateLine(r.segments, 1)).toEqual({ path: '', line: 1 })
    expect(locateLine(r.segments, 3)).toEqual({ path: '', line: 3 })          // the !include line itself
    expect(locateLine(r.segments, 4)).toEqual({ path: 'teams/payments.dsl', line: 1 })
    expect(locateLine(r.segments, 5)).toEqual({ path: 'teams/payments.dsl', line: 2 })
    expect(locateLine(r.segments, 6)).toEqual({ path: '', line: 4 })          // u = person
    expect(locateLine(r.segments, 8)).toEqual({ path: 'teams/identity.dsl', line: 1 })
    expect(locateLine(r.segments, 12)).toEqual({ path: 'views.dsl', line: 1 })
  })

  it('resolves nested includes relative to the including file', async () => {
    const r = await resolveIncludes('workspace {\n  model {\n    !include teams/a.dsl\n  }\n}\n', fs({
      'teams/a.dsl': 'a = softwareSystem "A"\n!include sub/b.dsl\n',
      'teams/sub/b.dsl': 'b = softwareSystem "B"\n',
    }))
    expect(r.errors).toEqual([])
    expect(r.files).toEqual(['teams/a.dsl', 'teams/sub/b.dsl'])
    expect(r.content).toContain('b = softwareSystem "B"')
    expect(locateLine(r.segments, 6)).toEqual({ path: 'teams/sub/b.dsl', line: 1 })
  })

  it('reports a cycle naming both files and never hangs', async () => {
    const r = await resolveIncludes('workspace {\n  model {\n    !include a.dsl\n  }\n}\n', fs({
      'a.dsl': '!include b.dsl\n',
      'b.dsl': '!include a.dsl\n',
    }))
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].message).toMatch(/cycle/)
    expect(r.errors[0].message).toContain('a.dsl')
    expect(r.errors[0].message).toContain('b.dsl')
    expect(r.errors[0].path).toBe('b.dsl')
  })

  it('reports a missing file with the path and the line of the include', async () => {
    const r = await resolveIncludes(ROOT, fs({ 'teams/payments.dsl': 'x = person "X"\n' }))
    expect(r.errors.map((e) => `${e.path || 'root'}:${e.line} ${e.message}`)).toEqual([
      'root:5 !include teams/identity.dsl: file not found',
      'root:8 !include views.dsl: file not found',
    ])
    // The rest still resolved.
    expect(r.content).toContain('x = person "X"')
  })

  it('leaves URLs, absolute paths and .. escapes in place as unresolved', async () => {
    const r = await resolveIncludes('workspace {\n!include https://x/y.dsl\n!include /abs.dsl\n!include ../up.dsl\n}\n', fs({}))
    expect(r.errors).toEqual([])
    expect(r.unresolved.map((u) => u.raw)).toEqual(['!include https://x/y.dsl', '!include /abs.dsl', '!include ../up.dsl'])
  })

  it('enforces depth, file-count and byte caps', async () => {
    const deep: Record<string, string> = {}
    for (let i = 0; i < 12; i++) deep[`f${i}.dsl`] = `!include f${i + 1}.dsl\n`
    const r1 = await resolveIncludes('workspace {\n!include f0.dsl\n}\n', { ...fs(deep), maxDepth: 3 })
    expect(r1.errors[0].message).toMatch(/deeper than 3/)

    const many: Record<string, string> = {}
    let root = 'workspace {\n'
    for (let i = 0; i < 5; i++) { many[`m${i}.dsl`] = `m${i} = person "M${i}"\n`; root += `!include m${i}.dsl\n` }
    const r2 = await resolveIncludes(root + '}\n', { ...fs(many), maxFiles: 3 })
    expect(r2.errors[0].message).toMatch(/more than 3 files/)
    expect(r2.files).toHaveLength(3)

    const r3 = await resolveIncludes('workspace {\n!include big.dsl\n}\n', { ...fs({ 'big.dsl': 'x'.repeat(2000) }), maxTotalBytes: 1000 })
    expect(r3.errors[0].message).toMatch(/total size/)
  })

  it('treats a read that throws as missing rather than crashing', async () => {
    const r = await resolveIncludes('workspace {\n!include a.dsl\n}\n', { read: async () => { throw new Error('perm') } })
    expect(r.errors[0].message).toMatch(/not found/)
  })

  it('records element scope for an include inside a system block', async () => {
    const r = await resolveIncludes('workspace {\n  model {\n    sys = softwareSystem "S" {\n      !include containers.dsl\n    }\n  }\n}\n', fs({
      'containers.dsl': 'web = container "Web"\n',
    }))
    expect(r.scopes.get('containers.dsl')).toBe('element')
  })

  it('is a no-op for a document without includes', async () => {
    const text = 'workspace {\n  model {\n    u = person "U"\n  }\n}\n'
    const r = await resolveIncludes(text, fs({}))
    expect(r.content).toBe(text)
    expect(r.files).toEqual([])
    expect(r.segments).toEqual([{ path: '', start: 1, count: 5, sourceStart: 1 }])
  })
})
