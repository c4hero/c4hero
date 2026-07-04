import { render, screen, fireEvent, act } from '@testing-library/react'
import { useWorkspaceStore, getAllViews } from '@/store/workspace'
import type { Workspace, View } from '@/types/model'
import ViewSwitcher, { ViewSwitcherPanel, VIEW_TYPE_LABELS, LEVEL_BADGE } from './ViewSwitcher'

function makeWs(views?: Partial<Workspace['views']>): Workspace {
  return {
    name: 'Test',
    model: {
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
      softwareSystems: [{ id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {}, containers: [] }],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [
        { type: 'systemLandscape', key: 'overview', title: 'Overview', elements: [{ id: 'alice' }, { id: 'api' }], relationships: [] },
        { type: 'systemLandscape', key: 'second', title: 'Second Map', elements: [], relationships: [] },
      ],
      systemContextViews: [
        { type: 'systemContext', key: 'ctx', title: 'API Context', softwareSystemId: 'api', elements: [{ id: 'api' }], relationships: [] },
      ],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
      ...views,
    },
  }
}

const noop = () => {}

beforeEach(() => {
  localStorage.clear()
  useWorkspaceStore.getState().closeWorkspace()
})

describe('ViewSwitcher (trigger)', () => {
  it('returns null when no workspace is loaded', () => {
    const { container } = render(
      <ViewSwitcher isMobile={false} open={false} onToggle={noop} onClose={noop} onShowCreateView={noop} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows the active view title with its level badge', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(
      <ViewSwitcher isMobile={false} open={false} onToggle={noop} onClose={noop} onShowCreateView={noop} />,
    )
    expect(screen.getByText('Overview')).toBeTruthy()
    expect(screen.getByText('Map')).toBeTruthy()
    expect(screen.getByLabelText('Switch view').getAttribute('aria-expanded')).toBe('false')
  })

  it('falls back to the raw view key (no badge) when the active view is missing', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    act(() => { useWorkspaceStore.setState({ activeViewKey: 'ghost-view' }) })
    render(
      <ViewSwitcher isMobile={false} open={true} onToggle={noop} onClose={noop} onShowCreateView={noop} />,
    )
    expect(screen.getByText('ghost-view')).toBeTruthy()
    expect(screen.queryByText('Map')).toBeNull()
    expect(screen.getByLabelText('Switch view').getAttribute('aria-expanded')).toBe('true')
  })

  it('invokes onToggle when the trigger is clicked', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    const onToggle = vi.fn()
    render(
      <ViewSwitcher isMobile={true} open={false} onToggle={onToggle} onClose={noop} onShowCreateView={noop} />,
    )
    fireEvent.click(screen.getByLabelText('Switch view'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

describe('ViewSwitcherPanel', () => {
  it('returns null when no workspace is loaded', () => {
    const { container } = render(<ViewSwitcherPanel onClose={noop} onShowCreateView={noop} />)
    expect(container.firstChild).toBeNull()
  })

  it('groups views under their type labels', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<ViewSwitcherPanel onClose={noop} onShowCreateView={noop} />)
    expect(screen.getByText(VIEW_TYPE_LABELS.systemLandscape)).toBeTruthy()
    expect(screen.getByText(VIEW_TYPE_LABELS.systemContext)).toBeTruthy()
    expect(screen.getByText('Overview')).toBeTruthy()
    expect(screen.getByText('Second Map')).toBeTruthy()
    expect(screen.getByText('API Context')).toBeTruthy()
    expect(screen.getByText(LEVEL_BADGE.systemContext)).toBeTruthy()
  })

  it('activates a view on click and closes the panel', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    const onClose = vi.fn()
    render(<ViewSwitcherPanel onClose={onClose} onShowCreateView={noop} />)
    fireEvent.click(screen.getByText('API Context'))
    expect(useWorkspaceStore.getState().activeViewKey).toBe('ctx')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renames a view via the pencil button and Enter', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<ViewSwitcherPanel onClose={noop} onShowCreateView={noop} />)
    fireEvent.click(screen.getByLabelText('Rename view Overview'))
    const input = screen.getByDisplayValue('Overview')
    fireEvent.change(input, { target: { value: 'Big Picture' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.views.systemLandscapeViews[0].title).toBe('Big Picture')
    expect(screen.queryByDisplayValue('Big Picture')).toBeNull()
  })

  it('renames a view via the confirm (check) button', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<ViewSwitcherPanel onClose={noop} onShowCreateView={noop} />)
    fireEvent.click(screen.getByLabelText('Rename view Second Map'))
    fireEvent.change(screen.getByDisplayValue('Second Map'), { target: { value: 'Renamed Map' } })
    fireEvent.click(screen.getByLabelText('Confirm rename'))
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.views.systemLandscapeViews[1].title).toBe('Renamed Map')
  })

  it('keeps the old title when the rename value is blank', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<ViewSwitcherPanel onClose={noop} onShowCreateView={noop} />)
    fireEvent.click(screen.getByLabelText('Rename view Overview'))
    const input = screen.getByDisplayValue('Overview')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0].title).toBe('Overview')
  })

  it('cancels a rename on Escape', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<ViewSwitcherPanel onClose={noop} onShowCreateView={noop} />)
    fireEvent.click(screen.getByLabelText('Rename view Overview'))
    const input = screen.getByDisplayValue('Overview')
    fireEvent.change(input, { target: { value: 'Ignored' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0].title).toBe('Overview')
    expect(screen.queryByDisplayValue('Ignored')).toBeNull()
  })

  it('duplicates a view and closes the panel', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    const onClose = vi.fn()
    render(<ViewSwitcherPanel onClose={onClose} onShowCreateView={noop} />)
    const before = getAllViews(useWorkspaceStore.getState().workspace!).length
    fireEvent.click(screen.getByLabelText('Duplicate view Overview'))
    expect(getAllViews(useWorkspaceStore.getState().workspace!).length).toBe(before + 1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('asks for confirmation before deleting a view, then deletes on confirm', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<ViewSwitcherPanel onClose={noop} onShowCreateView={noop} />)
    fireEvent.click(screen.getByLabelText('Delete view Second Map'))
    const pending = useWorkspaceStore.getState().pendingDelete
    expect(pending?.message).toBe('Delete view "Second Map"?')
    // View untouched until confirmed
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews).toHaveLength(2)
    act(() => { pending!.onConfirm() })
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews).toHaveLength(1)
  })

  it('disables deletion of the last remaining view', () => {
    const onlyView: View = { type: 'systemLandscape', key: 'solo', title: 'Solo', elements: [], relationships: [] }
    useWorkspaceStore.getState().loadWorkspace(makeWs({
      systemLandscapeViews: [onlyView],
      systemContextViews: [],
    }))
    render(<ViewSwitcherPanel onClose={noop} onShowCreateView={noop} />)
    const btn = screen.getByLabelText('Cannot delete last view') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(useWorkspaceStore.getState().pendingDelete).toBeNull()
  })

  it('opens the create-view flow from the footer', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    const onClose = vi.fn()
    const onShowCreateView = vi.fn()
    render(<ViewSwitcherPanel onClose={onClose} onShowCreateView={onShowCreateView} />)
    fireEvent.click(screen.getByText('New view'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onShowCreateView).toHaveBeenCalledTimes(1)
  })

  it('closes via the backdrop button', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    const onClose = vi.fn()
    render(<ViewSwitcherPanel onClose={onClose} onShowCreateView={noop} />)
    fireEvent.click(screen.getByLabelText('Close view switcher'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
