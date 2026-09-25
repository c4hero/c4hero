import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { parseDSL, serializeDSL } from '@/lib/dsl'

/** A workspace with no `views` block: every diagram comes from
 *  generateDefaultViews and carries `autoView: true`. */
const VIEWLESS_DSL = `workspace "P" {
    model {
        u = person "User"
        sys = softwareSystem "Sys" {
            web = container "Web"
        }
        u -> sys "Uses"
    }
}`

function store() {
  return useWorkspaceStore.getState()
}

function load(dsl: string = VIEWLESS_DSL) {
  const { workspace, errors } = parseDSL(dsl)
  expect(errors).toEqual([])
  useWorkspaceStore.getState().loadWorkspace(workspace)
}

function viewKeys() {
  const ws = store().workspace!
  return [
    ...ws.views.systemLandscapeViews,
    ...ws.views.systemContextViews,
    ...ws.views.containerViews,
    ...ws.views.componentViews,
  ].map(v => v.key)
}

/** The view declarations the serializer actually writes. Generated views are
 *  skipped, so this is empty until something materializes them (the `views`
 *  block itself is emitted either way). */
function serializedViewDeclarations(): string[] {
  return serializeDSL(store().workspace!)
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^(systemLandscape|systemContext|container|component|dynamic|deployment)\b/.test(l))
}

/** Keys that survive a full serialize -> parse cycle, which is what the code
 *  pane applies and what reopening the file replays. */
function keysAfterRoundtrip() {
  const dsl = serializeDSL(store().workspace!)
  const { workspace, errors } = parseDSL(dsl)
  expect(errors).toEqual([])
  const v = workspace!.views
  return [...v.systemLandscapeViews, ...v.systemContextViews, ...v.containerViews, ...v.componentViews].map(x => x.key)
}

describe('auto view materialization', () => {
  beforeEach(() => { load() })

  it('starts with generated views that the serializer omits', () => {
    expect(viewKeys().length).toBeGreaterThan(1)
    // The block itself is always emitted; what matters is that it declares
    // no diagrams, so a reparse regenerates them.
    expect(serializedViewDeclarations()).toEqual([])
  })

  it('duplicateView keeps the generated diagrams through a roundtrip', () => {
    const before = viewKeys()
    const copyKey = store().duplicateView(before[0])!

    // Every original view survives the roundtrip alongside the copy, rather
    // than the copy being the only view the re-parsed DSL contains.
    const after = keysAfterRoundtrip()
    expect(after).toHaveLength(before.length + 1)
    expect(after).toContain(copyKey)
  })

  it('addView keeps the generated diagrams through a roundtrip', () => {
    const before = viewKeys()
    const newKey = store().addView('systemLandscape', undefined, 'Extra')

    const after = keysAfterRoundtrip()
    expect(after).toHaveLength(before.length + 1)
    expect(after).toContain(newKey)
  })

  it('materializes only once — a second authored view does not re-flag', () => {
    store().addView('systemLandscape', undefined, 'First')
    const afterFirst = keysAfterRoundtrip()
    store().addView('systemLandscape', undefined, 'Second')
    expect(keysAfterRoundtrip()).toHaveLength(afterFirst.length + 1)
  })

  it('undo restores the generated, unserialized state', () => {
    store().duplicateView(viewKeys()[0])
    store().undo()
    expect(serializedViewDeclarations()).toEqual([])
  })

  it('leaves an authored workspace alone', () => {
    load(`workspace "P" {
    model {
        sys = softwareSystem "Sys"
    }
    views {
        systemContext sys "Main" {
            include *
        }
    }
}`)
    const before = keysAfterRoundtrip()
    const copyKey = store().duplicateView(before[0])!
    const after = keysAfterRoundtrip()
    expect(after).toHaveLength(before.length + 1)
    expect(after).toContain(copyKey)
  })
})
