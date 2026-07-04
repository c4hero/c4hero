import { render, screen, fireEvent } from '@testing-library/react'
import ZoomHoverCard from './ZoomHoverCard'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace, ModelElement } from '@/types/model'

const systemElement: ModelElement = {
  id: 'sys-1',
  type: 'softwareSystem',
  name: 'Focal System',
  tags: ['Element', 'Software System'],
  properties: {},
  containers: [],
}

const containerElement: ModelElement = {
  id: 'web',
  type: 'container',
  name: 'Web App',
  tags: ['Element', 'Container'],
  properties: {},
  components: [],
}

const personElement: ModelElement = {
  id: 'p1',
  type: 'person',
  name: 'User',
  tags: ['Element', 'Person'],
  properties: {},
}

function makeWs(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [],
      softwareSystems: [
        {
          ...systemElement,
          type: 'softwareSystem',
          containers: [{ ...containerElement, type: 'container', components: [] }],
        },
      ],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [
        { type: 'container', key: 'cv-1', title: 'Focal Containers', softwareSystemId: 'sys-1', elements: [], relationships: [] },
        { type: 'container', key: 'cv-2', softwareSystemId: 'sys-1', elements: [], relationships: [] },
        { type: 'container', key: 'cv-other', title: 'Other', softwareSystemId: 'sys-other', elements: [], relationships: [] },
      ],
      componentViews: [
        { type: 'component', key: 'comp-1', title: 'Web Components', containerId: 'web', elements: [], relationships: [] },
      ],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

beforeEach(() => {
  useWorkspaceStore.getState().closeWorkspace()
})

function loadWs() {
  useWorkspaceStore.getState().loadWorkspace(makeWs())
  useWorkspaceStore.setState({ activeViewKey: 'cv-1', viewHistory: [] })
}

describe('ZoomHoverCard for a software system', () => {
  it('lists this system’s container views with title fallback to key', () => {
    loadWs()
    render(<ZoomHoverCard element={systemElement} typeColor="#3b82f6" />)

    expect(screen.getByText('Level 2 – Container diagram')).toBeTruthy()
    expect(screen.getByText('Focal Containers')).toBeTruthy()
    expect(screen.getByText('cv-2')).toBeTruthy() // untitled view falls back to its key
    expect(screen.queryByText('Other')).toBeNull() // other system's view excluded
    expect(screen.queryByText(/No container diagrams/)).toBeNull()
  })

  it('navigates to a child view, pushing history and clearing selection', () => {
    loadWs()
    useWorkspaceStore.setState({
      selectedElementIds: ['sys-1'],
      selectedRelationshipId: 'rel-1',
      selectedGroupId: 'g-1',
    })
    render(<ZoomHoverCard element={systemElement} typeColor="#3b82f6" />)

    fireEvent.click(screen.getByText('cv-2'))

    const s = useWorkspaceStore.getState()
    expect(s.activeViewKey).toBe('cv-2')
    expect(s.viewHistory).toEqual(['cv-1'])
    expect(s.selectedElementIds).toEqual([])
    expect(s.selectedRelationshipId).toBeNull()
    expect(s.selectedGroupId).toBeNull()
  })

  it('does nothing when clicking the already-active view', () => {
    loadWs()
    render(<ZoomHoverCard element={systemElement} typeColor="#3b82f6" />)
    fireEvent.click(screen.getByText('Focal Containers'))
    const s = useWorkspaceStore.getState()
    expect(s.activeViewKey).toBe('cv-1')
    expect(s.viewHistory).toEqual([])
  })

  it('does nothing when there is no active view', () => {
    loadWs()
    useWorkspaceStore.setState({ activeViewKey: null })
    render(<ZoomHoverCard element={systemElement} typeColor="#3b82f6" />)
    fireEvent.click(screen.getByText('cv-2'))
    expect(useWorkspaceStore.getState().activeViewKey).toBeNull()
    expect(useWorkspaceStore.getState().viewHistory).toEqual([])
  })

  it('requests a new container diagram via pendingZoomConfirm', () => {
    loadWs()
    render(<ZoomHoverCard element={systemElement} typeColor="#3b82f6" />)
    fireEvent.click(screen.getByText('New diagram'))
    expect(useWorkspaceStore.getState().pendingZoomConfirm).toEqual({
      elementId: 'sys-1',
      elementName: 'Focal System',
      targetType: 'container',
    })
  })

  it('shows the empty message when no workspace is loaded', () => {
    render(<ZoomHoverCard element={systemElement} typeColor="#3b82f6" />)
    expect(screen.getByText('No container diagrams for this object')).toBeTruthy()
  })
})

describe('ZoomHoverCard for a container', () => {
  it('lists component views under a Level 3 header', () => {
    loadWs()
    render(<ZoomHoverCard element={containerElement} typeColor="#8b5cf6" />)
    expect(screen.getByText('Level 3 – Component diagram')).toBeTruthy()
    expect(screen.getByText('Web Components')).toBeTruthy()
  })

  it('requests a new component diagram via pendingZoomConfirm', () => {
    loadWs()
    render(<ZoomHoverCard element={containerElement} typeColor="#8b5cf6" />)
    fireEvent.click(screen.getByText('New diagram'))
    expect(useWorkspaceStore.getState().pendingZoomConfirm).toEqual({
      elementId: 'web',
      elementName: 'Web App',
      targetType: 'component',
    })
  })
})

describe('ZoomHoverCard for other element types', () => {
  it('shows no child views for a person', () => {
    loadWs()
    render(<ZoomHoverCard element={personElement} typeColor="#f59e0b" />)
    expect(screen.getByText('Level 3 – Component diagram')).toBeTruthy()
    expect(screen.getByText('No component diagrams for this object')).toBeTruthy()
  })
})

describe('ZoomHoverCard interactions', () => {
  it('stops click propagation so the node underneath is not selected', () => {
    loadWs()
    const onClick = vi.fn()
    const { container } = render(
      <div onClick={onClick}>
        <ZoomHoverCard element={systemElement} typeColor="#3b82f6" />
      </div>,
    )
    fireEvent.click(container.querySelector('.nodrag') as HTMLElement)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('applies and clears hover styling on view rows and the new-diagram button', () => {
    loadWs()
    render(<ZoomHoverCard element={systemElement} typeColor="#3b82f6" />)

    const row = screen.getByText('cv-2').closest('button') as HTMLButtonElement
    fireEvent.mouseEnter(row)
    fireEvent.mouseLeave(row)
    expect(row.style.background).toBe('transparent')

    const newDiagram = screen.getByText('New diagram').closest('button') as HTMLButtonElement
    fireEvent.mouseEnter(newDiagram)
    fireEvent.mouseLeave(newDiagram)
    expect(newDiagram).toBeTruthy()
  })
})
