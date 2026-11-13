import { describe, expect, it } from 'vitest'
import { createBigBankSample } from '@/lib/templates'
import { useWorkspaceStore } from '@/store/workspace'
import { extractSidecar, applySidecar, parseSidecar } from '@/lib/sidecar'
import { buildLayout } from './layout'
import { creatableTypes, zoomLayoutOwner, editingView } from './editing'

describe('Explore editing', () => {
  it('persists layout separately and supports undo/redo without altering Diagram coordinates', () => {
    const s = useWorkspaceStore
    s.getState().loadWorkspace(createBigBankSample()); s.getState().setRendererMode('explore')
    const original = s.getState().workspace!, key = s.getState().activeViewKey!, view = zoomLayoutOwner(original, key), id = original.model.softwareSystems[0].id
    s.getState().updateExploreLayout({ elements: { [id]: { x: 321, y: 456, pinned: true, locked: true } }, direction: 'LR' })
    const ws = s.getState().workspace!, restored = createBigBankSample()
    const sidecar = extractSidecar(ws)!
    applySidecar(restored, sidecar)
    expect(zoomLayoutOwner(restored, key).exploreLayout).toEqual(zoomLayoutOwner(ws, key).exploreLayout)
    expect(zoomLayoutOwner(ws, key)).toEqual({ ...view, exploreLayout: zoomLayoutOwner(ws, key).exploreLayout })
    s.getState().undo(); expect(zoomLayoutOwner(s.getState().workspace!, key).exploreLayout).toBeUndefined()
    s.getState().redo(); expect(zoomLayoutOwner(s.getState().workspace!, key).exploreLayout).toEqual(zoomLayoutOwner(ws, key).exploreLayout)
  })
  it('relayout retains locked positions, and hide/show never removes model elements', () => {
    const s = useWorkspaceStore
    s.getState().loadWorkspace(createBigBankSample()); s.getState().setRendererMode('explore')
    const [a, b] = buildLayout(s.getState().workspace!).roots, key = s.getState().activeViewKey!
    s.getState().updateExploreLayout({ elements: { [a.id]: { x: 111, y: 222, locked: true }, [b.id]: { x: 333, y: 444 } } })
    s.getState().resetAndRelayout(key, 'LR')
    expect(zoomLayoutOwner(s.getState().workspace!, key).exploreLayout!.elements).toEqual({ [a.id]: { x: 111, y: 222, locked: true } })
    s.getState().removeElementsFromView(key, [a.id])
    expect(buildLayout({ ...s.getState().workspace!, exploreLayout: zoomLayoutOwner(s.getState().workspace!, key).exploreLayout }).byId.has(a.id)).toBe(false)
    s.getState().toggleElementInView(key, a.id)
    expect(buildLayout({ ...s.getState().workspace!, exploreLayout: zoomLayoutOwner(s.getState().workspace!, key).exploreLayout }).byId.has(a.id)).toBe(true)
  })
  it('chooses creation scope from the selected system/container rather than the underlying Diagram', () => {
    const ws = createBigBankSample(), system = ws.model.softwareSystems.find(s => s.containers.length)!, container = system.containers[0]
    expect(creatableTypes(ws, null, 'explore', [system.id]).canCreateContainer).toBe(system.id)
    expect(creatableTypes(ws, null, 'explore', [container.id]).canCreateComponent).toBe(container.id)
    expect(creatableTypes(ws, null, 'explore', []).canCreateContainer).toBeNull()
  })
  it('rejects corrupt Explore sidecar positions', () => {
    expect(parseSidecar(JSON.stringify({ version: 1, explore: { elements: { a: { x: 'bad' } } } }))).toBeNull()
    expect(parseSidecar(JSON.stringify({ version: 1, explore: { hiddenIds: [123] } }))).toBeNull()
  })
})

it('isolates zoom edits across views and restores them from the sidecar', () => {
  const s = useWorkspaceStore
  s.getState().loadWorkspace(createBigBankSample())
  const ws = s.getState().workspace!, first = s.getState().activeViewKey!
  const second = ws.views.systemContextViews[0].key
  s.getState().setRendererMode('explore')
  s.getState().updateExploreLayout({ hiddenIds: ['customer'], direction: 'LR' })
  s.getState().setActiveView(second)
  expect(s.getState().rendererMode).toBe('explore')
  expect(zoomLayoutOwner(s.getState().workspace!, second).exploreLayout).toBeUndefined()
  s.getState().updateExploreLayout({ direction: 'TB' })
  const restored = createBigBankSample()
  applySidecar(restored, parseSidecar(JSON.stringify(extractSidecar(s.getState().workspace!)))!)
  expect(zoomLayoutOwner(restored, first).exploreLayout).toEqual({ hiddenIds: ['customer'], direction: 'LR' })
  expect(zoomLayoutOwner(restored, second).exploreLayout).toEqual({ direction: 'TB' })
  expect(parseSidecar(JSON.stringify({ version: 1, views: { [first]: { exploreLayout: { elements: { customer: { x: 'bad' } } } } } }))).toBeNull()
})


it('shares view and root locks across Zoom toggles, including unlocking in Diagram', () => {
  const store = useWorkspaceStore
  store.getState().loadWorkspace(createBigBankSample())
  const key = store.getState().activeViewKey!
  const currentView = () => editingView(store.getState().workspace!, key, store.getState().rendererMode)!
  const id = currentView().elements[0].id
  store.getState().setElementsLocked(key, [id], true)
  store.getState().setViewLocked(key, true)
  store.getState().setRendererMode('explore')
  expect(currentView().locked).toBe(true)
  expect(currentView().elements.find(e => e.id === id)?.locked).toBe(true)
  const before = store.getState().workspace
  store.getState().resetAndRelayout(key, 'LR')
  expect(store.getState().workspace).toBe(before)
  store.getState().setViewLocked(key, false)
  store.getState().setViewLocked(key, true)
  store.getState().setElementsLocked(key, [id], true)
  store.getState().setRendererMode('diagram')
  store.getState().setViewLocked(key, false)
  store.getState().setElementsLocked(key, [id], false)
  store.getState().setRendererMode('explore')
  expect(currentView().locked).toBeFalsy()
  expect(currentView().elements.find(e => e.id === id)?.locked).toBeFalsy()
  expect(currentView().exploreLayout?.locked).toBeFalsy()
  expect(currentView().exploreLayout?.elements?.[id]?.locked).toBeFalsy()
})
