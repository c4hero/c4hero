import { beforeEach, describe, expect, it } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { applySidecar, extractSidecar, parseSidecar, serializeSidecar } from './sidecar'
import { useWorkspaceStore } from '@/store/workspace'
import { allViewsOf, orphanedLayoutViewKeys } from '@/store/workspace-helpers'
import type { Workspace, SavedViewLayout } from '@/types/model'

const state = () => useWorkspaceStore.getState()
const model = `  model {
    payments = softwareSystem "Payments" {
      api = container "API"
      db = container "Database"
    }
    api -> db "Reads"
  }`
const wide = '    container payments "Wide" {\n      include *\n    }'
const narrow = '    container payments "Narrow" {\n      include api\n    }'
const dsl = (views = `${wide}\n${narrow}`) => `workspace "Test" {\n${model}\n  views {\n${views}\n  }\n}`
function parse(text: string) {
  const result = parseDSL(text)
  expect(result.errors).toEqual([])
  return result.workspace
}
function load(text = dsl()) { state().loadWorkspace(parse(text)) }
function layout() { return extractSidecar(state().workspace!)?.views ?? {} }
function place() {
  let n = 0
  for (const view of allViewsOf(state().workspace!)) {
    state().setActiveView(view.key)
    state().updateNodePositions(view.elements.map(el => ({ id: el.id, x: ++n * 100, y: n * 200 })))
  }
}
function reopen(text = serializeDSL(state().workspace!)) {
  const saved = extractSidecar(state().workspace!)
  const next = parse(text)
  if (saved) applySidecar(next, parseSidecar(serializeSidecar(saved))!)
  state().loadWorkspace(next)
}
function cycles() { reopen(); reopen() }
function view(ws: Workspace, key = 'Wide') { return allViewsOf(ws).find(v => v.key === key)! }

beforeEach(() => state().closeWorkspace())

describe('layout preservation through real DSL and sidecar round trips (#201)', () => {
  it('keeps generated layout when adding a view suppresses generation, and restores it when generation returns', () => {
    const generated = `workspace "Test" {\n${model}\n}`
    load(generated)
    place()
    const before = layout()
    // Cold open: no drag or lock in the session that adds the view.
    reopen()
    state().addView('container', 'payments', 'New view')
    cycles()
    expect(layout()).toEqual(before)
    expect(state().replaceWorkspaceFromDSL(generated).ok).toBe(true)
    cycles()
    expect(layout()).toEqual(before)
    for (const v of allViewsOf(state().workspace!)) {
      for (const el of v.elements) expect(el).toMatchObject(before[v.key].elements![el.id])
    }
  })

  it.each(['', '!!!'])('keeps dynamic layout when saving materializes an unusable key %j before a header description', key => {
    load(dsl(`    dynamic payments "${key}" "Description" {\n      api -> db "Reads"\n    }`))
    place()
    const original = state().workspace!.views.dynamicViews[0]
    expect(original.autoKey).toBe(true)
    expect(original.autoTitle).toBe(true)
    state().setElementsLocked(original.key, ['api'], true)
    state().setViewLocked(original.key, true)
    const before = layout()
    expect(before[original.key].view?.key).toBe(original.key)
    cycles()
    const current = state().workspace!.views.dynamicViews[0]
    expect(current.autoKey).toBeUndefined()
    expect(current.locked).toBe(true)
    expect(current.elements.find(el => el.id === 'api')).toMatchObject(before[original.key].elements!.api)
    expect(layout()).toEqual(before)
  })

  it('keeps ordinary unnamed views scope-identified when their title and description are in the body', () => {
    const unnamed = narrow.replace(' "Narrow"', '').replace('include api', 'title "Description"\n      description "Description"\n      include api')
    load(dsl(unnamed)); place()
    const before = layout()
    expect(before['Containers-payments'].view?.key).toBeUndefined()
    expect(serializeDSL(state().workspace!)).toContain('container payments {')
    cycles()
    expect(layout()).toEqual(before)
    expect(state().workspace!.views.containerViews[0].autoKey).toBe(true)
  })

  it('retains an absent view through repeated code-pane edits and restores it', () => {
    load(); place()
    const before = layout()
    expect(state().replaceWorkspaceFromDSL(dsl(narrow)).ok).toBe(true)
    cycles()
    expect(state().replaceWorkspaceFromDSL(dsl(narrow).replace('Reads', 'Writes')).ok).toBe(true)
    cycles()
    expect(layout()).toEqual(before)
    expect(state().replaceWorkspaceFromDSL(dsl()).ok).toBe(true)
    cycles()
    expect(layout()).toEqual(before)
    expect(view(state().workspace!).elements.find(e => e.id === 'db')).toMatchObject(before.Wide.elements!.db)
  })

  it('retains missing elements inside a present view, even after moving another element', () => {
    load(); place(); reopen()
    const before = layout()
    expect(state().replaceWorkspaceFromDSL(dsl(wide.replace('include *', 'include api'))).ok).toBe(true)
    state().setActiveView('Wide')
    state().updateNodePosition('api', 999, 888)
    cycles()
    expect(layout().Wide.elements!.db).toEqual(before.Wide.elements!.db)
    expect(layout().Wide.elements!.api).toMatchObject({ x: 999, y: 888 })
    expect(state().replaceWorkspaceFromDSL(dsl()).ok).toBe(true)
    cycles()
    expect(view(state().workspace!).elements.find(e => e.id === 'db')).toMatchObject(before.Wide.elements!.db)
  })

  // Reordering renumbers both derived keys. Each view's layout follows the
  // view, not the key it used to be filed under (TEA-345).
  it.each(['unchanged', 'reorder', 'delete'])('preserves sparse keyless layouts through save/reopen after an %s edit', action => {
    const a = wide.replace(' "Wide"', '')
    const b = narrow.replace(' "Narrow"', '')
    load(dsl(`${a}\n${b}`))
    state().setActiveView('Containers-payments')
    state().updateNodePosition('api', 100, 200)
    state().setActiveView('Containers-payments-2')
    state().updateNodePosition('api', 800, 450)
    state().setElementsLocked('Containers-payments-2', ['api'], true)
    const before = layout()
    expect(before['Containers-payments'].view?.elementIds).toEqual(['api', 'db'])
    expect(before['Containers-payments'].elements?.db).toBeUndefined()
    reopen(dsl(action === 'delete' ? b : action === 'reorder' ? `${b}\n${a}` : `${a}\n${b}`))
    cycles()
    const current = state().workspace!.views.containerViews
    const narrowView = current.find(v => v.elements.length === 1)!
    expect(narrowView.elements[0]).toMatchObject({ pinned: true, locked: true, x: 800, y: 450 })
    if (action !== 'delete') {
      expect(current.find(v => v.elements.length === 2)!.elements.find(e => e.id === 'api'))
        .toMatchObject({ pinned: true, x: 100, y: 200 })
    }
    expect(Object.values(layout())).toContainEqual(before['Containers-payments'])
    expect(Object.values(layout())).toContainEqual(before['Containers-payments-2'])
    expect(Object.keys(layout())).toHaveLength(2)
  })

  it.each(['unchanged', 'reorder', 'delete'])('preserves a lock-only keyless layout through save/reopen after an %s edit', action => {
    const a = wide.replace(' "Wide"', '')
    const b = narrow.replace(' "Narrow"', '')
    load(dsl(`${a}\n${b}`))
    state().setViewLocked('Containers-payments-2', true)
    const before = layout()
    expect(before['Containers-payments-2'].elements).toBeUndefined()
    reopen(dsl(action === 'delete' ? b : action === 'reorder' ? `${b}\n${a}` : `${a}\n${b}`))
    cycles()
    const current = state().workspace!.views.containerViews
    expect(current.find(v => v.elements.length === 1)!.locked).toBe(true)
    if (action !== 'delete') expect(current.find(v => v.elements.length === 2)!.locked).toBeUndefined()
    expect(Object.values(layout())).toEqual(Object.values(before))
  })

  it('keeps each keyless view\'s layout when the views reorder', () => {
    const keylessWide = wide.replace(' "Wide"', '')
    const keylessNarrow = narrow.replace(' "Narrow"', '')
    load(dsl(`${keylessWide}\n${keylessNarrow}`)); place()
    const before = layout()
    expect(state().replaceWorkspaceFromDSL(dsl(`${keylessNarrow}\n${keylessWide}`)).ok).toBe(true)
    cycles()
    expect(layout()).toEqual({
      'Containers-payments': before['Containers-payments-2'],
      'Containers-payments-2': before['Containers-payments'],
    })
    const [narrowView, wideView] = state().workspace!.views.containerViews
    expect(narrowView.elements.map(e => e.id)).toEqual(['api'])
    expect(narrowView.elements[0]).toMatchObject(before['Containers-payments-2'].elements!.api)
    expect(wideView.elements.find(e => e.id === 'db')).toMatchObject(before['Containers-payments'].elements!.db)
  })

  it('keeps the survivor\'s layout when deleting the first keyless view renumbers it', () => {
    load(dsl(`${wide.replace(' "Wide"', '')}\n${narrow.replace(' "Narrow"', '')}`)); place(); reopen()
    const before = layout()['Containers-payments-2']
    state().deleteView('Containers-payments')
    cycles()
    expect(layout()).toEqual({ 'Containers-payments': before })
    const [survivor] = state().workspace!.views.containerViews
    expect(survivor.key).toBe('Containers-payments')
    expect(survivor.elements[0]).toMatchObject(before.elements!.api)
  })

  it('keeps the survivor\'s layout when the first keyless view is deleted in the code pane', () => {
    const keylessWide = wide.replace(' "Wide"', '')
    const keylessNarrow = narrow.replace(' "Narrow"', '')
    load(dsl(`${keylessWide}\n${keylessNarrow}`)); place()
    const before = layout()
    expect(state().replaceWorkspaceFromDSL(dsl(keylessNarrow)).ok).toBe(true)
    const [survivor] = state().workspace!.views.containerViews
    expect(survivor.elements[0]).toMatchObject(before['Containers-payments-2'].elements!.api)
    cycles()
    // The deleted view's layout is retained, parked out of the survivor's way.
    expect(layout()['Containers-payments']).toEqual(before['Containers-payments-2'])
    expect(Object.values(layout())).toContainEqual(before['Containers-payments'])
  })

  it('does not hand a named view\'s layout to a keyless view that derives the same key', () => {
    // Someone named a view exactly what c4hero would derive. Deleting it and
    // adding an unnamed view of that scope is a different view.
    const named = narrow.replace('"Narrow"', '"Containers-payments"')
    load(dsl(named)); place(); reopen()
    const before = layout()
    const keylessNarrow = narrow.replace(' "Narrow"', '')
    expect(state().replaceWorkspaceFromDSL(dsl(keylessNarrow)).ok).toBe(true)
    const [view] = state().workspace!.views.containerViews
    expect(view.key).toBe('Containers-payments')
    expect(view.elements[0].pinned).toBeUndefined()
    cycles()
    // Retained, but parked out of the slot the keyless view now answers to.
    expect(Object.values(layout())).toEqual([before['Containers-payments']])
    expect(layout()['Containers-payments']).toBeUndefined()
  })

  it('gives an entry written before identities existed to the view with its key', () => {
    load(dsl(`${wide.replace(' "Wide"', '')}\n${narrow.replace(' "Narrow"', '')}`)); place()
    const legacy = structuredClone(layout())
    for (const entry of Object.values(legacy)) delete entry.view
    const next = parse(serializeDSL(state().workspace!))
    applySidecar(next, { version: 1, views: legacy })
    state().loadWorkspace(next)
    expect(state().workspace!.views.containerViews[1].elements[0]).toMatchObject(legacy['Containers-payments-2'].elements!.api)
    expect(layout()['Containers-payments-2'].view).toEqual({ type: 'container', softwareSystemId: 'payments', elementIds: ['api'] })
  })

  it.each(['delete', 'reorder'])('restores the right layout after an external %s of keyless views', action => {
    const a = wide.replace(' "Wide"', '')
    const b = narrow.replace(' "Narrow"', '')
    load(dsl(`${a}\n${b}`)); place()
    state().setViewLocked('Containers-payments-2', true)
    state().setElementsLocked('Containers-payments-2', ['api'], true)
    const before = layout()
    reopen(dsl(action === 'delete' ? b : `${b}\n${a}`))
    cycles()
    expect(layout()['Containers-payments']).toEqual(before['Containers-payments-2'])
    expect(view(state().workspace!, 'Containers-payments').locked).toBe(true)
    expect(view(state().workspace!, 'Containers-payments').elements[0]).toMatchObject(before['Containers-payments-2'].elements!.api)
    expect(Object.values(layout())).toContainEqual(before['Containers-payments'])
    // A deleted view can return even after its storage slot was reused.
    reopen(dsl(`${a}\n${b}`))
    cycles()
    expect(layout()).toEqual(before)
  })

  it('keeps transient auto-layout positions and a view lock with a distinguishable survivor', () => {
    const a = wide.replace(' "Wide"', '')
    const b = narrow.replace(' "Narrow"', '')
    load(dsl(`${a}\n${b}`))
    state().setActiveView('Containers-payments-2')
    state().syncAutoLayoutPositions('Containers-payments-2', new Map([['api', { x: 321, y: 654 }]]))
    state().setViewLocked('Containers-payments-2', true)
    expect(state().replaceWorkspaceFromDSL(dsl(b)).ok).toBe(true)
    const survivor = view(state().workspace!, 'Containers-payments')
    expect(survivor.locked).toBe(true)
    expect(survivor.elements[0]).toMatchObject({ x: 321, y: 654 })
    expect(survivor.elements[0].pinned).toBeUndefined()
  })

  it('retains ambiguous entries through repeated saves without applying a guessed owner', () => {
    const a = narrow.replace(' "Narrow"', '')
    load(dsl(`${a}\n${a}`)); place()
    const before = layout()
    reopen(dsl(a))
    cycles()
    expect(view(state().workspace!, 'Containers-payments').elements[0].pinned).toBeUndefined()
    expect(layout()['Containers-payments']).toBeUndefined()
    expect(Object.values(layout())).toEqual(Object.values(before))
    expect(orphanedLayoutViewKeys(state().workspace!)).toHaveLength(2)
    state().pruneOrphanedViewLayout()
    cycles()
    expect(layout()).toEqual({})
  })

  it('KNOWN LIMITATION: indistinguishable keyless views retain layout by key when reordered', () => {
    // Titles are labels, not stable identities; both views have the same
    // type, scope and elements. Their layouts cannot follow this reorder.
    const a = narrow.replace(' "Narrow"', '').replace('include api', 'title "First"\n      include api')
    const b = a.replace('First', 'Second')
    load(dsl(`${a}\n${b}`)); place()
    const before = layout()
    expect(state().replaceWorkspaceFromDSL(dsl(`${b}\n${a}`)).ok).toBe(true)
    cycles()
    expect(layout()).toEqual(before)
    const first = state().workspace!.views.containerViews[0]
    expect(first.title).toBe('Second')
    expect(first.elements[0]).toMatchObject(before['Containers-payments'].elements!.api)
  })

  it('treats a malformed identity as absent rather than rejecting the file', () => {
    load(dsl(wide.replace(' "Wide"', ''))); place()
    const text = serializeSidecar(extractSidecar(state().workspace!)!)
      .replace('"type": "container"', '"type": "nonsense"')
    const sidecar = parseSidecar(text)
    expect(sidecar).not.toBeNull()
    expect(sidecar!.views!['Containers-payments'].view).toBeUndefined()
    const next = parse(serializeDSL(state().workspace!))
    applySidecar(next, sidecar!)
    expect(next.views.containerViews[0].elements.find(e => e.id === 'db')?.pinned).toBe(true)
    state().loadWorkspace(next)
    expect(layout()['Containers-payments'].view).toEqual({ type: 'container', softwareSystemId: 'payments', elementIds: ['api', 'db'] })
  })

  it.each(['Billing Context', '__proto__'])('restores identified layout for an authored key %s', key => {
    const next = parse(dsl(wide.replace('Wide', key)))
    const elements = { api: { pinned: true, x: 17, y: 29 } }
    applySidecar(next, { version: 1, views: {
      parked: { view: { type: 'container', key, softwareSystemId: 'payments' }, locked: true, elements },
    } })
    state().loadWorkspace(next)
    cycles()
    const current = state().workspace!.views.containerViews[0]
    expect(current.locked).toBe(true)
    expect(current.elements.find(el => el.id === 'api')).toMatchObject(elements.api)
    expect(layout()[current.key]).toEqual({
      view: { type: 'container', key: current.key, softwareSystemId: 'payments', elementIds: ['api', 'db'] }, locked: true, elements,
    })
  })

  it.each(['relationship', 'element', 'new view'])('preserves named layouts after a %s edit', kind => {
    load(); place(); reopen()
    const before = layout()
    const changed = kind === 'relationship' ? dsl().replace('Reads', 'Writes')
      : kind === 'element' ? dsl().replace('      db =', '      worker = container "Worker"\n      db =')
      : dsl(`${wide}\n${narrow}\n    systemContext payments "Context" {\n      include *\n    }`)
    expect(state().replaceWorkspaceFromDSL(changed).ok).toBe(true)
    cycles()
    expect(layout()).toEqual(kind === 'element'
      ? { ...before, Wide: { ...before.Wide, view: { ...before.Wide.view, elementIds: ['api', 'db', 'worker'] } } }
      : before)
  })
})

describe('intentional changes remain authoritative', () => {
  it('reset clears saved positions while preserving locked elements and unrelated missing layout', () => {
    load(); place(); reopen()
    const before = layout()
    state().setElementsLocked('Wide', ['db'], true)
    expect(state().replaceWorkspaceFromDSL(dsl(wide)).ok).toBe(true)
    state().resetAndRelayout('Wide')
    cycles()
    expect(layout().Wide.elements!.api).toBeUndefined()
    expect(layout().Wide.elements!.db).toMatchObject({ ...before.Wide.elements!.db, locked: true })
    expect(layout().Narrow).toEqual(before.Narrow)
  })

  it('writes an empty sidecar when the last layout is intentionally reset', () => {
    load(dsl(wide)); place(); reopen()
    state().resetAndRelayout('Wide')
    expect(extractSidecar(state().workspace!)).toEqual({ version: 1, views: {} })
    cycles()
    expect(layout()).toEqual({})
  })

  it('view deletion removes its saved layout and undo/redo restores/removes it', () => {
    load(); place(); reopen()
    const before = layout()
    state().deleteView('Wide')
    expect(layout().Wide).toBeUndefined()
    state().undo()
    expect(layout()).toEqual(before)
    state().redo()
    cycles()
    expect(layout().Wide).toBeUndefined()
    expect(layout().Narrow).toEqual(before.Narrow)
  })

  it('explicitly prunes views removed through the code pane without touching live layout', () => {
    load(); place(); reopen()
    const before = layout()
    expect(state().replaceWorkspaceFromDSL(dsl(narrow)).ok).toBe(true)
    expect(orphanedLayoutViewKeys(state().workspace!)).toEqual(['Wide'])

    state().pruneOrphanedViewLayout()
    expect(layout().Wide).toBeUndefined()
    expect(layout().Narrow).toEqual(before.Narrow)
    expect(orphanedLayoutViewKeys(state().workspace!)).toEqual([])

    state().undo()
    expect(layout()).toEqual(before)
    state().redo()
    cycles()
    expect(layout().Wide).toBeUndefined()
    expect(layout().Narrow).toEqual(before.Narrow)
  })

  it('does not create an undo entry when there is no orphaned view layout', () => {
    load(); place(); reopen()
    const before = layout()
    const undoCount = state().undoStack.length
    state().pruneOrphanedViewLayout()
    expect(state().undoStack).toHaveLength(undoCount)
    expect(layout()).toEqual(before)
  })

  it('removing an element from a view does not resurrect its saved position', () => {
    load(); place(); reopen()
    state().removeElementsFromView('Wide', ['db'])
    cycles()
    expect(layout().Wide.elements!.db).toBeUndefined()
    state().toggleElementInView('Wide', 'db')
    cycles()
    expect(view(state().workspace!).elements.find(e => e.id === 'db')?.pinned).toBeUndefined()
  })

  it('deleting a model element also removes its retained positions in absent views', () => {
    load(); place(); reopen()
    expect(state().replaceWorkspaceFromDSL(dsl(narrow)).ok).toBe(true)
    state().deleteElement('db')
    cycles()
    expect(layout().Wide.elements!.db).toBeUndefined()
  })

  it('an ID rename moves saved positions in absent views as well as live views', () => {
    load(); place(); reopen()
    const before = layout().Wide.elements!.db
    expect(state().replaceWorkspaceFromDSL(dsl(narrow)).ok).toBe(true)
    state().updateElementId('db', 'database')
    cycles()
    expect(layout().Wide.elements!.db).toBeUndefined()
    expect(layout().Wide.elements!.database).toEqual(before)
  })

  it('unlocking a view is persisted without removing its positions', () => {
    load(dsl(wide)); place()
    state().setViewLocked('Wide', true)
    reopen()
    const positions = layout().Wide.elements
    state().setViewLocked('Wide', false)
    cycles()
    expect(layout().Wide.locked).toBeUndefined()
    expect(layout().Wide.elements).toEqual(positions)
  })

  it('renaming a scope moves retained layout to the new derived view key', () => {
    load(dsl(wide.replace(' "Wide"', ''))); place(); reopen()
    const before = layout()['Containers-payments']
    state().updateElementId('payments', 'billing')
    cycles()
    expect(layout()['Containers-payments']).toBeUndefined()
    expect(layout()['Containers-billing']).toEqual({ ...before, view: { ...before.view, softwareSystemId: 'billing' } })
  })

  it('deleting a scope clears its saved views and undo restores them', () => {
    load(); place(); reopen()
    const before = layout()
    state().deleteElement('payments')
    expect(layout()).toEqual({})
    state().undo()
    expect(layout()).toEqual(before)
    cycles()
    expect(layout()).toEqual(before)
  })

  it('failed DSL edits leave retained layout and the undo history unchanged', () => {
    load(); place(); reopen()
    expect(state().replaceWorkspaceFromDSL(dsl(narrow)).ok).toBe(true)
    const before = layout()
    const undoCount = state().undoStack.length
    expect(state().replaceWorkspaceFromDSL('workspace {').ok).toBe(false)
    expect(state().undoStack).toHaveLength(undoCount)
    cycles()
    expect(layout()).toEqual(before)
  })

  it('does not leak layout between workspaces', () => {
    load(); place(); reopen()
    load(dsl(narrow))
    expect(extractSidecar(state().workspace!)).toBeNull()
  })

  it('a duplicate gets its own authored identity and retains layout on reopen', () => {
    load(`workspace "Test" {\n${model}\n}`); place(); reopen()
    const source = allViewsOf(state().workspace!).find(v => v.type === 'container')!
    const before = layout()[source.key]
    const key = state().duplicateView(source.key)
    cycles()
    expect(allViewsOf(state().workspace!).some(v => v.key === key)).toBe(true)
    expect(layout()[key]).toEqual({ ...before, view: { ...before.view, key } })
    expect(layout()[source.key]).toEqual(before)
  })
})


describe('review regressions: recovery and ID collisions', () => {
  function pinAndHide(text: string, key: string, id: string) {
    state().setActiveView(key)
    state().updateNodePosition(id, 123, 456)
    state().setElementsLocked(key, [id], true)
    const saved = layout()[key].elements![id]
    expect(state().replaceWorkspaceFromDSL(text).ok).toBe(true)
    cycles()
    expect(view(state().workspace!, key).elements.some(e => e.id === id)).toBe(false)
    expect(layout()[key].elements![id]).toEqual(saved)
    return saved
  }

  function expectRestored(key: string, id: string, saved: NonNullable<SavedViewLayout['elements']>[string]) {
    expect(layout()[key]?.elements?.[id]).toEqual(saved)
    expect(view(state().workspace!, key).elements.find(e => e.id === id)).toMatchObject(saved)
    state().undo()
    expect(view(state().workspace!, key).elements.some(e => e.id === id)).toBe(false)
    expect(layout()[key]?.elements?.[id]).toEqual(saved)
    state().redo()
    cycles()
    expect(layout()[key]?.elements?.[id]).toEqual(saved)
    expect(view(state().workspace!, key).elements.find(e => e.id === id)).toMatchObject(saved)
  }

  it('restores retained positions and locks when adding a dynamic step', () => {
    const flow = `workspace "Test" {
      model {
        payments = softwareSystem "Payments" {
          web = container "Web"
          api = container "API"
          db = container "Database"
        }
        web -> api "Calls"
        api -> db "Reads"
      }
      views {
        dynamic payments "Flow" {
          web -> api
          api -> db
        }
      }
    }`
    load(flow)
    const saved = pinAndHide(flow.replace('          api -> db\n', ''), 'Flow', 'db')
    state().addDynamicStep('Flow', 'api', 'db')
    expectRestored('Flow', 'db', saved)
  })

  it.each(['create', 'reconnect'])('restores retained context actors when relationships %s them', action => {
    const context = `workspace "Test" {
      model {
        user = person "User"
        other = person "Other"
        payments = softwareSystem "Payments"
        other -> payments "Uses"
      }
      views {
        systemContext payments "Context" {
          include payments other user
        }
      }
    }`
    load(context)
    const saved = pinAndHide(context.replace('include payments other user', 'include payments other'), 'Context', 'user')
    if (action === 'create') state().addRelationship('user', 'payments', 'Uses')
    else state().reconnectRelationship(state().workspace!.model.relationships[0].id, 'user', 'payments')
    expectRestored('Context', 'user', saved)
  })

  it('restores retained deployment layout during topology refresh', () => {
    const deployment = `workspace "Test" {
      model {
        payments = softwareSystem "Payments" {
          api = container "API"
        }
        deploymentEnvironment "Live" {
          server = deploymentNode "Server" {
            liveApi = containerInstance api
          }
        }
      }
      views {
        deployment * "Live" "Deployment" {
          include *
        }
      }
    }`
    load(deployment)
    const saved = pinAndHide(deployment.replace('include *', 'include server'), 'Deployment', 'liveApi')
    state().addInfrastructureNode('Live', 'server')
    expectRestored('Deployment', 'liveApi', saved)
  })

  it.each([false, true])('prefers retained element IDs over same-name fallback (locked: %s)', locked => {
    const collision = (include: string) => `workspace "Test" {
      model {
        payments = softwareSystem "Payments" {
          a = container "Database"
          b = container "Database"
        }
      }
      views {
        container payments "View" {
          include ${include}
        }
      }
    }`
    load(collision('*'))
    state().setActiveView('View')
    state().updateNodePositions([{ id: 'a', x: 100, y: 200 }, { id: 'b', x: 800, y: 900 }])
    state().setElementsLocked('View', ['a'], !locked)
    state().setElementsLocked('View', ['b'], locked)
    const saved = layout().View.elements!.b
    expect(state().replaceWorkspaceFromDSL(collision('a')).ok).toBe(true)
    cycles()
    expect(state().replaceWorkspaceFromDSL(collision('b')).ok).toBe(true)
    expectRestored('View', 'b', saved)
  })

  it('restores a hidden element through the UI without resurrecting an explicit reset', () => {
    load(); place(); reopen()
    state().setElementsLocked('Wide', ['db'], true)
    const before = layout().Wide.elements!.db
    expect(state().replaceWorkspaceFromDSL(dsl(wide.replace('include *', 'include api'))).ok).toBe(true)
    cycles()
    state().toggleElementInView('Wide', 'db')
    expect(view(state().workspace!).elements.find(e => e.id === 'db')).toMatchObject(before)
    state().undo()
    expect(view(state().workspace!).elements.some(e => e.id === 'db')).toBe(false)
    state().redo()
    cycles()
    expect(layout().Wide.elements!.db).toEqual(before)
    state().setElementsLocked('Wide', ['db'], false)
    state().resetAndRelayout('Wide')
    cycles()
    expect(layout().Wide?.elements?.db).toBeUndefined()
  })

  it('rejects a rename to a retained element ID without changing the model, layout or undo history', () => {
    load(); place(); reopen()
    const withoutDb = dsl().replace('      db = container "Database"\n', '').replace('    api -> db "Reads"\n', '')
    expect(state().replaceWorkspaceFromDSL(withoutDb).ok).toBe(true)
    const workspace = state().workspace
    const undoCount = state().undoStack.length
    const before = layout()
    expect(state().updateElementId('api', 'db')).toBeTypeOf('string')
    expect(state().workspace).toBe(workspace)
    expect(state().undoStack).toHaveLength(undoCount)
    cycles()
    expect(layout()).toEqual(before)
  })

  it('derived IDs also avoid retained positions during creation and rename', () => {
    load(); place(); reopen()
    expect(state().replaceWorkspaceFromDSL(dsl().replace('      db = container "Database"\n', '').replace('    api -> db "Reads"\n', '')).ok).toBe(true)
    const saved = layout().Wide.elements!.db
    const id = state().addContainer('payments', 'DB')
    expect(id).not.toBe('db')
    state().updateElement(id, { name: 'Other' })
    state().updateElement('other', { name: 'DB' })
    expect(state().workspace!.model.softwareSystems[0].containers.some(e => e.id === 'db')).toBe(false)
    cycles()
    expect(layout().Wide.elements!.db).toEqual(saved)
  })
})


it('rejects a scope rename that would overwrite a retained view key, and derived renames choose another key', () => {
  load(dsl(wide.replace(' "Wide"', ''))); place(); reopen()
  const workspace = parse(serializeDSL(state().workspace!))
  const saved = extractSidecar(state().workspace!)!
  const retained = { locked: true, elements: { db: { pinned: true, x: 987, y: 654 } } }
  saved.views!['Containers-billing'] = retained
  applySidecar(workspace, saved)
  state().loadWorkspace(workspace)
  const before = layout()
  const undoCount = state().undoStack.length
  expect(state().updateElementId('payments', 'billing')).toBeTypeOf('string')
  expect(state().undoStack).toHaveLength(undoCount)
  expect(layout()).toEqual(before)
  state().resyncElementId('payments')
  state().updateElement('payments', { name: 'Billing' })
  expect(state().workspace!.model.softwareSystems[0].id).toBe('billing2')
  cycles()
  expect(layout()['Containers-billing']).toEqual(retained)
  expect(layout()['Containers-billing2']).toEqual({
    ...before['Containers-payments'],
    view: { type: 'container', softwareSystemId: 'billing2', elementIds: ['api', 'db'] },
  })
})
