import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'
import RightPanel from './RightPanel'

vi.mock('lucide-react', () => ({
  X: () => null,
  Plus: () => null,
  ArrowRight: () => null,
  ExternalLink: () => null,
  Sparkles: () => null,
  Loader2: () => null,
  Eye: () => null,
  EyeOff: () => null,
  Layers: () => null,
  Trash2: () => null,
  AlertTriangle: () => null,
  Settings: () => null,
  ChevronDown: () => null,
  ChevronRight: () => null,
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

  it('keeps relationship defaults neutral until explicitly set and allows clearing them', async () => {
    const user = userEvent.setup()
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().selectRelationship('rel1')
    render(<RightPanel />)

    const defaultInteraction = screen.getByRole('button', { name: 'Interaction style: Default' })
    const syncInteraction = screen.getByRole('button', { name: 'Interaction style: Synchronous' })
    const defaultLineStyle = screen.getByRole('button', { name: 'Line style: Default' })
    const straightLineStyle = screen.getByRole('button', { name: 'Line style: Straight' })

    expect(defaultInteraction.getAttribute('aria-pressed')).toBe('true')
    expect(syncInteraction.getAttribute('aria-pressed')).toBe('false')
    expect(defaultLineStyle.getAttribute('aria-pressed')).toBe('true')
    expect(straightLineStyle.getAttribute('aria-pressed')).toBe('false')

    await user.click(screen.getByRole('button', { name: 'Interaction style: Asynchronous' }))
    await user.click(straightLineStyle)

    let relationship = useWorkspaceStore.getState().workspace?.model.relationships.find((item) => item.id === 'rel1')
    expect(relationship?.interactionStyle).toBe('Asynchronous')
    expect(relationship?.lineStyle).toBe('Straight')

    await user.click(defaultInteraction)
    await user.click(defaultLineStyle)

    relationship = useWorkspaceStore.getState().workspace?.model.relationships.find((item) => item.id === 'rel1')
    expect(relationship?.interactionStyle).toBeUndefined()
    expect(relationship?.lineStyle).toBeUndefined()
  })

  it('commits relationship technology before subsequent relationship button edits', async () => {
    const user = userEvent.setup()
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().selectRelationship('rel1')
    render(<RightPanel />)

    const techRoot = screen.getByLabelText('Technology')
    const techInput = techRoot.querySelector('input')
    expect(techInput).not.toBeNull()

    await user.click(techInput!)
    await user.keyboard('gRPC')
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Line style: Orthogonal' }))

    const relationship = useWorkspaceStore.getState().workspace?.model.relationships.find((item) => item.id === 'rel1')
    expect(relationship).toMatchObject({
      technology: 'gRPC',
      lineStyle: 'Orthogonal',
    })
  })

  it('deduplicates relationship technology tokens while preserving first casing', async () => {
    const user = userEvent.setup()
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().selectRelationship('rel1')
    render(<RightPanel />)

    const techRoot = screen.getByLabelText('Technology')
    const techInput = techRoot.querySelector('input')
    expect(techInput).not.toBeNull()

    await user.click(techInput!)
    await user.keyboard('gRPC, REST, grpc, ')

    const relationship = useWorkspaceStore.getState().workspace?.model.relationships.find((item) => item.id === 'rel1')
    expect(relationship?.technology).toBe('gRPC, REST')
  })

  it('shows group name when group selected', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    const groupId = useWorkspaceStore.getState().addGroup('My Team', ['alice'])
    useWorkspaceStore.getState().selectGroup(groupId)
    render(<RightPanel />)
    // Group name appears in an input field
    expect(screen.getByDisplayValue('My Team')).toBeTruthy()
  })

  it('shows static hint instead of Delete button when selected element is the focal scope of the active view', () => {
    // Use a custom workspace: 'api' system has a container, plus a container view scoped to 'api'.
    // When 'api' is selected on its own container view, the trash button must be replaced
    // with the "scopes the current view" hint.
    const ws: Workspace = {
      name: 'T',
      model: {
        people: [],
        softwareSystems: [{
          id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {},
          containers: [{ id: 'web', type: 'container', name: 'Web', tags: ['Element', 'Container'], properties: {}, components: [] }],
        }],
        relationships: [], groups: [],
      },
      views: {
        systemLandscapeViews: [], systemContextViews: [], componentViews: [],
        containerViews: [{
          type: 'container', key: 'cont', softwareSystemId: 'api',
          elements: [{ id: 'web' }], relationships: [],
        }],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    useWorkspaceStore.getState().loadWorkspace(ws)
    useWorkspaceStore.getState().setActiveView('cont')
    useWorkspaceStore.getState().selectElements(['api'])
    render(<RightPanel />)

    const btn = screen.getByLabelText(/delete from model.*focal scope/i)
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/scopes the current view/i)).toBeTruthy()
  })

  it('routes Delete from model through impact-aware confirmDelete', () => {
    // Load a system w/ containers and select on landscape view (where the system is NOT focal).
    const ws: Workspace = {
      name: 'T',
      model: {
        people: [],
        softwareSystems: [{
          id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {},
          containers: [
            { id: 'web', type: 'container', name: 'Web', tags: [], properties: {}, components: [] },
            { id: 'db',  type: 'container', name: 'DB',  tags: [], properties: {}, components: [] },
          ],
        }],
        relationships: [], groups: [],
      },
      views: {
        systemLandscapeViews: [{ type: 'systemLandscape', key: 'land', elements: [{ id: 'api' }], relationships: [] }],
        systemContextViews: [], containerViews: [], componentViews: [],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    useWorkspaceStore.getState().loadWorkspace(ws)
    useWorkspaceStore.getState().setActiveView('land')
    useWorkspaceStore.getState().selectElements(['api'])
    render(<RightPanel />)

    fireEvent.click(screen.getByLabelText(/delete from model/i))
    const pd = useWorkspaceStore.getState().pendingDelete
    expect(pd?.impact?.descendantContainers).toBe(2)
    expect(pd?.message).toMatch(/Delete "API" from the model/)
  })

  it('close button clears selection', async () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().selectElements(['alice'])
    render(<RightPanel />)

    // The X button is mocked to return null, but onClose is passed to button onClick
    // We need to find the close button — since X icon is mocked to null, look by aria-label
    const buttons = screen.getAllByRole('button')
    // We'll click all btn-icon buttons to find the one that clears selection
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

describe('RightPanel — Remove from view button (touch parity)', () => {
  function makeWsWithLandscape(): Workspace {
    return {
      name: 'T',
      model: {
        people: [],
        softwareSystems: [
          { id: 'a', type: 'softwareSystem', name: 'A', tags: [], properties: {}, containers: [] },
          { id: 'b', type: 'softwareSystem', name: 'B', tags: [], properties: {}, containers: [] },
        ],
        relationships: [], groups: [],
      },
      views: {
        systemLandscapeViews: [{
          type: 'systemLandscape', key: 'land',
          elements: [{ id: 'a' }, { id: 'b' }], relationships: [],
        }],
        systemContextViews: [], containerViews: [], componentViews: [],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
  }

  it('removes the element from the active view without touching the model', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWsWithLandscape())
    useWorkspaceStore.getState().setActiveView('land')
    useWorkspaceStore.getState().selectElements(['a'])
    render(<RightPanel />)

    fireEvent.click(screen.getByLabelText(/remove from view/i))

    const w = useWorkspaceStore.getState().workspace!
    // View shrunk to just b
    expect(w.views.systemLandscapeViews[0].elements.map(e => e.id)).toEqual(['b'])
    // Model still has both
    expect(w.model.softwareSystems.map(s => s.id).sort()).toEqual(['a', 'b'])
    // No confirm dialog
    expect(useWorkspaceStore.getState().pendingDelete).toBeNull()
  })

  it('does not render the button when the selected element is the focal scope', () => {
    const ws: Workspace = {
      name: 'T',
      model: {
        people: [],
        softwareSystems: [{
          id: 'sys', type: 'softwareSystem', name: 'Sys', tags: [], properties: {},
          containers: [{ id: 'c1', type: 'container', name: 'C1', tags: [], properties: {}, components: [] }],
        }],
        relationships: [], groups: [],
      },
      views: {
        systemLandscapeViews: [], systemContextViews: [], componentViews: [],
        containerViews: [{
          type: 'container', key: 'cont', softwareSystemId: 'sys',
          elements: [{ id: 'c1' }], relationships: [],
        }],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    useWorkspaceStore.getState().loadWorkspace(ws)
    useWorkspaceStore.getState().setActiveView('cont')
    useWorkspaceStore.getState().selectElements(['sys'])
    render(<RightPanel />)

    expect(screen.queryByLabelText(/remove from view/i)).toBeNull()
  })

  it('does not render the button when the element is not in the active view', () => {
    // Element exists in the model and is selected, but the active view doesn't
    // include it (rare cross-view selection state). Nothing to remove from this
    // view, so the button should be hidden.
    const ws: Workspace = {
      name: 'T',
      model: {
        people: [],
        softwareSystems: [
          { id: 'a', type: 'softwareSystem', name: 'A', tags: [], properties: {}, containers: [] },
          { id: 'b', type: 'softwareSystem', name: 'B', tags: [], properties: {}, containers: [] },
        ],
        relationships: [], groups: [],
      },
      views: {
        systemLandscapeViews: [{
          type: 'systemLandscape', key: 'land',
          elements: [{ id: 'a' }],  // b is NOT here
          relationships: [],
        }],
        systemContextViews: [], containerViews: [], componentViews: [],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }
    useWorkspaceStore.getState().loadWorkspace(ws)
    useWorkspaceStore.getState().setActiveView('land')
    useWorkspaceStore.getState().selectElements(['b'])
    render(<RightPanel />)

    expect(screen.queryByLabelText(/remove from view/i)).toBeNull()
  })
})
