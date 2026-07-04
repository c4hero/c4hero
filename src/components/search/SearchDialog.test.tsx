import { render, screen, fireEvent } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'
import SearchDialog from './SearchDialog'

vi.mock('lucide-react', () => ({
  Search: () => null,
  X: () => null,
  LayoutGrid: () => null,
  // elementMeta icons
  UserRound: () => null,
  Globe: () => null,
  Box: () => null,
  Puzzle: () => null,
}))

function makeWs(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [
        { id: 'alice', type: 'person', name: 'Alice', description: 'A user', tags: ['Element', 'Person', 'External'], properties: {} },
      ],
      softwareSystems: [
        {
          id: 'api', type: 'softwareSystem', name: 'API System', description: 'Backend', tags: ['Element', 'Software System'], properties: {},
          containers: [
            { id: 'web', type: 'container', name: 'Web App', technology: 'React', tags: ['Element', 'Container'], properties: {}, components: [] },
            { id: 'db', type: 'container', name: 'Database', technology: 'PostgreSQL', tags: ['Element', 'Container'], properties: {}, components: [] },
          ],
        },
      ],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [
        { type: 'systemContext', key: 'ctx', title: 'Context View', softwareSystemId: 'api', elements: [{ id: 'alice' }, { id: 'api' }], relationships: [] },
      ],
      containerViews: [
        { type: 'container', key: 'cont', title: 'Container View', softwareSystemId: 'api', elements: [{ id: 'web' }, { id: 'db' }], relationships: [] },
      ],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

function seed() {
  useWorkspaceStore.getState().loadWorkspace(makeWs())
  useWorkspaceStore.getState().setSearchOpen(true)
}

function input(): HTMLElement {
  return screen.getByRole('textbox', { name: 'Search elements and views' })
}

beforeEach(() => {
  useWorkspaceStore.getState().closeWorkspace()
  localStorage.clear()
})

describe('SearchDialog', () => {
  it('shows guidance text when there is nothing to search', () => {
    render(<SearchDialog />)
    expect(screen.getByText('Type to search across all elements and views')).toBeTruthy()
  })

  it('lists all elements and views for an empty query', () => {
    seed()
    render(<SearchDialog />)
    expect(screen.getByRole('button', { name: /Alice/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /API System/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Web App/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Database/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Context View/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Container View/ })).toBeTruthy()
  })

  it('filters results by element name', () => {
    seed()
    render(<SearchDialog />)
    fireEvent.change(input(), { target: { value: 'alice' } })
    expect(screen.getByRole('button', { name: /Alice/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /API System/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Context View/ })).toBeNull()
  })

  it('matches container technology', () => {
    seed()
    render(<SearchDialog />)
    fireEvent.change(input(), { target: { value: 'postgresql' } })
    expect(screen.getByRole('button', { name: /Database/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Web App/ })).toBeNull()
  })

  it('shows a no-results message for an unmatched query', () => {
    seed()
    render(<SearchDialog />)
    fireEvent.change(input(), { target: { value: 'zzz-nothing' } })
    expect(screen.getByText('No results found')).toBeTruthy()
  })

  it('arrow keys move and clamp the highlight', () => {
    seed()
    render(<SearchDialog />)
    // "system" matches the API System element and the systemContext view
    fireEvent.change(input(), { target: { value: 'system' } })
    expect(screen.getByRole('button', { name: /API System/ }).getAttribute('aria-current')).toBe('true')

    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' }) // clamps at last result
    expect(screen.getByRole('button', { name: /Context View/ }).getAttribute('aria-current')).toBe('true')

    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    fireEvent.keyDown(input(), { key: 'ArrowUp' }) // clamps at first result
    expect(screen.getByRole('button', { name: /API System/ }).getAttribute('aria-current')).toBe('true')
  })

  it('Enter selects the highlighted element and closes', () => {
    seed()
    render(<SearchDialog />)
    fireEvent.change(input(), { target: { value: 'system' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual(['api'])
    expect(useWorkspaceStore.getState().searchOpen).toBe(false)
  })

  it('Enter on a view result switches the active view and closes', () => {
    seed()
    useWorkspaceStore.getState().setActiveView('cont')
    render(<SearchDialog />)
    fireEvent.change(input(), { target: { value: 'system' } })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(useWorkspaceStore.getState().activeViewKey).toBe('ctx')
    expect(useWorkspaceStore.getState().searchOpen).toBe(false)
  })

  it('clicking a result selects it and closes', () => {
    seed()
    render(<SearchDialog />)
    fireEvent.click(screen.getByRole('button', { name: /Alice/ }))
    expect(useWorkspaceStore.getState().selectedElementIds).toEqual(['alice'])
    expect(useWorkspaceStore.getState().searchOpen).toBe(false)
  })

  it('hovering a result moves the highlight', () => {
    seed()
    render(<SearchDialog />)
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Database/ }))
    expect(screen.getByRole('button', { name: /Database/ }).getAttribute('aria-current')).toBe('true')
  })

  it('type filter pill restricts results to that type and hides views', () => {
    seed()
    render(<SearchDialog />)
    const pill = screen.getByRole('button', { name: 'Container' })
    fireEvent.click(pill)
    expect(pill.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Web App/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Database/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Alice/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Context View/ })).toBeNull()
    // Toggle off restores everything
    fireEvent.click(pill)
    expect(pill.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: /Alice/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Context View/ })).toBeTruthy()
  })

  it('tag pill filters by custom tag', () => {
    seed()
    render(<SearchDialog />)
    const tagPill = screen.getByRole('button', { name: 'External' })
    fireEvent.click(tagPill)
    expect(tagPill.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Alice/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Web App/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /API System/ })).toBeNull()
  })

  it('Escape closes the dialog', () => {
    seed()
    render(<SearchDialog />)
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(useWorkspaceStore.getState().searchOpen).toBe(false)
  })

  it('close button closes the dialog', () => {
    seed()
    render(<SearchDialog />)
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }))
    expect(useWorkspaceStore.getState().searchOpen).toBe(false)
  })
})
