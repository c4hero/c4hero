/**
 * Regression tests for the review findings on the TEA-325 PR: directive
 * placement, provenance of directives/styles/themes from included files,
 * export paths, child provenance, read-only relationship pins.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { loadWorkspaceDocument } from '@/lib/workspaceDocument'
import { planIncludedWrites, serializeRoot } from '@/lib/includeWriteback'
import { useWorkspaceStore } from '@/store/workspace'

function store() { return useWorkspaceStore.getState() }

describe('directive placement (single-pass ordering)', () => {
  it('re-emits a model-scope !include after the declaration that preceded it', () => {
    const src = `workspace {
    model {
        u = person "User"
        !include teams/identity.dsl
        sys = softwareSystem "Sys"
    }
    views {}
}`
    const out = serializeDSL(parseDSL(src).workspace)
    const lines = out.split('\n').map((l) => l.trim())
    const iU = lines.indexOf('u = person "User"')
    const iInc = lines.indexOf('!include teams/identity.dsl')
    const iSys = lines.indexOf('sys = softwareSystem "Sys"')
    expect(iU).toBeGreaterThan(-1)
    expect(iInc).toBe(iU + 1)
    expect(iSys).toBeGreaterThan(iInc)
  })

  it('keeps a directive at the top of the model block when nothing precedes it', () => {
    const out = serializeDSL(parseDSL('workspace {\n model {\n !const X "1"\n u = person "U"\n }\n views {}\n}').workspace)
    const lines = out.split('\n').map((l) => l.trim())
    expect(lines.indexOf('!const X "1"')).toBeLessThan(lines.indexOf('u = person "U"'))
  })

  it('keeps a !include written inside a group inside that group, and keeps the group', () => {
    const src = `workspace {
    model {
        group "Team" {
            !include team.dsl
        }
        u = person "U"
    }
    views {}
}`
    const { workspace } = parseDSL(src)
    expect(workspace.directives).toEqual([{ scope: 'model', raw: '!include team.dsl', groupId: workspace.model.groups[0]?.id ?? expect.any(String) }])
    const out = serializeDSL(workspace)
    expect(out).toMatch(/group "Team" \{\s*\n\s*!include team\.dsl\s*\n\s*\}/)
  })

  it('anchors a directive after an element declared inside a group, not outside it', () => {
    const src = `workspace {
    model {
        a = person "A"
        group "Team" {
            b = person "B"
            !include more.dsl
        }
    }
    views {}
}`
    const out = serializeDSL(parseDSL(src).workspace)
    const lines = out.split('\n').map((l) => l.trim())
    expect(lines.indexOf('!include more.dsl')).toBe(lines.indexOf('b = person "B"') + 1)
    // Round trip is stable.
    expect(serializeDSL(parseDSL(out).workspace)).toBe(out)
  })
})

describe('provenance of directives, styles and themes from included files', () => {
  const ROOT = `workspace {
    model {
        !include teams/a.dsl
        u = person "U"
    }
    views {
        systemLandscape "Land" { include * }
        !include styles.dsl
    }
}`
  const FILES: Record<string, string> = {
    'teams/a.dsl': '!const X "y"\na = softwareSystem "A"\n!include sub/b.dsl\n',
    'teams/sub/b.dsl': 'b = softwareSystem "B"\n',
    'styles.dsl': 'styles {\n  element "Person" {\n    background #ff0000\n  }\n}\nthemes "https://example.com/theme.json"\n',
  }
  const read = async (p: string) => FILES[p] ?? null

  it('does not re-emit an included file\'s own directives, styles or themes into the root', async () => {
    const { workspace, errors } = await loadWorkspaceDocument({ content: ROOT, readInclude: read })
    expect(errors).toEqual([])
    const root = serializeRoot(workspace)
    expect(root).toContain('!include teams/a.dsl')
    expect(root).toContain('!include styles.dsl')
    expect(root).not.toContain('!const X')
    expect(root).not.toContain('!include sub/b.dsl')
    expect(root).not.toContain('background #ff0000')
    expect(root).not.toContain('themes')
    // The included file that owns them is read-only (it has directives) and untouched.
    expect(planIncludedWrites(workspace).map((w) => w.path)).toEqual(['teams/sub/b.dsl'])
  })

  it('exports for copy / download use the same root-only form', async () => {
    const { workspace } = await loadWorkspaceDocument({ content: ROOT, readInclude: read })
    // serializeDSL with no source is the flattened form; the export paths must
    // not use it for a multi-file workspace or the content doubles on reopen.
    expect(serializeDSL(workspace)).toContain('softwareSystem "A"')
    expect(serializeRoot(workspace)).not.toContain('softwareSystem "A"')
  })
})

describe('store rules for included content', () => {
  const ROOT = `workspace {
    model {
        u = person "U"
        !include rw.dsl
        !include ro.dsl
    }
    views {
        systemLandscape "Land" { include * }
    }
}`
  const read = async (p: string) => ({
    'rw.dsl': 'pay = softwareSystem "Pay" {\n  api = container "API"\n}\n',
    'ro.dsl': '!const X "1"\nlegacy = softwareSystem "Legacy"\nlegacy -> u "Notifies"\n',
  })[p] ?? null

  beforeEach(async () => {
    const { workspace, errors } = await loadWorkspaceDocument({ content: ROOT, readInclude: read })
    expect(errors).toEqual([])
    store().loadWorkspace(workspace)
  })

  it('a new container under an included system is written to that system\'s file', () => {
    store().addContainer('pay', 'Payments DB')
    const pay = store().workspace!.model.softwareSystems.find((s) => s.id === 'pay')!
    const db = pay.containers.find((c) => c.name === 'Payments DB')!
    expect(db.sourcePath).toBe('rw.dsl')
    const fragment = planIncludedWrites(store().workspace!).find((w) => w.path === 'rw.dsl')!.content
    expect(fragment).toContain('Payments DB')
    expect(serializeRoot(store().workspace!)).not.toContain('Payments DB')
  })

  it('refuses a new container under a read-only system', () => {
    const before = store().workspace!
    store().addContainer('legacy', 'Nope')
    expect(store().workspace).toBe(before)
  })

  it('a duplicated top-level element is root-owned; a duplicated child stays in its parent\'s file', () => {
    store().setActiveView('Land')
    store().duplicateElements(['pay'])
    const copy = store().workspace!.model.softwareSystems.find((s) => s.name === 'Pay copy')!
    expect(copy.sourcePath).toBeUndefined()
    expect(serializeRoot(store().workspace!)).toContain('Pay copy')
    // Its cloned container follows the copy (root) rather than rw.dsl.
    expect(copy.containers[0]?.sourcePath).toBeUndefined()
  })

  it('refuses to delete an element a read-only file still references', () => {
    store().deleteElements(['u'])
    expect(store().workspace!.model.people.map((p) => p.id)).toEqual(['u'])
    expect(store().workspace!.model.relationships.some((r) => r.description === 'Notifies')).toBe(true)
  })
})
