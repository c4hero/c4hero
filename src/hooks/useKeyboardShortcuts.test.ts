/** @vitest-environment jsdom */
import { renderHook } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import { useKeyboardShortcuts, shouldSuppressBackspaceNavigation } from './useKeyboardShortcuts'
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
    expect(w.model.softwareSystems[0].containers.map(c => c.id)).toEqual(['c1', 'c2'])
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
    expect(pd!.impact?.scopedViews).toBe(1)
    expect(pd!.message).toMatch(/Delete "S" from the model/)
  })

  it('Backspace on a mixed selection drops focal-scope IDs and proceeds with the rest', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().setActiveView('cont')
    useWorkspaceStore.getState().selectElements(['sys', 'c1'])
    renderHook(() => useKeyboardShortcuts())

    press('Backspace')

    const w = useWorkspaceStore.getState().workspace!
    expect(w.views.containerViews[0].elements.map(e => e.id)).toEqual(['c2'])
    expect(w.model.softwareSystems.find(s => s.id === 'sys')).toBeDefined()
    expect(useWorkspaceStore.getState().pendingDelete).toBeNull()
  })

  it('Backspace on the focal-scope element of a container view is a no-op', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().setActiveView('cont')
    useWorkspaceStore.getState().selectElements(['sys'])
    renderHook(() => useKeyboardShortcuts())

    press('Backspace')
    press('Backspace', { shift: true })

    const w = useWorkspaceStore.getState().workspace!
    expect(w.model.softwareSystems.find(s => s.id === 'sys')).toBeDefined()
    expect(useWorkspaceStore.getState().pendingDelete).toBeNull()
  })
})

// ─── shouldSuppressBackspaceNavigation (browser-back guard) ──────────

function makeInput(type: string, value: string): HTMLInputElement {
  const el = document.createElement('input')
  el.type = type
  el.value = value
  return el
}

function makeTextarea(value: string): HTMLTextAreaElement {
  const el = document.createElement('textarea')
  el.value = value
  return el
}

function makeContentEditable(text: string): HTMLElement {
  const el = document.createElement('div')
  el.contentEditable = 'true'
  el.textContent = text
  document.body.appendChild(el) // isContentEditable requires DOM attachment
  return el
}

describe('shouldSuppressBackspaceNavigation', () => {
  describe('text-editable inputs with content — should NOT suppress', () => {
    it('non-empty text input → false (Backspace deletes a char)', () => {
      expect(shouldSuppressBackspaceNavigation(makeInput('text', 'hello'))).toBe(false)
    })

    it('non-empty search input → false', () => {
      expect(shouldSuppressBackspaceNavigation(makeInput('search', 'q'))).toBe(false)
    })

    it('non-empty textarea → false', () => {
      expect(shouldSuppressBackspaceNavigation(makeTextarea('multi\nline'))).toBe(false)
    })

    it('non-empty contentEditable → false', () => {
      expect(shouldSuppressBackspaceNavigation(makeContentEditable('rich text'))).toBe(false)
    })

    it('input with no type attribute (defaults to text) and content → false', () => {
      const el = document.createElement('input')
      el.value = 'abc'
      expect(shouldSuppressBackspaceNavigation(el)).toBe(false)
    })
  })

  describe('text-editable inputs that are empty — SHOULD suppress', () => {
    it('empty text input → true (browser-back risk on Safari)', () => {
      expect(shouldSuppressBackspaceNavigation(makeInput('text', ''))).toBe(true)
    })

    it('empty search input → true', () => {
      expect(shouldSuppressBackspaceNavigation(makeInput('search', ''))).toBe(true)
    })

    it('empty password input → true', () => {
      expect(shouldSuppressBackspaceNavigation(makeInput('password', ''))).toBe(true)
    })

    it('empty textarea → true', () => {
      expect(shouldSuppressBackspaceNavigation(makeTextarea(''))).toBe(true)
    })

    it('empty contentEditable → true', () => {
      expect(shouldSuppressBackspaceNavigation(makeContentEditable(''))).toBe(true)
    })
  })

  describe('non-text inputs — SHOULD suppress regardless of value', () => {
    it('checkbox → true', () => {
      expect(shouldSuppressBackspaceNavigation(makeInput('checkbox', ''))).toBe(true)
    })

    it('radio → true', () => {
      expect(shouldSuppressBackspaceNavigation(makeInput('radio', ''))).toBe(true)
    })

    it('button-typed input → true', () => {
      expect(shouldSuppressBackspaceNavigation(makeInput('button', ''))).toBe(true)
    })

    it('submit-typed input → true', () => {
      expect(shouldSuppressBackspaceNavigation(makeInput('submit', ''))).toBe(true)
    })

    it('range input → true', () => {
      expect(shouldSuppressBackspaceNavigation(makeInput('range', '50'))).toBe(true)
    })
  })

  describe('non-input elements — SHOULD suppress', () => {
    it('select → true', () => {
      const el = document.createElement('select')
      expect(shouldSuppressBackspaceNavigation(el)).toBe(true)
    })
  })
})

describe('useKeyboardShortcuts — global shortcut coverage', () => {
  function setup() {
    // The "i" shortcut is gated on a diagram route, so put us on one.
    window.history.pushState({}, '', '/collection/team/diagram')
    const s = useWorkspaceStore.getState()
    s.loadWorkspace(makeWs())
    s.setActiveView('land')
    // UI flags aren't reset by closeWorkspace, so clear the ones these tests
    // assert on to keep each case order-independent.
    s.setAiPanelOpen(false)
    s.setAiSettingsOpen(false)
    s.setAddElementPanelOpen(false)
    s.setMultiSelectMode(false)
    s.setPresentationMode(false)
    s.setCommandPaletteOpen(false)
    s.setHighlighterOpenFacet(null)
    s.clearSelection()
    renderHook(() => useKeyboardShortcuts())
  }

  it('"i" toggles the AI assistant', () => {
    setup()
    expect(useWorkspaceStore.getState().aiPanelOpen).toBe(false)
    press('i')
    expect(useWorkspaceStore.getState().aiPanelOpen).toBe(true)
    press('i')
    expect(useWorkspaceStore.getState().aiPanelOpen).toBe(false)
  })

  it('"i" clears settings-only assistant state when toggling', () => {
    setup()
    const s = useWorkspaceStore.getState()
    s.setAiSettingsOpen(true)
    expect(useWorkspaceStore.getState().aiSettingsOpen).toBe(true)
    expect(useWorkspaceStore.getState().aiPanelOpen).toBe(true)
    press('i')
    expect(useWorkspaceStore.getState().aiPanelOpen).toBe(false)
    expect(useWorkspaceStore.getState().aiSettingsOpen).toBe(false)
  })

  it('"i" recovers stale settings-only assistant state when toggling', () => {
    setup()
    useWorkspaceStore.setState({ aiPanelOpen: false, aiSettingsOpen: true })
    press('i')
    expect(useWorkspaceStore.getState().aiPanelOpen).toBe(true)
    expect(useWorkspaceStore.getState().aiSettingsOpen).toBe(false)
    press('i')
    expect(useWorkspaceStore.getState().aiPanelOpen).toBe(false)
    expect(useWorkspaceStore.getState().aiSettingsOpen).toBe(false)
  })

  it('"a" toggles the add-element panel', () => {
    setup()
    press('a')
    expect(useWorkspaceStore.getState().addElementPanelOpen).toBe(true)
  })

  it('"m" toggles multi-select mode', () => {
    setup()
    press('m')
    expect(useWorkspaceStore.getState().multiSelectMode).toBe(true)
  })

  it('"p" toggles presentation mode', () => {
    setup()
    press('p')
    expect(useWorkspaceStore.getState().presentationMode).toBe(true)
  })

  it('"h" toggles the tag highlighter facet', () => {
    setup()
    press('h')
    expect(useWorkspaceStore.getState().highlighterOpenFacet).toBe('tags')
    press('h')
    expect(useWorkspaceStore.getState().highlighterOpenFacet).toBeNull()
  })

  it('"?" opens the command palette', () => {
    setup()
    press('?')
    expect(useWorkspaceStore.getState().commandPaletteOpen).toBe(true)
  })

  it('Escape closes the command palette, then clears selection', () => {
    setup()
    useWorkspaceStore.getState().setCommandPaletteOpen(true)
    press('Escape')
    expect(useWorkspaceStore.getState().commandPaletteOpen).toBe(false)
    useWorkspaceStore.getState().selectElements(['sys'])
    press('Escape')
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual([])
  })

  it('Shift+S adds a software system', () => {
    setup()
    const before = useWorkspaceStore.getState().workspace!.model.softwareSystems.length
    press('S', { shift: true })
    expect(useWorkspaceStore.getState().workspace!.model.softwareSystems.length).toBe(before + 1)
  })

  it('Enter on a single selection drills in without error', () => {
    setup()
    useWorkspaceStore.getState().selectElements(['sys'])
    press('Enter')
    expect(useWorkspaceStore.getState().workspace).toBeTruthy()
  })

  it('ignores plain shortcuts while typing in an input', () => {
    setup()
    const input = document.createElement('input')
    document.body.append(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(useWorkspaceStore.getState().addElementPanelOpen).toBe(false)
    input.remove()
  })
})
