/**
 * TEA-325 phase B: loading a folder workspace resolves `!include`, tags every
 * declaration with the file it came from, points errors at that file, and
 * partitions saves so the root never swallows an included file's content.
 */
import { describe, it, expect } from 'vitest'
import { loadWorkspaceDocument, parseWorkspaceDocument } from './workspaceDocument'
import { serializeDSL } from '@/lib/dsl'
import { planIncludedWrites, serializeRoot, isReadOnlySource } from '@/lib/includeWriteback'
import { isWorkspaceShape } from '@/lib/fileIO'

const ROOT = `workspace "Org" "Everything" {
    model {
        !include teams/payments.dsl
        u = person "User"
        !include teams/identity.dsl
        u -> pay "Pays with"
    }
    views {
        systemLandscape "Land" {
            include *
        }
        !include views/extra.dsl
    }
}
`
const FILES: Record<string, string> = {
  'teams/payments.dsl': `pay = softwareSystem "Payments" "Takes money" {
    api = container "Payments API" "" "Go"
}
`,
  // Structurizr is single-pass: a reference must follow its declaration, so
  // the cross-team relationship lives in the file that declares `idp`.
  'teams/identity.dsl': `idp = softwareSystem "Identity"
pay -> idp "Verifies"
`,
  'views/extra.dsl': `systemContext pay "PayCtx" {
    include *
}
`,
}
const read = async (p: string) => (p in FILES ? FILES[p] : null)

describe('loadWorkspaceDocument with includes', () => {
  it('stitches the full model and tags provenance per declaration', async () => {
    const { workspace, errors } = await loadWorkspaceDocument({ content: ROOT, fallbackName: 'org', readInclude: read })
    expect(errors).toEqual([])
    expect(workspace.model.softwareSystems.map((s) => s.name).sort()).toEqual(['Identity', 'Payments'])
    const pay = workspace.model.softwareSystems.find((s) => s.id === 'pay')!
    expect(pay.sourcePath).toBe('teams/payments.dsl')
    expect(pay.containers[0].sourcePath).toBe('teams/payments.dsl')
    expect(workspace.model.softwareSystems.find((s) => s.id === 'idp')!.sourcePath).toBe('teams/identity.dsl')
    expect(workspace.model.people[0].sourcePath).toBeUndefined()
    const rels = workspace.model.relationships
    expect(rels.find((r) => r.description === 'Verifies')!.sourcePath).toBe('teams/identity.dsl')
    expect(rels.find((r) => r.description === 'Pays with')!.sourcePath).toBeUndefined()
    expect(workspace.views.systemLandscapeViews[0].sourcePath).toBeUndefined()
    expect(workspace.views.systemContextViews[0].sourcePath).toBe('views/extra.dsl')
    // The include lines themselves are still preserved directives.
    expect(workspace.directives?.map((d) => d.raw)).toEqual([
      '!include teams/payments.dsl', '!include teams/identity.dsl', '!include views/extra.dsl',
    ])
  })

  it('classifies which included files can be written back', async () => {
    const { workspace } = await loadWorkspaceDocument({ content: ROOT, readInclude: read })
    expect(workspace.includedFiles).toEqual([
      { path: 'teams/payments.dsl', writable: true, text: FILES['teams/payments.dsl'] },
      { path: 'teams/identity.dsl', writable: true, text: FILES['teams/identity.dsl'] },
      { path: 'views/extra.dsl', writable: false, reason: 'included in the views block', text: FILES['views/extra.dsl'] },
    ])
    expect(isReadOnlySource(workspace, 'views/extra.dsl')).toBe(true)
    expect(isReadOnlySource(workspace, 'teams/payments.dsl')).toBe(false)
    expect(isReadOnlySource(workspace, undefined)).toBe(false)
  })

  it('marks fragments with their own directives, wrappers, or element scope read-only', async () => {
    const root = `workspace {
    model {
        !include a.dsl
        !include b.dsl
        sys = softwareSystem "S" {
            !include c.dsl
        }
    }
    views {}
}`
    const { workspace } = await loadWorkspaceDocument({ content: root, readInclude: async (p) => ({
      'a.dsl': '!const X "y"\nx = person "X"\n',
      'b.dsl': 'model {\n  y = person "Y"\n}\n',
      'c.dsl': 'web = container "Web"\n',
    })[p] ?? null })
    expect(workspace.includedFiles?.map(({ path, writable, reason }) => ({ path, writable, reason }))).toEqual([
      { path: 'a.dsl', writable: false, reason: 'contains its own ! directives' },
      { path: 'b.dsl', writable: false, reason: 'not a plain model fragment' },
      { path: 'c.dsl', writable: false, reason: 'included inside an element block' },
    ])
    const sys = workspace.model.softwareSystems[0]
    expect(sys.directives).toEqual(['!include c.dsl'])
    expect(sys.containers[0].sourcePath).toBe('c.dsl')
  })

  it('points parse errors at the included file and line, and reports resolution failures as errors', async () => {
    const { errors } = await loadWorkspaceDocument({ content: ROOT, readInclude: async (p) => (
      p === 'teams/payments.dsl' ? 'pay = softwareSystem "Payments"\npay -> nope "x"\n' : read(p)
    ) })
    expect(errors.some((e) => e.message.startsWith('teams/payments.dsl:2:'))).toBe(true)

    const missing = await loadWorkspaceDocument({ content: ROOT, readInclude: async (p) => (p === 'teams/identity.dsl' ? null : read(p)) })
    expect(missing.errors.map((e) => e.message)).toContain('!include teams/identity.dsl: file not found')
  })

  it('drops the "preserved but not resolved" warning for includes that resolved', async () => {
    const { warnings } = await loadWorkspaceDocument({ content: ROOT, readInclude: read })
    expect(warnings).toEqual([])
    const single = parseWorkspaceDocument({ content: ROOT })
    expect(single.warnings).toHaveLength(3)
  })

  it('serializes the root with only root-owned content plus the include lines', async () => {
    const { workspace } = await loadWorkspaceDocument({ content: ROOT, readInclude: read })
    const root = serializeRoot(workspace)
    expect(root).toContain('!include teams/payments.dsl')
    expect(root).toContain('person "User"')
    expect(root).toContain('u -> pay "Pays with"')
    expect(root).not.toContain('softwareSystem "Payments"')
    expect(root).not.toContain('softwareSystem "Identity"')
    expect(root).not.toContain('pay -> idp')
    expect(root).not.toContain('PayCtx')
    expect(root).toContain('systemLandscape "Land"')
  })

  it('plans a bare model fragment for each writable included file', async () => {
    const { workspace } = await loadWorkspaceDocument({ content: ROOT, readInclude: read })
    const writes = planIncludedWrites(workspace)
    expect(writes.map((w) => w.path)).toEqual(['teams/payments.dsl', 'teams/identity.dsl'])
    const pay = writes[0].content
    expect(pay.startsWith('pay = softwareSystem "Payments" "Takes money" {')).toBe(true)
    expect(pay).toContain('    api = container "Payments API" "" "Go"')
    expect(pay).not.toContain('pay -> idp')
    expect(pay).not.toContain('model {')
    expect(pay).not.toContain('person "User"')
    expect(writes[1].content).toBe('idp = softwareSystem "Identity"\n\npay -> idp "Verifies"\n')
  })

  it('the written fragments re-stitch to the same model', async () => {
    const first = await loadWorkspaceDocument({ content: ROOT, readInclude: read })
    const writes = planIncludedWrites(first.workspace)
    const files2: Record<string, string> = { ...FILES }
    for (const w of writes) files2[w.path] = w.content
    const root2 = serializeRoot(first.workspace)
    const second = await loadWorkspaceDocument({ content: root2, readInclude: async (p) => files2[p] ?? null })
    expect(second.errors).toEqual([])
    expect(second.workspace.model.softwareSystems.map((s) => s.name).sort()).toEqual(['Identity', 'Payments'])
    expect(second.workspace.model.relationships).toHaveLength(2)
    expect(serializeRoot(second.workspace)).toBe(root2)
    expect(planIncludedWrites(second.workspace)).toEqual(writes)
  })

  it('a workspace without includes serializes exactly as before', async () => {
    const plain = 'workspace { model { u = person "U" } views {} }'
    const { workspace } = await loadWorkspaceDocument({ content: plain, readInclude: read })
    expect(workspace.includedFiles).toBeUndefined()
    expect(serializeRoot(workspace)).toBe(serializeDSL(workspace))
    expect(planIncludedWrites(workspace)).toEqual([])
  })

  it('crash-recovery shape guard accepts includedFiles and provenance', async () => {
    const { workspace } = await loadWorkspaceDocument({ content: ROOT, readInclude: read })
    expect(isWorkspaceShape(JSON.parse(JSON.stringify(workspace)))).toBe(true)
    expect(isWorkspaceShape({ ...JSON.parse(JSON.stringify(workspace)), includedFiles: [{ path: 1 }] })).toBe(false)
  })
})
