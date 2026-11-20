import { describe, expect, it } from 'vitest'
import { createBigBankSample } from '@/lib/templates'
import { useWorkspaceStore, getActiveView } from '@/store/workspace'
import { extractSidecar, applySidecar, parseSidecar } from '@/lib/sidecar'
import { buildLayout } from './layout'
import { creatableTypes, zoomLayoutOwner, editingView } from './editing'

describe('Zoom editing', () => {
  it('persists layout separately and supports undo/redo without altering Diagram coordinates', () => {
    const s = useWorkspaceStore
    s.getState().loadWorkspace(createBigBankSample()); s.getState().setRendererMode('zoom')
    const original = s.getState().workspace!, key = s.getState().activeViewKey!, view = zoomLayoutOwner(original, key), id = original.model.softwareSystems[0].id
    s.getState().updateZoomLayout({ elements: { [id]: { x: 321, y: 456, pinned: true, locked: true } }, direction: 'LR' })
    const ws = s.getState().workspace!, restored = createBigBankSample()
    const sidecar = extractSidecar(ws)!
    applySidecar(restored, sidecar)
    expect(zoomLayoutOwner(restored, key).zoomLayout).toEqual(zoomLayoutOwner(ws, key).zoomLayout)
    expect(zoomLayoutOwner(ws, key)).toEqual({ ...view, zoomLayout: zoomLayoutOwner(ws, key).zoomLayout })
    s.getState().undo(); expect(zoomLayoutOwner(s.getState().workspace!, key).zoomLayout).toBeUndefined()
    s.getState().redo(); expect(zoomLayoutOwner(s.getState().workspace!, key).zoomLayout).toEqual(zoomLayoutOwner(ws, key).zoomLayout)
  })
  it('relayout retains locked positions, and hide/show never removes model elements', () => {
    const s = useWorkspaceStore
    s.getState().loadWorkspace(createBigBankSample()); s.getState().setRendererMode('zoom')
    const [a, b] = buildLayout(s.getState().workspace!).roots, key = s.getState().activeViewKey!
    s.getState().updateZoomLayout({ elements: { [a.id]: { x: 111, y: 222, locked: true }, [b.id]: { x: 333, y: 444 } } })
    s.getState().resetAndRelayout(key, 'LR')
    expect(zoomLayoutOwner(s.getState().workspace!, key).zoomLayout!.elements).toEqual({ [a.id]: { x: 111, y: 222, locked: true } })
    const zoomed = () => buildLayout(s.getState().workspace!, getActiveView(s.getState().workspace!, key))
    expect(zoomed().byId.has(a.id)).toBe(true)
    s.getState().removeElementsFromView(key, [a.id])
    expect(zoomed().byId.has(a.id)).toBe(false)
    s.getState().toggleElementInView(key, a.id)
    expect(zoomed().byId.has(a.id)).toBe(true)
  })
  it('chooses creation scope from the selected system/container rather than the underlying Diagram', () => {
    const ws = createBigBankSample(), system = ws.model.softwareSystems.find(s => s.containers.length)!, container = system.containers[0]
    expect(creatableTypes(ws, null, 'zoom', [system.id]).canCreateContainer).toBe(system.id)
    expect(creatableTypes(ws, null, 'zoom', [container.id]).canCreateComponent).toBe(container.id)
    expect(creatableTypes(ws, null, 'zoom', []).canCreateContainer).toBeNull()
  })
  it('rejects corrupt Zoom layout positions', () => {
    expect(parseSidecar(JSON.stringify({ version: 1, views: { Landscape: { zoomLayout: { elements: { a: { x: 'bad' } } } } } }))).toBeNull()
    expect(parseSidecar(JSON.stringify({ version: 1, views: { Landscape: { zoomLayout: { hiddenIds: [123] } } } }))).toBeNull()
  })
})

it('isolates zoom edits across views and restores them from the sidecar', () => {
  const s = useWorkspaceStore
  s.getState().loadWorkspace(createBigBankSample())
  const ws = s.getState().workspace!, first = s.getState().activeViewKey!
  const second = ws.views.systemContextViews[0].key
  s.getState().setRendererMode('zoom')
  s.getState().updateZoomLayout({ hiddenIds: ['customer'], direction: 'LR' })
  s.getState().setActiveView(second)
  expect(s.getState().rendererMode).toBe('zoom')
  expect(zoomLayoutOwner(s.getState().workspace!, second).zoomLayout).toBeUndefined()
  s.getState().updateZoomLayout({ direction: 'TB' })
  const restored = createBigBankSample()
  applySidecar(restored, parseSidecar(JSON.stringify(extractSidecar(s.getState().workspace!)))!)
  expect(zoomLayoutOwner(restored, first).zoomLayout).toEqual({ hiddenIds: ['customer'], direction: 'LR' })
  expect(zoomLayoutOwner(restored, second).zoomLayout).toEqual({ direction: 'TB' })
  expect(parseSidecar(JSON.stringify({ version: 1, views: { [first]: { zoomLayout: { elements: { customer: { x: 'bad' } } } } } }))).toBeNull()
})


it('shares view and root locks across Zoom toggles, including unlocking in Diagram', () => {
  const store = useWorkspaceStore
  store.getState().loadWorkspace(createBigBankSample())
  const key = store.getState().activeViewKey!
  const currentView = () => editingView(store.getState().workspace!, key, store.getState().rendererMode)!
  const id = currentView().elements[0].id
  store.getState().setElementsLocked(key, [id], true)
  store.getState().setViewLocked(key, true)
  store.getState().setRendererMode('zoom')
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
  store.getState().setRendererMode('zoom')
  expect(currentView().locked).toBeFalsy()
  expect(currentView().elements.find(e => e.id === id)?.locked).toBeFalsy()
  expect(currentView().zoomLayout?.locked).toBeFalsy()
  expect(currentView().zoomLayout?.elements?.[id]?.locked).toBeFalsy()
})
