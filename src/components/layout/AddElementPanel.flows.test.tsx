import { render, screen, fireEvent } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'
import AddElementPanel from './AddElementPanel'

function makeContainerViewWs(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [{ id: 'bob', type: 'person', name: 'Bob', tags: ['Element', 'Person'], properties: {} }],
      softwareSystems: [
        {
          id: 'sys', type: 'softwareSystem', name: 'Sys', tags: ['Element', 'Software System'], properties: {},
          containers: [
            { id: 'web', type: 'container', name: 'Web', tags: ['Element', 'Container'], properties: {}, components: [] },
            { id: 'db', type: 'container', name: 'DB', tags: ['Element', 'Container'], properties: {}, components: [] },
          ],
        },
        { id: 'alpha', type: 'softwareSystem', name: 'Alpha System', tags: ['Element', 'Software System'], properties: {}, containers: [] },
        { id: 'beta', type: 'softwareSystem', name: 'Beta System', tags: ['Element', 'Software System'], properties: {}, containers: [] },
      ],
      relationships: [
        { id: 'r1', sourceId: 'web', destinationId: 'db', description: 'reads', tags: ['Relationship'], properties: {} },
      ],
      groups: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [{
        type: 'container', key: 'cv', softwareSystemId: 'sys',
        elements: [{ id: 'web' }], relationships: [],
      }],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

function loadContainerViewWs() {
  useWorkspaceStore.getState().loadWorkspace(makeContainerViewWs())
  useWorkspaceStore.getState().setActiveView('cv')
}

beforeEach(() => {
  localStorage.clear()
  useWorkspaceStore.getState().closeWorkspace()
})

describe('AddElementPanel — create flows', () => {
  it('offers person/system/container chips (no component) on a container view', () => {
    loadContainerViewWs()
    render(<AddElementPanel onClose={() => {}} />)

    // 'Person' and 'Container' also appear as group headers in the "add
    // existing" list below (Bob and DB are out-of-view) — scope to the
    // create-chip buttons specifically so the query isn't ambiguous.
    expect(screen.getByRole('button', { name: 'Person' })).toBeTruthy()
    expect(screen.getByText('External Person')).toBeTruthy()
    expect(screen.getByText('System')).toBeTruthy()
    expect(screen.getByText('External System')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Container' })).toBeTruthy()
    expect(screen.queryByText('Component')).toBeNull()
    expect(screen.getByText('Common containers')).toBeTruthy()
  })

  it('creates a person, adds it to the view, and closes the panel', () => {
    loadContainerViewWs()
    const onClose = vi.fn()
    render(<AddElementPanel onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Person' }))

    const ws = useWorkspaceStore.getState().workspace!
    const created = ws.model.people.find((p) => p.name === 'New Person')!
    expect(created).toBeTruthy()
    expect(created.location).toBe('Internal')
    expect(ws.views.containerViews[0].elements.some((e) => e.id === created.id)).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('creates external person and external system with External location', () => {
    loadContainerViewWs()
    const first = render(<AddElementPanel onClose={() => {}} />)
    fireEvent.click(screen.getByText('External Person'))
    expect(useWorkspaceStore.getState().workspace!.model.people.find((p) => p.name === 'New External Person')!.location).toBe('External')
    first.unmount()

    render(<AddElementPanel onClose={() => {}} />)
    fireEvent.click(screen.getByText('External System'))
    const extSys = useWorkspaceStore.getState().workspace!.model.softwareSystems.find((s) => s.name === 'New External System')!
    expect(extSys.location).toBe('External')
  })

  it('creates a system and a container in the focal system', () => {
    loadContainerViewWs()
    const first = render(<AddElementPanel onClose={() => {}} />)
    fireEvent.click(screen.getByText('System'))
    expect(useWorkspaceStore.getState().workspace!.model.softwareSystems.some((s) => s.name === 'New System')).toBe(true)
    first.unmount()

    const onClose = vi.fn()
    render(<AddElementPanel onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Container' }))

    const sys = useWorkspaceStore.getState().workspace!.model.softwareSystems.find((s) => s.id === 'sys')!
    expect(sys.containers.some((c) => c.name === 'New Container')).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })

  it('creates a tagged container via a subtype chip', () => {
    loadContainerViewWs()
    render(<AddElementPanel onClose={() => {}} />)

    fireEvent.click(screen.getByText('Database'))
    const sys = useWorkspaceStore.getState().workspace!.model.softwareSystems.find((s) => s.id === 'sys')!
    const created = sys.containers.find((c) => c.name === 'New Database')!
    expect(created.tags).toContain('Database')
  })

  it('offers only the component chip on a component view and creates one', () => {
    const ws = makeContainerViewWs()
    ws.views.componentViews = [{
      type: 'component', key: 'compv', containerId: 'web', elements: [], relationships: [],
    }]
    useWorkspaceStore.getState().loadWorkspace(ws)
    useWorkspaceStore.getState().setActiveView('compv')
    render(<AddElementPanel onClose={() => {}} />)

    expect(screen.queryByText('Person')).toBeNull()
    expect(screen.queryByText('System')).toBeNull()
    fireEvent.click(screen.getByText('Component'))

    const web = useWorkspaceStore.getState().workspace!.model.softwareSystems
      .find((s) => s.id === 'sys')!.containers.find((c) => c.id === 'web')!
    expect(web.components.some((c) => c.name === 'New Component')).toBe(true)
  })

  it('disables container creation in landscape-scoped workspaces', () => {
    const ws = makeContainerViewWs()
    ws.scope = 'landscape'
    useWorkspaceStore.getState().loadWorkspace(ws)
    useWorkspaceStore.getState().setActiveView('cv')
    render(<AddElementPanel onClose={() => {}} />)

    const chip = screen.getByRole('button', { name: 'Container' })
    expect(chip.disabled).toBe(true)
    expect(chip.title).toMatch(/landscape-scoped/i)
    expect(screen.queryByText('Common containers')).toBeNull()
  })
})

describe('AddElementPanel — add existing', () => {
  it('lists out-of-view elements grouped and sorted, adds one on click without closing', () => {
    loadContainerViewWs()
    const onClose = vi.fn()
    render(<AddElementPanel onClose={onClose} />)

    // web is in view, sys is the focal scope — neither is offered
    expect(screen.queryByText('Web')).toBeNull()
    expect(screen.queryByText('Sys')).toBeNull()
    expect(screen.getByText('Alpha System')).toBeTruthy()
    expect(screen.getByText('Beta System')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()

    fireEvent.click(screen.getByText('Bob'))
    const view = useWorkspaceStore.getState().workspace!.views.containerViews[0]
    expect(view.elements.some((e) => e.id === 'bob')).toBe(true)
    // Panel stays open for multi-add; added element leaves the list
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByText('Bob')).toBeNull()
  })

  it('shows a connection badge for elements that auto-wire to in-view elements', () => {
    loadContainerViewWs()
    render(<AddElementPanel onClose={() => {}} />)

    const dbRow = screen.getByText('DB').closest('button')!
    expect(dbRow.textContent).toContain('↔1')
    expect(dbRow.title).toMatch(/Auto-wires 1 connection to existing view elements/)
    // No badge for unconnected elements
    const bobRow = screen.getByText('Bob').closest('button')!
    expect(bobRow.textContent).not.toContain('↔')
  })

  it('filters the list with search and collapses the create section while searching', () => {
    loadContainerViewWs()
    render(<AddElementPanel onClose={() => {}} />)

    const input = screen.getByPlaceholderText('Filter elements...')
    fireEvent.change(input, { target: { value: 'alpha' } })

    expect(screen.getByText('Alpha System')).toBeTruthy()
    expect(screen.queryByText('Beta System')).toBeNull()
    expect(screen.queryByText('Bob')).toBeNull()
    // Create chips collapse while a query is active
    expect(screen.queryByText('External Person')).toBeNull()

    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByText('External Person')).toBeTruthy()

    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText('No matching elements')).toBeTruthy()
  })

  it('shows an empty message when everything is already in the view', () => {
    const ws = makeContainerViewWs()
    ws.views.containerViews[0].elements = [
      { id: 'web' }, { id: 'db' }, { id: 'bob' }, { id: 'alpha' }, { id: 'beta' },
    ]
    useWorkspaceStore.getState().loadWorkspace(ws)
    useWorkspaceStore.getState().setActiveView('cv')
    render(<AddElementPanel onClose={() => {}} />)

    expect(screen.getByText('All elements are already in this view')).toBeTruthy()
  })

  it('collapses and expands the create section from its header', () => {
    loadContainerViewWs()
    render(<AddElementPanel onClose={() => {}} />)

    fireEvent.click(screen.getByText('Create new'))
    expect(screen.queryByRole('button', { name: 'Person' })).toBeNull()

    fireEvent.click(screen.getByText('Create new'))
    expect(screen.getByRole('button', { name: 'Person' })).toBeTruthy()
  })
})

describe('AddElementPanel — keyboard and mobile', () => {
  it('ArrowDown/ArrowUp cycle focus through the panel controls', () => {
    loadContainerViewWs()
    render(<AddElementPanel onClose={() => {}} />)

    const input = screen.getByPlaceholderText('Filter elements...')
    input.focus()

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    // Next focusable after the search input is the first element-list button
    expect((document.activeElement as HTMLElement).textContent).toContain('Alpha System')

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(input)
  })

  it('clears the selection after adding on mobile', () => {
    const original = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true, writable: true })
    try {
      loadContainerViewWs()
      const onClose = vi.fn()
      render(<AddElementPanel onClose={onClose} />)

      fireEvent.click(screen.getByRole('button', { name: 'Person' }))
      expect(useWorkspaceStore.getState().selectedElementIds).toHaveLength(0)
      expect(onClose).toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: original, configurable: true, writable: true })
    }
  })

  it('keeps the new element selected on desktop', () => {
    loadContainerViewWs()
    render(<AddElementPanel onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Person' }))
    expect(useWorkspaceStore.getState().selectedElementIds).toHaveLength(1)
  })
})
