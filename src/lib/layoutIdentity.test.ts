// Layout must stay attached to its view (TEA-342, GH #201).
//
// Layout lives per view key — in the sidecar file, and when positions are
// carried across a code-pane re-parse. That only holds while the key is
// stable, and for a view the DSL does not name it is not: the parser derives
// it from the scope and disambiguates collisions positionally. Add, delete or
// reorder such a view and the surviving keys shift underneath the layout.
//
// The file loses it for good because `extractSidecar` rewrites the whole JSON
// from the workspace on every save — it never merges. A view that is missing
// from memory for one save is deleted from disk, which is why the reporter
// could only recover from git.
//
// Each test below is one of the three reproductions from the issue.

import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from '@/store/workspace'
import { extractSidecar, applySidecar, serializeSidecar, parseSidecar } from '@/lib/sidecar'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import type { Workspace } from '@/types/model'

const st = () => useWorkspaceStore.getState()

function allViews(ws: Workspace = st().workspace!) {
  const v = ws.views
  return [
    ...v.systemLandscapeViews, ...v.systemContextViews,
    ...v.containerViews, ...v.componentViews,
    ...(v.dynamicViews ?? []), ...(v.deploymentViews ?? []),
  ]
}

function load(dsl: string) {
  const { workspace, errors } = parseDSL(dsl)
  expect(errors).toEqual([])
  st().loadWorkspace(workspace)
}

/** Hand-place every element in every view, as a user dragging them would. */
function handPlaceEverything() {
  let n = 0
  for (const key of allViews().map(v => v.key)) {
    st().setActiveView(key)
    const view = allViews().find(v => v.key === key)!
    st().updateNodePositions(view.elements.map(el => ({ id: el.id, x: 100 + (n++) * 10, y: 200 })))
  }
}

/** The sidecar as it would be written to disk right now. */
function sidecarViews(): Record<string, Record<string, { x?: number; y?: number }>> {
  const views = extractSidecar(st().workspace!)?.views ?? {}
  const out: Record<string, Record<string, { x?: number; y?: number }>> = {}
  for (const [key, v] of Object.entries(views)) {
    out[key] = Object.fromEntries(Object.entries(v.elements ?? {}).map(([id, e]) => [id, { x: e.x, y: e.y }]))
  }
  return out
}

/** Total hand-placed elements across every view — what the user would lose. */
const placedCount = () =>
  Object.values(sidecarViews()).reduce((n, els) => n + Object.keys(els).length, 0)

/** Save to disk and open it again in a fresh workspace, sidecar and all. */
function saveAndReopen() {
  const dsl = serializeDSL(st().workspace!)
  const sidecar = extractSidecar(st().workspace!)
  const { workspace, errors } = parseDSL(dsl)
  expect(errors).toEqual([])
  if (sidecar) applySidecar(workspace, parseSidecar(serializeSidecar(sidecar))!)
  st().loadWorkspace(workspace)
}

const NO_VIEWS_BLOCK = `workspace "Acme" {
  model {
    ops = person "Ops"
    payments = softwareSystem "Payments" {
      api = container "Payments API"
    }
    ops -> api "uses"
  }
}`

/** Two container views over the same system, neither given a key — so both
 *  derive the base `Containers-payments` and the second is deduped to `-2`. */
const TWO_KEYLESS_VIEWS = `workspace "Acme" {
  model {
    payments = softwareSystem "Payments" {
      api = container "Payments API"
      db = container "Payments DB"
    }
    api -> db "reads"
  }
  views {
    container payments {
      include *
    }
    container payments {
      include api
    }
  }
}`

beforeEach(() => { st().closeWorkspace() })

describe('generated views keep their layout (issue #201, mode 1)', () => {
  it('survives adding another view', () => {
    load(NO_VIEWS_BLOCK)
    // A DSL with no `views` block gets its views generated.
    expect(allViews().every(v => v.autoView)).toBe(true)
    handPlaceEverything()
    const before = sidecarViews()
    expect(Object.keys(before)).toHaveLength(3)

    // Adding any real view used to stop the generated ones being regenerated,
    // so all three vanished along with every position in them.
    st().addView('container', 'payments', 'My Containers')
    saveAndReopen()

    const after = sidecarViews()
    for (const [key, elements] of Object.entries(before)) {
      expect(after[key], `layout for "${key}" was lost`).toEqual(elements)
    }
  })

  it('leaves an untouched generated view generated', () => {
    // Materialising every view on sight would rewrite the user's file for no
    // reason; only layout they invested in earns a DSL entry.
    load(NO_VIEWS_BLOCK)
    expect(allViews().every(v => v.autoView)).toBe(true)
    expect(serializeDSL(st().workspace!)).not.toContain('SystemLandscape')
  })
})

describe('deleting a keyless view (issue #201, mode 2)', () => {
  it('leaves the survivor its own layout, not the deleted view\'s', () => {
    load(TWO_KEYLESS_VIEWS)
    expect(allViews().map(v => v.key)).toEqual(['Containers-payments', 'Containers-payments-2'])
    handPlaceEverything()
    const survivorLayout = sidecarViews()['Containers-payments-2']
    expect(Object.keys(survivorLayout).length).toBeGreaterThan(0)

    st().deleteView('Containers-payments')
    st().replaceWorkspaceFromDSL(serializeDSL(st().workspace!))

    // Whatever the survivor is called now, it must still carry its own
    // positions — and must not have inherited the deleted view's.
    const after = sidecarViews()
    expect(Object.keys(after)).toHaveLength(1)
    expect(Object.values(after)[0]).toEqual(survivorLayout)
  })
})

describe('reordering keyless views (issue #201, mode 3)', () => {
  it('KNOWN LIMITATION: swaps their layout, and drops positions the receiving view has no element for', () => {
    // Inherent, not an oversight. Two views of the same type over the same
    // scope with no key in the DSL are indistinguishable once parsed: a
    // reorder and "the user swapped the contents of these two views" produce
    // byte-identical input, so whichever is declared first takes the first
    // derived key and with it the first layout.
    //
    // Worse than a pure swap: the view that inherits an entry only applies
    // the element positions it actually contains, so a position for an
    // element it lacks is dropped. Asserted here so the cost is on the
    // record and cannot quietly get worse.
    //
    // The remedy is to give the views keys, which the next test covers.
    load(TWO_KEYLESS_VIEWS)
    handPlaceEverything()
    const before = sidecarViews()
    expect(Object.keys(before['Containers-payments'])).toEqual(['api', 'db'])

    const text = serializeDSL(st().workspace!)
    const pair = /( {8}container [^\n]*\{\n(?: {12}[^\n]*\n)* {8}\}\n)(\s*)( {8}container [^\n]*\{\n(?: {12}[^\n]*\n)* {8}\}\n)/
    expect(pair.test(text)).toBe(true)
    const swapped = text.replace(pair, (_m, a2, gap, b2) => `${b2}${gap}${a2}`)
    expect(st().replaceWorkspaceFromDSL(swapped).errors).toEqual([])

    const after = sidecarViews()
    // Both views still have layout — nothing is wholesale deleted, which is
    // the failure mode this issue was about...
    expect(Object.keys(after).sort()).toEqual(['Containers-payments', 'Containers-payments-2'])
    // ...but the one-element view took the two-element view's entry, so `db`
    // has nowhere to land.
    expect(Object.keys(after['Containers-payments'])).toEqual(['api'])
  })

  it('keeps both layouts when a view names itself in the DSL', () => {
    // The user-side remedy: an authored key is stable, so order stops
    // deciding who owns which positions.
    const named = TWO_KEYLESS_VIEWS
      .replace('    container payments {\n      include *', '    container payments "Wide" {\n      include *')
      .replace('    container payments {\n      include api', '    container payments "Narrow" {\n      include api')
    load(named)
    expect(allViews().map(v => v.key)).toEqual(['Wide', 'Narrow'])
    handPlaceEverything()
    const before = sidecarViews()

    const text = serializeDSL(st().workspace!)
    const pair = /( {8}container [^\n]*\{\n(?: {12}[^\n]*\n)* {8}\}\n)(\s*)( {8}container [^\n]*\{\n(?: {12}[^\n]*\n)* {8}\}\n)/
    const swapped = text.replace(pair, (_m, a2, gap, b2) => `${b2}${gap}${a2}`)
    expect(st().replaceWorkspaceFromDSL(swapped).errors).toEqual([])

    expect(sidecarViews()).toEqual(before)
  })
})

describe('sidecars written before the fix still load', () => {
  it('finds layout stored under a key that has since been renumbered', () => {
    // Exactly the shape an existing user's file is in: layout under the
    // derived key `Containers-payments-2`, but the view is now the only one
    // of its base and parses as `Containers-payments`.
    load(TWO_KEYLESS_VIEWS)
    handPlaceEverything()
    const staleSidecar = extractSidecar(st().workspace!)!
    const survivorLayout = staleSidecar.views!['Containers-payments-2']

    const single = `workspace "Acme" {
  model {
    payments = softwareSystem "Payments" {
      api = container "Payments API"
      db = container "Payments DB"
    }
    api -> db "reads"
  }
  views {
    container payments {
      include api
    }
  }
}`
    const { workspace } = parseDSL(single)
    expect(allViews(workspace).map(v => v.key)).toEqual(['Containers-payments'])
    applySidecar(workspace, { version: 1, views: { 'Containers-payments-2': survivorLayout } })

    const el = allViews(workspace)[0].elements.find(e => e.id === 'api')!
    expect(el.x).toBe(survivorLayout.elements!.api.x)
    expect(el.pinned).toBe(true)
  })

  it('refuses to guess when two entries could match', () => {
    // Moving someone's layout onto the wrong diagram is harder to notice than
    // losing it, so an ambiguous base match applies nothing.
    const { workspace } = parseDSL(TWO_KEYLESS_VIEWS)
    applySidecar(workspace, {
      version: 1,
      views: {
        'Containers-payments-7': { elements: { api: { pinned: true, x: 11, y: 22 } } },
        'Containers-payments-8': { elements: { api: { pinned: true, x: 33, y: 44 } } },
      },
    })
    for (const view of allViews(workspace)) {
      for (const el of view.elements) expect(el.x).toBeUndefined()
    }
  })

  it('still prefers an exact key match over the fallback', () => {
    const { workspace } = parseDSL(TWO_KEYLESS_VIEWS)
    applySidecar(workspace, {
      version: 1,
      views: {
        'Containers-payments': { elements: { api: { pinned: true, x: 1, y: 2 } } },
        'Containers-payments-2': { elements: { api: { pinned: true, x: 3, y: 4 } } },
      },
    })
    const views = allViews(workspace)
    expect(views.find(v => v.key === 'Containers-payments')!.elements.find(e => e.id === 'api')!.x).toBe(1)
    expect(views.find(v => v.key === 'Containers-payments-2')!.elements.find(e => e.id === 'api')!.x).toBe(3)
  })
})

describe('the operations from the report do not disturb layout', () => {
  const ops: [string, () => void][] = [
    ['change a relationship', () => {
      st().updateRelationship(st().workspace!.model.relationships[0].id, { description: 'uses a lot' })
    }],
    ['rename an element', () => { st().updateElement('payments', { name: 'Payments Platform' }) }],
    ['add an element', () => { st().addContainer('payments', 'Worker') }],
    ['add a view', () => { st().addView('container', 'payments', 'Another') }],
    ['duplicate a view', () => { st().duplicateView(allViews()[0].key) }],
  ]

  it.each(ops)('%s', (_label, op) => {
    load(TWO_KEYLESS_VIEWS)
    handPlaceEverything()
    const before = sidecarViews()
    expect(placedCount()).toBeGreaterThan(0)
    op()
    saveAndReopen()
    // Per view, not just in total: a count survives layout landing on the
    // wrong diagram, which is the failure that is hardest to notice.
    const after = sidecarViews()
    for (const [key, elements] of Object.entries(before)) {
      expect(after[key], `layout for "${key}" moved or was lost`).toEqual(elements)
    }
  })
})

describe('layout is never handed to the wrong view', () => {
  it('keeps a legacy entry on the view it belongs to, not the first of its base', () => {
    // Only the second of two keyless views was ever arranged, so the sidecar
    // has `-2` and nothing else. Resolving view by view let the first view's
    // base fallback claim it before the second view's exact match ran.
    const { workspace } = parseDSL(TWO_KEYLESS_VIEWS)
    applySidecar(workspace, {
      version: 1,
      views: { 'Containers-payments-2': { elements: { api: { pinned: true, x: 77, y: 88 } } } },
    })
    const [first, second] = allViews(workspace)
    expect(second.elements.find(e => e.id === 'api')!.x).toBe(77)
    expect(first.elements.find(e => e.id === 'api')!.x).toBeUndefined()
  })

  it('leaves an authored key out of the base fallback', () => {
    // The authored key here is exactly what the parser would have derived, so
    // a stale `-2` entry shares its base and only the authored/derived
    // distinction stands between them. A key someone typed is stable: a
    // sibling's leftover layout is not theirs to inherit.
    const dsl = `workspace "Acme" {
  model {
    payments = softwareSystem "Payments" {
      api = container "Payments API"
    }
  }
  views {
    container payments "Containers-payments" {
      include *
    }
  }
}`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const view = allViews(workspace)[0]
    expect(view.autoKey).toBeFalsy()
    applySidecar(workspace, {
      version: 1,
      views: { 'Containers-payments-2': { locked: true, elements: { api: { pinned: true, x: 5, y: 6 } } } },
    })
    expect(view.elements.find(e => e.id === 'api')!.x).toBeUndefined()
    expect(view.locked).toBeFalsy()
  })

  it('does not let a new keyless view inherit a deleted authored view\'s layout', () => {
    // The mirror of the test above, on the re-parse side. `Containers-payments-2`
    // here is a key someone typed, so it never moved by renumbering — deleting
    // that view and adding a keyless one in the same edit creates a *different*
    // diagram, and the fallback must not treat the leftover as its own.
    load(`workspace "Acme" {
  model {
    payments = softwareSystem "Payments" {
      api = container "Payments API"
    }
  }
  views {
    container payments "Containers-payments-2" {
      include *
    }
  }
}`)
    expect(allViews()[0].autoKey).toBeFalsy()
    handPlaceEverything()

    expect(st().replaceWorkspaceFromDSL(`workspace "Acme" {
  model {
    payments = softwareSystem "Payments" {
      api = container "Payments API"
    }
  }
  views {
    container payments {
      include *
    }
  }
}`).errors).toEqual([])

    const view = allViews()[0]
    expect(view.key).toBe('Containers-payments')
    expect(view.elements.find(e => e.id === 'api')!.x).toBeUndefined()
    // ...and the authored view's own layout is kept, not destroyed.
    expect(sidecarViews()['Containers-payments-2']).toBeDefined()
  })
})

describe('the derived-key fallback is precise', () => {
  it('a scope whose own id ends in -N keeps its layout to itself', () => {
    // The system is literally called `svc-2`, so its container view derives
    // the key `Containers-svc-2`. Stripping a trailing `-<digits>` to find the
    // base would read that as "the second view of svc" and hand it a stale
    // entry left behind by a deleted `svc` view. Built directly rather than
    // parsed so the shape under test is unambiguous.
    const workspace: Workspace = {
      name: 'Acme',
      model: {
        people: [],
        softwareSystems: [{
          id: 'svc-2', type: 'softwareSystem', name: 'Svc Two',
          tags: ['Element', 'Software System'], properties: {},
          containers: [{ id: 'b', type: 'container', name: 'B', tags: ['Element', 'Container'], properties: {}, components: [] }],
        }],
        relationships: [], groups: [], deploymentEnvironments: [],
      },
      views: {
        systemLandscapeViews: [], systemContextViews: [],
        containerViews: [{
          type: 'container', key: 'Containers-svc-2', autoKey: true,
          softwareSystemId: 'svc-2', elements: [{ id: 'b' }], relationships: [],
        }],
        componentViews: [], dynamicViews: [], deploymentViews: [],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }

    applySidecar(workspace, {
      version: 1,
      views: { 'Containers-svc': { elements: { b: { pinned: true, x: 99, y: 99 } } } },
    })
    const el = workspace.views.containerViews[0].elements[0]
    expect(el.id).toBe('b')
    expect(el.x).toBeUndefined()

    // ...while its own renumbered entry is still found, so the migration path
    // is not broken by being precise.
    applySidecar(workspace, {
      version: 1,
      views: { 'Containers-svc-2-3': { elements: { b: { pinned: true, x: 42, y: 43 } } } },
    })
    expect(el.x).toBe(42)
  })
})

describe('nothing is deleted just because it could not be matched', () => {
  it('keeps layout for views that are not in the workspace right now', () => {
    // The mechanism behind every mode above: extractSidecar projects the
    // whole file from memory, so anything absent at save time is deleted.
    const { workspace } = parseDSL(NO_VIEWS_BLOCK)
    applySidecar(workspace, {
      version: 1,
      views: { 'Containers-something-else': { elements: { gone: { pinned: true, x: 9, y: 9 } } } },
    })
    st().loadWorkspace(workspace)
    const written = extractSidecar(st().workspace!)?.views ?? {}
    expect(written['Containers-something-else']).toEqual({ elements: { gone: { pinned: true, x: 9, y: 9 } } })
  })

  it('a present view speaks for its own key, and can clear it', () => {
    // Carrying must not resurrect layout the user deliberately removed.
    const { workspace } = parseDSL(TWO_KEYLESS_VIEWS)
    applySidecar(workspace, {
      version: 1,
      views: { 'Containers-payments': { elements: { api: { pinned: true, x: 1, y: 2 } } } },
    })
    st().loadWorkspace(workspace)
    expect(extractSidecar(st().workspace!)?.views?.['Containers-payments']).toBeDefined()

    st().setActiveView('Containers-payments')
    st().resetAndRelayout('Containers-payments')
    expect(extractSidecar(st().workspace!)?.views?.['Containers-payments']).toBeUndefined()
  })

  it('carries the layout of a view that vanished across a re-parse', () => {
    load(NO_VIEWS_BLOCK)
    handPlaceEverything()
    const before = sidecarViews()
    expect(Object.keys(before)).toHaveLength(3)

    // Adding a view stops the generated ones being regenerated; their layout
    // must survive the apply that makes them disappear.
    st().addView('container', 'payments', 'Another')
    st().replaceWorkspaceFromDSL(serializeDSL(st().workspace!))
    const after = sidecarViews()
    for (const [key, elements] of Object.entries(before)) {
      expect(after[key], `layout for "${key}" was lost`).toEqual(elements)
    }
  })

  it('an ambiguous match is declined without destroying either entry', () => {
    const { workspace } = parseDSL(TWO_KEYLESS_VIEWS)
    const stale = {
      'Containers-payments-7': { elements: { api: { pinned: true, x: 11, y: 22 } } },
      'Containers-payments-8': { elements: { api: { pinned: true, x: 33, y: 44 } } },
    }
    applySidecar(workspace, { version: 1, views: stale })
    st().loadWorkspace(workspace)
    for (const view of allViews()) for (const el of view.elements) expect(el.x).toBeUndefined()
    // Declining to guess is only safe because the entries survive the save.
    const written = extractSidecar(st().workspace!)?.views ?? {}
    expect(written['Containers-payments-7']).toEqual(stale['Containers-payments-7'])
    expect(written['Containers-payments-8']).toEqual(stale['Containers-payments-8'])
  })

  it('two views sharing an authored key both get its layout', () => {
    // c4hero tolerates duplicate authored keys; matching must not make an
    // entry exclusive to whichever view is reached first.
    const dsl = `workspace "Acme" {
  model {
    payments = softwareSystem "Payments" {
      api = container "Payments API"
    }
  }
  views {
    container payments "Dup" {
      include *
    }
    container payments "Dup" {
      include *
    }
  }
}`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(allViews(workspace).map(v => v.key)).toEqual(['Dup', 'Dup'])
    applySidecar(workspace, { version: 1, views: { Dup: { elements: { api: { pinned: true, x: 1, y: 2 } } } } })
    for (const view of allViews(workspace)) {
      expect(view.elements.find(e => e.id === 'api')!.x).toBe(1)
    }
  })

  it('an unplaced view does not erase the layout of the view it shares a key with', () => {
    // Two views under one authored key, showing different elements, only one
    // of them arranged. Clearing the key per view as the save walks them let
    // the unplaced one delete the entry the placed one had just written.
    const dsl = `workspace "Acme" {
  model {
    payments = softwareSystem "Payments" {
      api = container "Payments API"
      db = container "Payments DB"
    }
    api -> db "reads"
  }
  views {
    container payments "Dup" {
      include api
    }
    container payments "Dup" {
      include db
    }
  }
}`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    applySidecar(workspace, { version: 1, views: { Dup: { elements: { api: { pinned: true, x: 1, y: 2 } } } } })
    expect(extractSidecar(workspace)?.views?.Dup).toEqual({ elements: { api: { pinned: true, x: 1, y: 2 } } })
  })

  it('writes no sidecar at all when there is no layout to write', () => {
    // A contentless `{version:1}` is not worth a file: the caller would write
    // one where it used to write nothing.
    const { workspace } = parseDSL(TWO_KEYLESS_VIEWS)
    expect(extractSidecar(workspace)).toBeNull()
  })

  it('keeps a carried entry whose key a live view happens to own', () => {
    // `unmatchedLayout` is rebuilt from scratch on every parse and holds only
    // what a matcher declined to hand out, so a live view's key appearing
    // there means the pairing was contested — not that the entry is stale.
    // Clearing it on the view's behalf would delete the layout that declining
    // was supposed to protect.
    const { workspace } = parseDSL(TWO_KEYLESS_VIEWS)
    workspace.unmatchedLayout = { 'Containers-payments': { elements: { api: { pinned: true, x: 1, y: 2 } } } }
    expect(extractSidecar(workspace)?.views?.['Containers-payments'])
      .toEqual({ elements: { api: { pinned: true, x: 1, y: 2 } } })
  })
})

describe('ambiguity is judged from both sides', () => {
  it('refuses a single stale entry that two views could equally claim', () => {
    // One candidate, two takers. Checking only "does this view have exactly
    // one option?" passes here and hands the layout to whichever view is
    // reached first — a coin flip between two diagrams.
    const { workspace } = parseDSL(TWO_KEYLESS_VIEWS)
    const stale = { 'Containers-payments-9': { elements: { api: { pinned: true, x: 77, y: 88 } } } }
    applySidecar(workspace, { version: 1, views: stale })
    for (const view of allViews(workspace)) {
      for (const el of view.elements) expect(el.x).toBeUndefined()
    }
    st().loadWorkspace(workspace)
    // And it is still on disk afterwards, so refusing costs nothing.
    expect(extractSidecar(st().workspace!)?.views?.['Containers-payments-9'])
      .toEqual(stale['Containers-payments-9'])
  })
})

// ─── The four blockers: layout that was parked has to come back ──────

describe('parked layout is handed back to the view that returns', () => {
  it('re-applies it across a code-pane re-parse', () => {
    load(NO_VIEWS_BLOCK)
    handPlaceEverything()
    const before = sidecarViews()
    expect(Object.keys(before)).toHaveLength(3)

    // Adding a view to the code pane stops the generated ones being
    // generated: they go absent and their layout is parked.
    const withAView = serializeDSL(st().workspace!).replace(/^}$/m,
      `  views {\n    container payments "Mine" {\n      include *\n    }\n  }\n}`)
    expect(st().replaceWorkspaceFromDSL(withAView).ok).toBe(true)
    expect(allViews().map(v => v.key)).toEqual(['Mine'])

    // Taking it back out brings them back — and the layout has to come with
    // them. Parking it and never handing it back is the bug.
    expect(st().replaceWorkspaceFromDSL(NO_VIEWS_BLOCK).ok).toBe(true)
    expect(sidecarViews()).toEqual(before)
  })

  it('re-applies it across a save and reopen', () => {
    load(NO_VIEWS_BLOCK)
    handPlaceEverything()
    const before = sidecarViews()

    st().addView('container', 'payments', 'My Containers')
    saveAndReopen()
    const added = allViews().find(v => v.title === 'My Containers')!
    st().deleteView(added.key)
    saveAndReopen()

    expect(allViews()).toHaveLength(3)
    expect(sidecarViews()).toEqual(before)
  })
})

describe('duplicating a generated view keeps the other generated views', () => {
  it('materialises the whole generated set', () => {
    load(NO_VIEWS_BLOCK)
    handPlaceEverything()
    const before = sidecarViews()
    const landscape = allViews().find(v => v.type === 'systemLandscape')!

    // Emitting only the copy would give the file a `views` block and suppress
    // generation entirely on the next open, taking the other three with it.
    st().duplicateView(landscape.key)
    saveAndReopen()

    const keys = allViews().map(v => v.key)
    for (const key of Object.keys(before)) expect(keys, `view "${key}" was lost`).toContain(key)
    expect(allViews()).toHaveLength(4)
    for (const [key, elements] of Object.entries(before)) {
      expect(sidecarViews()[key], `layout for "${key}" was lost`).toEqual(elements)
    }
  })
})

describe('a cold open cannot trust an exact key match either', () => {
  it('leaves the survivor its own layout when a sibling was deleted elsewhere', () => {
    // The renumbering happened in someone else's commit / a `git pull` / an
    // external editor, so there is no previous workspace to compare against.
    // The .dsl now holds only what was the *second* keyless view, so it takes
    // the base key the deleted one used to own.
    const survivorOnly = TWO_KEYLESS_VIEWS.replace(/ {4}container payments \{\n {6}include \*\n {4}\}\n/, '')
    expect(survivorOnly).not.toContain('include *')
    const { workspace, errors } = parseDSL(survivorOnly)
    expect(errors).toEqual([])
    const sidecar = parseSidecar(JSON.stringify({
      version: 1,
      views: {
        // The first keyless view, since deleted from the .dsl.
        'Containers-payments': { elements: { db: { pinned: true, x: 1, y: 1 } } },
        // The survivor, which now parses as `Containers-payments`.
        'Containers-payments-2': { elements: { api: { pinned: true, x: 50, y: 50 } } },
      },
    }))!
    applySidecar(workspace, sidecar)

    const survivor = workspace.views.containerViews[0]
    expect(survivor.key).toBe('Containers-payments')
    const api = survivor.elements.find(e => e.id === 'api')!
    expect(api.x, 'survivor inherited the deleted view\'s position').toBe(50)
  })
 
  it('does not unseat healthy views over one orphaned entry', () => {
    // The veto has to be narrow. Both views here are fine and own their
    // entries exactly; a third entry orphaned by a deletion long ago shares
    // their base. Refusing on the contest alone sent all three to the fallback
    // where they declined each other, and two correct diagrams lost their
    // layout to one piece of junk.
    const { workspace } = parseDSL(TWO_KEYLESS_VIEWS)
    applySidecar(workspace, parseSidecar(JSON.stringify({
      version: 1,
      views: {
        'Containers-payments': { elements: { api: { pinned: true, x: 11, y: 11 }, db: { pinned: true, x: 12, y: 12 } } },
        'Containers-payments-2': { elements: { api: { pinned: true, x: 22, y: 22 } } },
        'Containers-payments-3': { elements: { api: { pinned: true, x: 33, y: 33 } } },
      },
    }))!)
    const at = (i: number) => workspace.views.containerViews[i].elements.find(e => e.id === 'api')?.x
    expect(at(0), 'first view lost its own layout').toBe(11)
    expect(at(1), 'second view lost its own layout').toBe(22)
    // The orphan is kept, not applied and not deleted.
    expect(workspace.unmatchedLayout?.['Containers-payments-3']).toBeDefined()
  })
})

describe('deleting a view retires parked layout under its key', () => {
  it('does not leave an orphan behind for a later view to inherit', () => {
    // Reach the one state where a *live* view's key is also parked: the cold
    // open above declined the contested pairing, so the deleted view's entry
    // is still sitting on the key the survivor now derives.
    const survivorOnly = TWO_KEYLESS_VIEWS.replace(/ {4}container payments \{\n {6}include \*\n {4}\}\n/, '')
    const { workspace } = parseDSL(survivorOnly)
    applySidecar(workspace, parseSidecar(JSON.stringify({
      version: 1,
      views: {
        'Containers-payments': { elements: { db: { pinned: true, x: 1, y: 1 } } },
        'Containers-payments-2': { elements: { api: { pinned: true, x: 50, y: 50 } } },
      },
    }))!)
    st().loadWorkspace(workspace)
    expect(st().workspace!.unmatchedLayout?.['Containers-payments']).toBeDefined()

    // Deleting the view is the one moment the intent is unambiguous: the key
    // is gone for good, so nothing may still be held against it.
    st().deleteView('Containers-payments')
    expect(st().workspace!.unmatchedLayout?.['Containers-payments']).toBeUndefined()
    expect(sidecarViews()['Containers-payments']).toBeUndefined()
  })
})
