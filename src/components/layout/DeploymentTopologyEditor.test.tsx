import { render, screen, fireEvent } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace, View } from '@/types/model'
import DeploymentTopologyEditor from './DeploymentTopologyEditor'

vi.mock('lucide-react', () => ({
  Boxes: () => null,
  HardDrive: () => null,
  Plus: () => null,
  Trash2: () => null,
}))

function makeWs(withNode: boolean): Workspace {
  return {
    name: 'T',
    model: {
      people: [],
      softwareSystems: [{ id: 'sys', type: 'softwareSystem', name: 'Sys', tags: [], properties: {}, containers: [] }],
      relationships: [],
      groups: [],
      deploymentEnvironments: [{
        id: 'prod', name: 'Production',
        deploymentNodes: withNode
          ? [{ id: 'server', type: 'deploymentNode', name: 'Server', tags: [], properties: {}, children: [], infrastructureNodes: [], containerInstances: [], softwareSystemInstances: [] }]
          : [],
      }],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      dynamicViews: [],
      deploymentViews: [{ type: 'deployment', key: 'dep', environment: 'Production', elements: [], relationships: [] }],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

function renderEditor(withNode: boolean) {
  useWorkspaceStore.getState().loadWorkspace(makeWs(withNode))
  const view = useWorkspaceStore.getState().workspace!.views.deploymentViews[0] as View
  render(<DeploymentTopologyEditor view={view} />)
}

const addButton = () => screen.getByRole('button', { name: /add topology element/i }) as HTMLButtonElement
const pickKind = (value: string) =>
  fireEvent.change(screen.getByLabelText(/element kind/i), { target: { value } })

describe('DeploymentTopologyEditor — disabled-Add feedback', () => {
  it('explains that instances need a deployment node when the environment is empty', () => {
    renderEditor(false)
    pickKind('systemInstance')
    expect(addButton().disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toMatch(/add a Deployment node first/i)
  })

  it('asks for a host when nodes exist but none is chosen', () => {
    renderEditor(true)
    pickKind('systemInstance')
    expect(addButton().disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toMatch(/which node to put it inside/i)
  })

  it('asks for the element once a host is chosen', () => {
    renderEditor(true)
    pickKind('systemInstance')
    fireEvent.change(screen.getByLabelText(/host deployment node/i), { target: { value: 'server' } })
    expect(addButton().disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toMatch(/which system to instantiate/i)
  })

  it('shows no hint and enables Add for a top-level deployment node in an empty environment', () => {
    renderEditor(false)
    expect(addButton().disabled).toBe(false)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('enables Add once host and element are both chosen', () => {
    renderEditor(true)
    pickKind('systemInstance')
    fireEvent.change(screen.getByLabelText(/host deployment node/i), { target: { value: 'server' } })
    fireEvent.change(screen.getByLabelText(/instance of/i), { target: { value: 'sys' } })
    expect(addButton().disabled).toBe(false)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
