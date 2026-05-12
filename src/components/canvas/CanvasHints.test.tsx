import { render, screen, fireEvent, act } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'
import CanvasHints from './CanvasHints'

vi.mock('lucide-react', () => ({ X: () => null }))

function makeWs(): Workspace {
  // 2 containers + 1 relationship between them — populated enough to test
  // selection, but the relationship suppresses the connect-hint so the
  // backspace-hint becomes the active one.
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
      ],
      relationships: [{ id: 'r1', sourceId: 'c1', destinationId: 'c2', tags: [], properties: {} }],
      groups: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      componentViews: [],
      containerViews: [{
        type: 'container', key: 'cont', softwareSystemId: 'sys',
        elements: [{ id: 'c1' }, { id: 'c2' }],
        relationships: [{ id: 'r1' }],
      }],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

beforeEach(() => {
  useWorkspaceStore.getState().closeWorkspace()
  localStorage.clear()
})

describe('CanvasHints — Backspace semantics hint', () => {
  it('does not render the hint when nothing is selected', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().setActiveView('cont')
    useWorkspaceStore.getState().clearSelection()
    render(<CanvasHints />)
    // Wait for the 500ms reveal delay — but the hint shouldn't be there at all
    expect(screen.queryByText(/Backspace removes from this view/i)).toBeNull()
  })

  it('renders the hint when at least one element is selected and not yet dismissed', async () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().setActiveView('cont')
    useWorkspaceStore.getState().selectElements(['c1'])
    render(<CanvasHints />)
    // The hint reveals after a 500ms delay (matches the existing connect-hint pattern)
    await act(() => new Promise(r => setTimeout(r, 600)))
    expect(screen.getByText(/Backspace removes from this view/i)).toBeTruthy()
    expect(screen.getByText(/Shift\+Backspace deletes from the model/i)).toBeTruthy()
  })

  it('persists dismissal across remounts via localStorage', async () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().setActiveView('cont')
    useWorkspaceStore.getState().selectElements(['c1'])
    const first = render(<CanvasHints />)
    await act(() => new Promise(r => setTimeout(r, 600)))
    fireEvent.click(screen.getByLabelText(/dismiss hint/i))
    first.unmount()

    // Re-mount with the same selection — hint must NOT come back
    render(<CanvasHints />)
    await act(() => new Promise(r => setTimeout(r, 600)))
    expect(screen.queryByText(/Backspace removes from this view/i)).toBeNull()
  })
})
