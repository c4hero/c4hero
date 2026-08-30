import { render, screen, fireEvent } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'
import CreateViewDialog from './CreateViewDialog'

vi.mock('lucide-react', () => ({
  X: () => null,
}))

function makeWs(overrides: Partial<Workspace> = {}): Workspace {
  return {
    name: 'T',
    model: { people: [], softwareSystems: [], relationships: [], groups: [] },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
    ...overrides,
  }
}

beforeEach(() => useWorkspaceStore.getState().closeWorkspace())

describe('CreateViewDialog — softwareSystem-scope focal restriction', () => {
  it('restricts Context view scope to the focal system when the workspace is softwaresystem-scoped', () => {
    const ws = makeWs({
      scope: 'softwaresystem',
      model: {
        people: [],
        softwareSystems: [
          // Focal system — has containers, so the validator considers it the workspace's focal.
          { id: 'focal', type: 'softwareSystem', name: 'Focal', tags: [], properties: {},
            containers: [{ id: 'c1', type: 'container', name: 'C1', tags: [], properties: {}, components: [] }] },
          // External system — no containers; should NOT appear in the Context view scope picker.
          { id: 'external', type: 'softwareSystem', name: 'External', tags: [], properties: {}, containers: [] },
        ],
        relationships: [], groups: [],
      },
    })
    useWorkspaceStore.getState().loadWorkspace(ws)
    render(<CreateViewDialog onClose={() => {}} />)

    // Default view type is the first allowed one in a softwaresystem-scoped workspace
    // (systemContext). The scope dropdown should list only Focal.
    const scopeSelect = screen.getByLabelText(/scope/i) as HTMLSelectElement
    const optionTexts = Array.from(scopeSelect.options).map(o => o.text)
    expect(optionTexts).toContain('Focal')
    expect(optionTexts).not.toContain('External')
  })

  it('shows ALL systems in the picker when no system has containers yet (focal not yet decided)', () => {
    // Edge case: a fresh softwaresystem-scoped workspace with two systems but no
    // containers anywhere. The focal hasn't been chosen, so the user must be
    // allowed to pick. Once one of them gets containers, the picker tightens.
    const ws = makeWs({
      scope: 'softwaresystem',
      model: {
        people: [],
        softwareSystems: [
          { id: 'a', type: 'softwareSystem', name: 'A', tags: [], properties: {}, containers: [] },
          { id: 'b', type: 'softwareSystem', name: 'B', tags: [], properties: {}, containers: [] },
        ],
        relationships: [], groups: [],
      },
    })
    useWorkspaceStore.getState().loadWorkspace(ws)
    render(<CreateViewDialog onClose={() => {}} />)

    const scopeSelect = screen.getByLabelText(/scope/i) as HTMLSelectElement
    const optionTexts = Array.from(scopeSelect.options).map(o => o.text)
    expect(optionTexts).toContain('A')
    expect(optionTexts).toContain('B')
  })

  it('does NOT restrict the picker for landscape-scoped workspaces', () => {
    const ws = makeWs({
      scope: 'landscape',
      model: {
        people: [],
        softwareSystems: [
          { id: 'a', type: 'softwareSystem', name: 'A', tags: [], properties: {}, containers: [] },
          { id: 'b', type: 'softwareSystem', name: 'B', tags: [], properties: {}, containers: [] },
        ],
        relationships: [], groups: [],
      },
    })
    useWorkspaceStore.getState().loadWorkspace(ws)
    render(<CreateViewDialog onClose={() => {}} />)

    // In a landscape-scoped workspace, default first view type is systemLandscape,
    // which has no scope picker. Switch to systemContext to see the picker.
    const typeSelect = screen.getByLabelText(/type/i) as HTMLSelectElement
    typeSelect.value = 'systemContext'
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }))

    const scopeSelect = screen.getByLabelText(/scope/i) as HTMLSelectElement
    const optionTexts = Array.from(scopeSelect.options).map(o => o.text)
    expect(optionTexts).toContain('A')
    expect(optionTexts).toContain('B')
  })

  it('does NOT restrict the picker for unscoped workspaces', () => {
    const ws = makeWs({
      model: {
        people: [],
        softwareSystems: [
          // 'a' has containers (would be focal if scope were softwaresystem)
          { id: 'a', type: 'softwareSystem', name: 'A', tags: [], properties: {},
            containers: [{ id: 'c1', type: 'container', name: 'C1', tags: [], properties: {}, components: [] }] },
          { id: 'b', type: 'softwareSystem', name: 'B', tags: [], properties: {}, containers: [] },
        ],
        relationships: [], groups: [],
      },
    })
    useWorkspaceStore.getState().loadWorkspace(ws)
    render(<CreateViewDialog onClose={() => {}} />)

    // Unscoped workspace defaults to systemLandscape (no scope picker). Switch
    // to systemContext so the picker renders.
    const typeSelect = screen.getByLabelText(/type/i) as HTMLSelectElement
    typeSelect.value = 'systemContext'
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }))

    const scopeSelect = screen.getByLabelText(/scope/i) as HTMLSelectElement
    const optionTexts = Array.from(scopeSelect.options).map(o => o.text)
    expect(optionTexts).toContain('A')
    expect(optionTexts).toContain('B')
  })
})

describe('CreateViewDialog — zero-systems guard', () => {
  it('disables Create View and surfaces a hint when a scope is required but none exist', () => {
    // Softwaresystem-scoped workspace with no systems at all. Default type is
    // systemContext (first allowed type when scope is softwaresystem), which
    // requires a system scope — but there are none. The Create button must be
    // disabled and an explanatory alert must be visible.
    const ws = makeWs({ scope: 'softwaresystem' })
    useWorkspaceStore.getState().loadWorkspace(ws)
    render(<CreateViewDialog onClose={() => {}} />)

    const createBtn = screen.getByRole('button', { name: /^create view$/i }) as HTMLButtonElement
    expect(createBtn.disabled).toBe(true)

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/no system exists yet/i)
  })

  it('disables Create View for a Component view when no containers exist', () => {
    // Unscoped workspace with one system but no containers. Switch type to
    // component — there's nothing to scope it to.
    const ws = makeWs({
      model: {
        people: [],
        softwareSystems: [
          { id: 'sys', type: 'softwareSystem', name: 'Sys', tags: [], properties: {}, containers: [] },
        ],
        relationships: [], groups: [],
      },
    })
    useWorkspaceStore.getState().loadWorkspace(ws)
    render(<CreateViewDialog onClose={() => {}} />)

    const typeSelect = screen.getByLabelText(/type/i) as HTMLSelectElement
    typeSelect.value = 'component'
    typeSelect.dispatchEvent(new Event('change', { bubbles: true }))

    const createBtn = screen.getByRole('button', { name: /^create view$/i }) as HTMLButtonElement
    expect(createBtn.disabled).toBe(true)

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/no container exists yet/i)
  })

  it('does NOT raise the alert for a Landscape view (no scope needed)', () => {
    const ws = makeWs() // unscoped, no systems
    useWorkspaceStore.getState().loadWorkspace(ws)
    render(<CreateViewDialog onClose={() => {}} />)

    // Default first type is systemLandscape (unscoped workspace) — no scope picker,
    // no alert, button enabled.
    expect(screen.queryByRole('alert')).toBeNull()
    const createBtn = screen.getByRole('button', { name: /^create view$/i }) as HTMLButtonElement
    expect(createBtn.disabled).toBe(false)
  })
})

describe('CreateViewDialog — deployment environment creation (inline)', () => {
  const setType = (value: string) => {
    const typeSelect = screen.getByLabelText(/type/i) as HTMLSelectElement
    fireEvent.change(typeSelect, { target: { value } })
  }

  it('offers an environment name input instead of a dead-end when none exist', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<CreateViewDialog onClose={() => {}} />)
    setType('deployment')

    // No "define one in the DSL" alert anymore.
    expect(screen.queryByRole('alert')).toBeNull()
    const nameInput = screen.getByLabelText(/environment/i) as HTMLInputElement
    const createBtn = screen.getByRole('button', { name: /^create view$/i }) as HTMLButtonElement
    expect(createBtn.disabled).toBe(true)

    fireEvent.change(nameInput, { target: { value: 'Production' } })
    expect(createBtn.disabled).toBe(false)
    fireEvent.click(createBtn)

    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.deploymentEnvironments).toHaveLength(1)
    expect(ws.model.deploymentEnvironments![0]).toMatchObject({ name: 'Production', deploymentNodes: [] })
    expect(ws.views.deploymentViews).toHaveLength(1)
    expect(ws.views.deploymentViews[0].environment).toBe('Production')
  })

  it('lets "New environment…" create a second environment alongside existing ones', () => {
    const ws = makeWs()
    ws.model.deploymentEnvironments = [{ id: 'live', name: 'Live', deploymentNodes: [] }]
    useWorkspaceStore.getState().loadWorkspace(ws)
    render(<CreateViewDialog onClose={() => {}} />)
    setType('deployment')

    const envSelect = screen.getByLabelText(/^environment/i) as HTMLSelectElement
    expect(Array.from(envSelect.options).map(o => o.text)).toContain('New environment…')
    fireEvent.change(envSelect, { target: { value: '__new__' } })

    const nameInput = screen.getByLabelText(/new environment name/i) as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Staging' } })
    fireEvent.click(screen.getByRole('button', { name: /^create view$/i }))

    const after = useWorkspaceStore.getState().workspace!
    expect(after.model.deploymentEnvironments!.map(e => e.name)).toEqual(['Live', 'Staging'])
    expect(after.views.deploymentViews[0].environment).toBe('Staging')
  })

  it('does not carry a preseeded zoom scope into a deployment view (TEA-81 scope trap)', () => {
    // The zoom "Customize…" flow preseeds type + scopeId. Switching the type
    // to Deployment must drop that scope — a silently scoped deployment view
    // filters out everything that doesn't deploy the scope system, which looks
    // like adds doing nothing.
    const ws = makeWs({
      model: {
        people: [],
        softwareSystems: [
          { id: 'a', type: 'softwareSystem', name: 'A', tags: [], properties: {},
            containers: [{ id: 'c1', type: 'container', name: 'C1', tags: [], properties: {}, components: [] }] },
        ],
        relationships: [], groups: [],
      },
    })
    useWorkspaceStore.getState().loadWorkspace(ws)
    useWorkspaceStore.getState().setCreateViewDefaults({ type: 'container', scopeId: 'a' })
    render(<CreateViewDialog onClose={() => {}} />)
    setType('deployment')

    // The optional scope picker must be back at "All systems".
    const scopeSelect = screen.getByLabelText(/scope \(optional\)/i) as HTMLSelectElement
    expect(scopeSelect.value).toBe('')

    fireEvent.change(screen.getByLabelText(/environment/i), { target: { value: 'Production' } })
    fireEvent.click(screen.getByRole('button', { name: /^create view$/i }))
    const after = useWorkspaceStore.getState().workspace!
    expect(after.views.deploymentViews[0].softwareSystemId).toBeUndefined()
  })

  it('targets the existing environment when the typed name matches one', () => {
    const ws = makeWs()
    ws.model.deploymentEnvironments = [{ id: 'live', name: 'Live', deploymentNodes: [] }]
    useWorkspaceStore.getState().loadWorkspace(ws)
    render(<CreateViewDialog onClose={() => {}} />)
    setType('deployment')

    const envSelect = screen.getByLabelText(/^environment/i) as HTMLSelectElement
    fireEvent.change(envSelect, { target: { value: '__new__' } })
    fireEvent.change(screen.getByLabelText(/new environment name/i), { target: { value: '  Live  ' } })
    fireEvent.click(screen.getByRole('button', { name: /^create view$/i }))

    const after = useWorkspaceStore.getState().workspace!
    expect(after.model.deploymentEnvironments).toHaveLength(1)
    expect(after.views.deploymentViews[0].environment).toBe('Live')
  })
})
