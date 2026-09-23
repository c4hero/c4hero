import { describe, expect, it } from 'vitest'
import { createBigBankSample } from '@/lib/templates'
import { useWorkspaceStore } from '@/store/workspace'
import { extractSidecar, applySidecar, parseSidecar } from '@/lib/sidecar'
import { buildLayout } from './layout'
import { creatableTypes } from './editing'

describe('Explore editing', () => {
  it('persists layout separately and supports undo/redo without altering Diagram coordinates', () => {
    const s = useWorkspaceStore
    s.getState().loadWorkspace(createBigBankSample()); s.getState().setRendererMode('explore')
    const original = s.getState().workspace!, views = JSON.stringify(original.views), id = original.model.softwareSystems[0].id
    s.getState().updateExploreLayout({ elements: { [id]: { x: 321, y: 456, pinned: true, locked: true } }, direction: 'LR' })
    const ws = s.getState().workspace!, restored = createBigBankSample()
    const sidecar = extractSidecar(ws)!
    applySidecar(restored, sidecar)
    expect(buildLayout(restored).byId.get(id)).toMatchObject({ x: 321, y: 456 })
    expect(JSON.stringify(ws.views)).toBe(views)
    s.getState().undo(); expect(s.getState().workspace?.exploreLayout).toBeUndefined()
    s.getState().redo(); expect(s.getState().workspace?.exploreLayout).toEqual(ws.exploreLayout)
  })
  it('relayout retains locked positions, and hide/show never removes model elements', () => {
    const s = useWorkspaceStore
    s.getState().loadWorkspace(createBigBankSample()); s.getState().setRendererMode('explore')
    const [a, b] = buildLayout(s.getState().workspace!).roots, key = s.getState().activeViewKey!
    s.getState().updateExploreLayout({ elements: { [a.id]: { x: 111, y: 222, locked: true }, [b.id]: { x: 333, y: 444 } } })
    s.getState().resetAndRelayout(key, 'LR')
    expect(s.getState().workspace!.exploreLayout!.elements).toEqual({ [a.id]: { x: 111, y: 222, locked: true } })
    s.getState().removeElementsFromView(key, [a.id])
    expect(buildLayout(s.getState().workspace!).byId.has(a.id)).toBe(false)
    s.getState().toggleElementInView(key, a.id)
    expect(buildLayout(s.getState().workspace!).byId.has(a.id)).toBe(true)
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
