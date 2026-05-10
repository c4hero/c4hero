import { render, screen } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'
import AddElementPanel from './AddElementPanel'

vi.mock('lucide-react', () => ({
  UserRound: () => null,
  Globe: () => null,
  Box: () => null,
  Puzzle: () => null,
  Plus: () => null,
  Search: () => null,
  Database: () => null,
  Zap: () => null,
  GitMerge: () => null,
  Smartphone: () => null,
  HardDrive: () => null,
  Monitor: () => null,
  ChevronDown: () => null,
}))

function makeWs(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [],
      softwareSystems: [
        {
          id: 'focal',
          type: 'softwareSystem',
          name: 'Focal System',
          tags: ['Element', 'Software System'],
          properties: {},
          containers: [
            { id: 'web', type: 'container', name: 'Web', tags: ['Element', 'Container'], properties: {}, components: [] },
          ],
        },
        {
          id: 'peer',
          type: 'softwareSystem',
          name: 'Peer System',
          tags: ['Element', 'Software System'],
          properties: {},
          containers: [],
        },
      ],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [
        {
          type: 'container',
          key: 'focal-containers',
          title: 'Focal Containers',
          softwareSystemId: 'focal',
          elements: [{ id: 'web' }],
          relationships: [],
        },
      ],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

beforeEach(() => {
  useWorkspaceStore.getState().closeWorkspace()
})

describe('AddElementPanel — focal scope exclusion', () => {
  it('excludes the focal system from "Add existing" on its own container view', () => {
    const ws = makeWs()
    useWorkspaceStore.getState().loadWorkspace(ws)
    useWorkspaceStore.getState().setActiveView('focal-containers')

    render(<AddElementPanel onClose={() => {}} />)

    // Peer system is a legitimate sibling and should appear
    expect(screen.queryByText('Peer System')).not.toBeNull()
    // Focal system must NOT appear — adding it would let the user delete the
    // entire system (and all its containers/components/scoped views) by
    // "removing" the node from the canvas.
    expect(screen.queryByText('Focal System')).toBeNull()
  })
})
