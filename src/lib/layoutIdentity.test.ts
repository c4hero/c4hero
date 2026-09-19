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

  it('writes a hand-placed generated view into the DSL, so it cannot evaporate', () => {
    load(NO_VIEWS_BLOCK)
    const key = allViews()[0].key
    st().setActiveView(key)
    st().updateNodePosition(allViews()[0].elements[0].id, 500, 600)

    const view = allViews().find(v => v.key === key)!
    expect(view.autoView).toBeUndefined()
    expect(view.autoKey).toBeUndefined()
    // Its key is now authored rather than derived, so nothing can renumber it.
    expect(serializeDSL(st().workspace!)).toContain(`"${key}"`)
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
  it('does not swap their layout', () => {
    load(TWO_KEYLESS_VIEWS)
    handPlaceEverything()
    const before = sidecarViews()
    const first = before['Containers-payments']
    const second = before['Containers-payments-2']
    expect(first).not.toEqual(second)

    // An edit anywhere above can change which view is declared first. Once
    // both views are materialised their keys are authored, so the order in
    // the text no longer decides who owns which positions.
    const text = serializeDSL(st().workspace!)
    const pair = /( {8}container [^\n]*\{\n(?: {12}[^\n]*\n)* {8}\}\n)(\s*)( {8}container [^\n]*\{\n(?: {12}[^\n]*\n)* {8}\}\n)/
    expect(pair.test(text)).toBe(true)
    const swapped = text.replace(pair, (_m, a, gap, b) => `${b}${gap}${a}`)
    expect(swapped).not.toBe(text)

    const result = st().replaceWorkspaceFromDSL(swapped)
    expect(result.errors).toEqual([])

    const after = sidecarViews()
    expect(after['Containers-payments']).toEqual(first)
    expect(after['Containers-payments-2']).toEqual(second)
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
})

describe('materialising one generated view (issue #201, mode 1)', () => {
  it('keeps the generated views it did not touch', () => {
    // Generated views are all-or-nothing: once the DSL names any view, none
    // of them are regenerated. Writing out only the arranged one deleted the
    // other diagrams outright.
    load(NO_VIEWS_BLOCK)
    const before = allViews().map(v => v.key).sort()
    expect(before.length).toBe(3)

    const target = allViews().find(v => v.type === 'container')!
    st().setActiveView(target.key)
    st().updateNodePosition(target.elements[0].id, 500, 600)
    saveAndReopen()

    expect(allViews().map(v => v.key).sort()).toEqual(before)
    expect(placedCount()).toBe(1)
  })

  it('gives a duplicated view an identity of its own', () => {
    // The clone inherits `autoView` / `autoKey` / `originalKey` unless they
    // are cleared: the first means it is never serialized at all, the second
    // drops its key, and the third lets it claim the source's layout.
    load(NO_VIEWS_BLOCK)
    const src = allViews().find(v => v.type === 'container')!
    const newKey = st().duplicateView(src.key)
    const { workspace, errors } = parseDSL(serializeDSL(st().workspace!))
    expect(errors).toEqual([])
    expect(allViews(workspace).some(v => v.key === newKey)).toBe(true)
  })
})

describe('the DSL is only rewritten when there is something to protect', () => {
  it('unlocking never-positioned elements leaves the view generated', () => {
    load(NO_VIEWS_BLOCK)
    const view = allViews()[0]
    const ids = view.elements.map(e => e.id)
    st().setElementsLocked(view.key, ids, true)
    st().unlockAllInView(view.key)
    // Locking adopted the positions, so this view is legitimately materialised
    // — but a view with nothing placed in it must stay out of the file.
    load(NO_VIEWS_BLOCK)
    const untouched = allViews()[1]
    st().setElementsLocked(untouched.key, untouched.elements.map(e => e.id), false)
    expect(allViews().find(v => v.key === untouched.key)!.autoView).toBe(true)
  })

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
