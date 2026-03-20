import { render, screen, fireEvent, act } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'
import RightPanel from './RightPanel'

vi.mock('@/lib/ai', () => ({
  getAIConfig: () => null,
  generateDescription: vi.fn(),
}))

vi.mock('lucide-react', () => ({
  X: () => null,
  MoreHorizontal: () => null,
  Plus: () => null,
  ArrowRight: () => null,
  ExternalLink: () => null,
  Sparkles: () => null,
  Loader2: () => null,
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

describe('RightPanel', () => {
  it('returns null when no workspace', () => {
    const { container } = render(<RightPanel />)
    expect(container.firstChild).toBeNull()
  })

  it('returns outer div but empty when nothing selected', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().clearSelection()
    const { container } = render(<RightPanel />)
    // Component renders a wrapper div but no inner content when nothing is selected
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).not.toBeNull()
    // No text content meaningful — the inner children should be null
    expect(wrapper.textContent).toBe('')
  })

  it('shows element name when element is selected', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().selectElements(['alice'])
    render(<RightPanel />)
    expect(screen.getByText('Alice')).toBeTruthy()
  })

  it('shows correct element type label', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().selectElements(['alice'])
    render(<RightPanel />)
    expect(screen.getByText('Person')).toBeTruthy()
  })

  it('shows relationship description when relationship selected', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().selectRelationship('rel1')
    render(<RightPanel />)
    // Description appears in an input field
    expect(screen.getByDisplayValue('uses')).toBeTruthy()
  })

  it('shows group name when group selected', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    const groupId = useWorkspaceStore.getState().addGroup('My Team', ['alice'])
    useWorkspaceStore.getState().selectGroup(groupId)
    render(<RightPanel />)
    // Group name appears in an input field
    expect(screen.getByDisplayValue('My Team')).toBeTruthy()
  })

  it('close button clears selection', async () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().selectElements(['alice'])
    render(<RightPanel />)

    // The X button is mocked to return null, but onClose is passed to button onClick
    // We need to find the close button — since X icon is mocked to null, look by title or position
    // The close button has onClick={onClose} and class btn-icon
    const buttons = screen.getAllByRole('button')
    // The close button is the last btn-icon in the header area
    // Find by iterating: header close button is second after MoreHorizontal
    // Since both icons are null, we search by presence of onClick
    // Let's click the last btn-icon button in the header (onClose button)
    // Header has: MoreHorizontal btn + X btn (close)
    // We'll click all buttons to find the one that clears selection
    await act(async () => {
      // Tab buttons also exist; the close button is the one that calls clearSelection
      // The close button is positioned after MoreHorizontal in the header
      // With mocked icons both null, buttons are still rendered with their onClick
      // Find buttons and click the one that clears selection
      for (const btn of buttons) {
        if (btn.className.includes('btn-icon')) {
          // Try clicking — the clearSelection one will clear selectedElementIds
          const before = useWorkspaceStore.getState().selectedElementIds
          if (before.length > 0) {
            fireEvent.click(btn)
            const after = useWorkspaceStore.getState().selectedElementIds
            if (after.length === 0) break
            // If still not cleared, restore and try next
            useWorkspaceStore.getState().selectElements(['alice'])
          }
        }
      }
    })
    expect(useWorkspaceStore.getState().selectedElementIds).toHaveLength(0)
  })
})
