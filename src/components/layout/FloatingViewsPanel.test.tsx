import { render, screen, fireEvent } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'
import FloatingViewsPanel from './FloatingViewsPanel'

// Stub the lazily imported dialog so opening it doesn't pull in the real
// (heavy) create-view flow.
vi.mock('@/components/views/CreateViewDialog', () => ({
  default: () => <div data-testid="create-view-dialog" />,
}))

function makeWs(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [],
      softwareSystems: [{
        id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {},
        containers: [{ id: 'web', type: 'container', name: 'Web', tags: ['Element', 'Container'], properties: {}, components: [] }],
      }],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [{ type: 'systemLandscape', key: 'land', title: 'Landscape', elements: [{ id: 'api' }], relationships: [] }],
      systemContextViews: [{ type: 'systemContext', key: 'ctx', title: 'API Context', softwareSystemId: 'api', elements: [{ id: 'api' }], relationships: [] }],
      containerViews: [{ type: 'container', key: 'cont', softwareSystemId: 'api', elements: [{ id: 'web' }], relationships: [] }],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  useWorkspaceStore.getState().closeWorkspace()
  useWorkspaceStore.setState({ viewsPanelOpen: false, createViewDialogOpen: false })
})

describe('FloatingViewsPanel', () => {
  it('renders nothing when no workspace is loaded', () => {
    useWorkspaceStore.setState({ viewsPanelOpen: true })
    const { container } = render(<FloatingViewsPanel />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing while the panel is closed', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    const { container } = render(<FloatingViewsPanel />)
    expect(container.firstChild).toBeNull()
  })

  it('groups views by type with labels and counts', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.setState({ viewsPanelOpen: true })
    render(<FloatingViewsPanel />)

    expect(screen.getByText('System Landscape')).toBeTruthy()
    expect(screen.getByText('System Context')).toBeTruthy()
    expect(screen.getByText('Container')).toBeTruthy()
    expect(screen.getByText('Landscape')).toBeTruthy()
    expect(screen.getByText('API Context')).toBeTruthy()
    // Container view has no title — falls back to its key
    expect(screen.getByText('cont')).toBeTruthy()
  })

  it('marks the active view and selects another on click', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.setState({ viewsPanelOpen: true })
    render(<FloatingViewsPanel />)

    // loadWorkspace activates the first view (landscape)
    expect(useWorkspaceStore.getState().activeViewKey).toBe('land')
    const landscapeBtn = screen.getByText('Landscape').closest('button')!
    expect(landscapeBtn.getAttribute('data-active')).toBe('true')

    fireEvent.click(screen.getByText('API Context'))
    expect(useWorkspaceStore.getState().activeViewKey).toBe('ctx')
  })

  it('collapses and expands a view-type group', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.setState({ viewsPanelOpen: true })
    render(<FloatingViewsPanel />)

    expect(screen.getByText('Landscape')).toBeTruthy()
    fireEvent.click(screen.getByText('System Landscape'))
    expect(screen.queryByText('Landscape')).toBeNull()
    // Other groups stay expanded
    expect(screen.getByText('API Context')).toBeTruthy()

    fireEvent.click(screen.getByText('System Landscape'))
    expect(screen.getByText('Landscape')).toBeTruthy()
  })

  it('close button closes the panel', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.setState({ viewsPanelOpen: true })
    render(<FloatingViewsPanel />)

    fireEvent.click(screen.getByTitle('Close'))
    expect(useWorkspaceStore.getState().viewsPanelOpen).toBe(false)
  })

  it('backdrop click closes the panel', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.setState({ viewsPanelOpen: true })
    const { container } = render(<FloatingViewsPanel />)

    // The backdrop is the first rendered element (fixed, inset 0)
    fireEvent.click(container.firstChild as HTMLElement)
    expect(useWorkspaceStore.getState().viewsPanelOpen).toBe(false)
  })

  it('"New view" opens the create-view dialog', async () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.setState({ viewsPanelOpen: true })
    render(<FloatingViewsPanel />)

    fireEvent.click(screen.getByTitle('New view'))
    expect(useWorkspaceStore.getState().createViewDialogOpen).toBe(true)
    expect(await screen.findByTestId('create-view-dialog')).toBeTruthy()
  })
})
