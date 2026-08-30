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

/** Workspace with two systems where the deployment view is scoped to Sys:
 *  server hosts an instance of Sys's container (in scope) and the topology
 *  also carries an empty node "spare" (out of scope — hosts nothing of Sys). */
function makeScopedWs(scopeId: string | undefined): Workspace {
  return {
    name: 'T',
    model: {
      people: [],
      softwareSystems: [
        { id: 'sys', type: 'softwareSystem', name: 'Sys', tags: [], properties: {},
          containers: [{ id: 'mob', type: 'container', name: 'Mobile App', tags: [], properties: {}, components: [] }] },
        { id: 'other', type: 'softwareSystem', name: 'Other', tags: [], properties: {}, containers: [] },
      ],
      relationships: [],
      groups: [],
      deploymentEnvironments: [{
        id: 'prod', name: 'Production',
        deploymentNodes: [
          { id: 'server', type: 'deploymentNode', name: 'Server', tags: [], properties: {}, children: [], infrastructureNodes: [],
            containerInstances: [{ id: 'inst', type: 'containerInstance', containerId: 'mob', tags: [], properties: {} }],
            softwareSystemInstances: [] },
          { id: 'spare', type: 'deploymentNode', name: 'Spare', tags: [], properties: {}, children: [], infrastructureNodes: [], containerInstances: [], softwareSystemInstances: [] },
        ],
      }],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      dynamicViews: [],
      deploymentViews: [{
        type: 'deployment', key: 'dep', environment: 'Production',
        softwareSystemId: scopeId,
        // What expandDeploymentElements keeps for a Sys-scoped view: the
        // hosting node and the instance; 'spare' is filtered out.
        elements: scopeId ? [{ id: 'server' }, { id: 'inst' }] : [{ id: 'server' }, { id: 'inst' }, { id: 'spare' }],
        relationships: [],
      }],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

function renderScopedEditor(scopeId: string | undefined) {
  useWorkspaceStore.getState().loadWorkspace(makeScopedWs(scopeId))
  const view = useWorkspaceStore.getState().workspace!.views.deploymentViews[0] as View
  render(<DeploymentTopologyEditor view={view} />)
}

describe('DeploymentTopologyEditor — scoped-view visibility', () => {
  it('badges topology rows the scoped view filters out, and only those', () => {
    renderScopedEditor('sys')
    const badges = document.querySelectorAll('[data-out-of-scope]')
    expect(badges).toHaveLength(1)
    const rows = Array.from(document.querySelectorAll('[data-topology-row]'))
    const spareRow = rows.find(r => r.textContent!.includes('Spare'))!
    expect(spareRow.querySelector('[data-out-of-scope]')).not.toBeNull()
    const serverRow = rows.find(r => r.textContent!.includes('Server'))!
    expect(serverRow.querySelector('[data-out-of-scope]')).toBeNull()
  })

  it('shows no badges on an unscoped view', () => {
    renderScopedEditor(undefined)
    expect(document.querySelectorAll('[data-out-of-scope]')).toHaveLength(0)
  })

  it('annotates out-of-scope systems in the Instance of dropdown', () => {
    renderScopedEditor('sys')
    pickKind('systemInstance')
    const select = screen.getByLabelText(/instance of/i) as HTMLSelectElement
    const texts = Array.from(select.options).map(o => o.text)
    expect(texts).toContain('Sys')
    expect(texts).toContain('Other — outside view scope')
  })

  it('warns before adding an instance the scoped view will hide', () => {
    renderScopedEditor('sys')
    pickKind('systemInstance')
    fireEvent.change(screen.getByLabelText(/host deployment node/i), { target: { value: 'server' } })
    fireEvent.change(screen.getByLabelText(/instance of/i), { target: { value: 'other' } })
    expect(addButton().disabled).toBe(false)
    expect(screen.getByRole('status').textContent).toMatch(/outside the view's scope \(Sys\).*hidden in this view/i)
  })

  it('does not warn for an in-scope instance', () => {
    renderScopedEditor('sys')
    pickKind('containerInstance')
    fireEvent.change(screen.getByLabelText(/host deployment node/i), { target: { value: 'server' } })
    fireEvent.change(screen.getByLabelText(/instance of/i), { target: { value: 'mob' } })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('warns that a new deployment node stays hidden until it hosts an in-scope instance', () => {
    renderScopedEditor('sys')
    expect(screen.getByRole('status').textContent).toMatch(/hidden until it hosts an instance of Sys/i)
  })

  it('warns for infra added to a hidden host but not to a visible one', () => {
    renderScopedEditor('sys')
    pickKind('infra')
    fireEvent.change(screen.getByLabelText(/host deployment node/i), { target: { value: 'spare' } })
    expect(screen.getByRole('status').textContent).toMatch(/infrastructure node will be hidden/i)
    fireEvent.change(screen.getByLabelText(/host deployment node/i), { target: { value: 'server' } })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows a scope chip in the header for scoped views only', () => {
    renderScopedEditor('sys')
    const chip = document.querySelector('[data-scope-chip]')
    expect(chip).not.toBeNull()
    expect(chip!.textContent).toBe('scoped to Sys')
  })

  it('shows no scope chip on an unscoped view', () => {
    renderScopedEditor(undefined)
    expect(document.querySelector('[data-scope-chip]')).toBeNull()
  })

  it('offers a link to an existing unscoped view of the environment and switches to it', () => {
    const ws = makeScopedWs('sys')
    ws.views.deploymentViews.push({
      type: 'deployment', key: 'dep-full', environment: 'Production',
      elements: [{ id: 'server' }, { id: 'inst' }, { id: 'spare' }], relationships: [],
    })
    useWorkspaceStore.getState().loadWorkspace(ws)
    const view = useWorkspaceStore.getState().workspace!.views.deploymentViews[0] as View
    render(<DeploymentTopologyEditor view={view} />)

    const link = screen.getByRole('button', { name: /open the unscoped Production view/i })
    expect(link.textContent).toMatch(/1 hidden here/)
    fireEvent.click(link)
    expect(useWorkspaceStore.getState().activeViewKey).toBe('dep-full')
  })

  it('creates an unscoped view of the environment when none exists', () => {
    renderScopedEditor('sys')
    fireEvent.click(screen.getByRole('button', { name: /open the unscoped Production view/i }))
    const s = useWorkspaceStore.getState()
    const views = s.workspace!.views.deploymentViews
    expect(views).toHaveLength(2)
    const full = views.find(v => !v.softwareSystemId)!
    expect(full.environment).toBe('Production')
    expect(s.activeViewKey).toBe(full.key)
    // The new view projects the whole environment, hidden 'spare' included.
    expect(full.elements.map(e => e.id)).toEqual(expect.arrayContaining(['server', 'inst', 'spare']))
  })

  it('shows no unscoped-view link when nothing is hidden', () => {
    renderScopedEditor(undefined)
    expect(screen.queryByRole('button', { name: /open the unscoped/i })).toBeNull()
  })
})
