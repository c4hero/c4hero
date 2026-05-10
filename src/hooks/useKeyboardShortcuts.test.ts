import { renderHook } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import type { Workspace } from '@/types/model'

vi.mock('@xyflow/react', () => ({ useReactFlow: () => { throw new Error('not in flow') } }))

function makeWs(): Workspace {
  return {
    name: 'T',
    model: {
      people: [],
      softwareSystems: [
        { id: 'sys', type: 'softwareSystem', name: 'S', tags: [], properties: {},
          containers: [
            { id: 'c1', type: 'container', name: 'C1', tags: [], properties: {}, components: [] },
            { id: 'c2', type: 'container', name: 'C2', tags: [], properties: {}, components: [] },
          ],
        },
        { id: 'peer', type: 'softwareSystem', name: 'Peer', tags: [], properties: {}, containers: [] },
      ],
      relationships: [], groups: [],
    },
    views: {
      systemLandscapeViews: [{
        type: 'systemLandscape', key: 'land', elements: [{ id: 'sys' }, { id: 'peer' }], relationships: [],
      }],
      systemContextViews: [],
      containerViews: [{
        type: 'container', key: 'cont', softwareSystemId: 'sys',
        elements: [{ id: 'c1' }, { id: 'c2' }], relationships: [],
      }],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

function press(key: string, opts: { shift?: boolean } = {}) {
  const ev = new KeyboardEvent('keydown', { key, shiftKey: !!opts.shift, bubbles: true })
  window.dispatchEvent(ev)
}

beforeEach(() => useWorkspaceStore.getState().closeWorkspace())

describe('useKeyboardShortcuts — delete semantics', () => {
  it('Backspace removes selected element from the view but keeps it in the model', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().setActiveView('cont')
    useWorkspaceStore.getState().selectElements(['c2'])
    renderHook(() => useKeyboardShortcuts())

    press('Backspace')

    const w = useWorkspaceStore.getState().workspace!
    expect(w.views.containerViews[0].elements.map(e => e.id)).toEqual(['c1'])
    // Model intact:
    expect(w.model.softwareSystems[0].containers.map(c => c.id)).toEqual(['c1', 'c2'])
    // No confirm dialog raised (lightweight action):
    expect(useWorkspaceStore.getState().pendingDelete).toBeNull()
  })

  it('Shift+Backspace raises an impact-aware confirm dialog', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().setActiveView('land')
    useWorkspaceStore.getState().selectElements(['sys'])
    renderHook(() => useKeyboardShortcuts())

    press('Backspace', { shift: true })

    const pd = useWorkspaceStore.getState().pendingDelete
    expect(pd).not.toBeNull()
    expect(pd!.impact?.descendantContainers).toBe(2)
    expect(pd!.impact?.scopedViews).toBe(1)             // 'cont' view scoped to 'sys'
    expect(pd!.message).toMatch(/Delete "S" from the model/)
  })

  it('Backspace on a mixed selection drops focal-scope IDs and proceeds with the rest', () => {
    // The user's selection is ['sys', 'c1'] on the container view scoped to 'sys'.
    // 'sys' is focal — it should be silently filtered out.
    // 'c1' is not focal — it should be removed from the view.
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().setActiveView('cont')
    useWorkspaceStore.getState().selectElements(['sys', 'c1'])
    renderHook(() => useKeyboardShortcuts())

    press('Backspace')

    const w = useWorkspaceStore.getState().workspace!
    // c1 removed from the container view, c2 still there:
    expect(w.views.containerViews[0].elements.map(e => e.id)).toEqual(['c2'])
    // sys still in the model (focal scope is never destroyed by this path):
    expect(w.model.softwareSystems.find(s => s.id === 'sys')).toBeDefined()
    // No confirm dialog:
    expect(useWorkspaceStore.getState().pendingDelete).toBeNull()
  })

  it('Backspace on the focal-scope element of a container view is a no-op', () => {
    // Defense in depth: the canvas shouldn't show the focal system as a node
    // on its own container view, but if a future regression lets it be selected,
    // Backspace must not silently remove or delete it.
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().setActiveView('cont')
    useWorkspaceStore.getState().selectElements(['sys'])
    renderHook(() => useKeyboardShortcuts())

    press('Backspace')
    press('Backspace', { shift: true })

    const w = useWorkspaceStore.getState().workspace!
    // System still in model:
    expect(w.model.softwareSystems.find(s => s.id === 'sys')).toBeDefined()
    // No confirm raised:
    expect(useWorkspaceStore.getState().pendingDelete).toBeNull()
  })
})
