import { render, screen } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'
import FloatingInspector from './FloatingInspector'

vi.mock('lucide-react', () => ({
  X: () => null,
  MoreHorizontal: () => null,
  Plus: () => null,
  ArrowRight: () => null,
  ExternalLink: () => null,
  Eye: () => null,
  Layers: () => null,
  Trash2: () => null,
  AlertTriangle: () => null,
  Settings: () => null,
  ChevronDown: () => null,
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
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
      softwareSystems: [{ id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {}, containers: [] }],
      relationships: [{ id: 'rel1', sourceId: 'alice', destinationId: 'api', description: 'uses', tags: ['Relationship'], properties: {} }],
      groups: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

beforeEach(() => {
  useWorkspaceStore.getState().closeWorkspace()
})

describe('FloatingInspector', () => {
  it('returns null when no workspace', () => {
    const { container } = render(<FloatingInspector />)
    expect(container.firstChild).toBeNull()
  })

  it('does not render when nothing selected', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().clearSelection()
    const { container } = render(<FloatingInspector />)
    expect(container.firstChild).toBeNull()
  })

  it('renders (with the entrance animation) when element is selected', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().selectElements(['alice'])
    const { container } = render(<FloatingInspector />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).not.toBeNull()
    expect(wrapper.style.animation).toContain('inspector-in')
  })

  it('renders (with the entrance animation) when relationship is selected', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().selectRelationship('rel1')
    const { container } = render(<FloatingInspector />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).not.toBeNull()
    expect(wrapper.style.animation).toContain('inspector-in')
  })

  it('has aria-label "Element properties"', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().selectElements(['alice'])
    render(<FloatingInspector />)
    expect(screen.getByLabelText('Element properties')).toBeTruthy()
  })
})
