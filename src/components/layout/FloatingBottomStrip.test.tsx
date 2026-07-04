import { render, screen, fireEvent, act } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'
import type { ScopeViolation } from '@/lib/scopeValidation'
import FloatingBottomStrip, { TagManagerPanel } from './FloatingBottomStrip'

function makeWs(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person', 'Team A'], properties: {} }],
      softwareSystems: [{ id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {}, containers: [] }],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [
        { type: 'systemLandscape', key: 'overview', title: 'Overview', elements: [{ id: 'alice' }, { id: 'api' }], relationships: [] },
      ],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [{ tag: 'Person', background: '#123456' }], relationships: [] } },
    },
  }
}

function setViolations(violations: ScopeViolation[]) {
  act(() => { useWorkspaceStore.setState({ scopeViolations: violations }) })
}

function elementStyles() {
  return useWorkspaceStore.getState().workspace!.views.configuration.styles.elements
}

function aliceTags() {
  return useWorkspaceStore.getState().workspace!.model.people[0].tags
}

beforeEach(() => {
  localStorage.clear()
  useWorkspaceStore.getState().closeWorkspace()
})

describe('FloatingBottomStrip', () => {
  it('returns null when no workspace is loaded', () => {
    const { container } = render(<FloatingBottomStrip />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null when the only violations are anchored to elements or relationships', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    setViolations([
      { type: 'error', message: 'element issue', elementId: 'alice' },
      { type: 'warning', message: 'rel issue', relationshipId: 'r1' },
    ])
    const { container } = render(<FloatingBottomStrip />)
    expect(container.firstChild).toBeNull()
  })

  it('shows a banner for an orphan (workspace-level) scope violation', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    setViolations([{ type: 'error', message: 'Landscape workspaces cannot define containers' }])
    render(<FloatingBottomStrip />)
    expect(screen.getByText('Landscape workspaces cannot define containers')).toBeTruthy()
  })

  it('summarises additional orphan violations as "+N more"', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    setViolations([
      { type: 'error', message: 'first problem' },
      { type: 'error', message: 'second problem' },
      { type: 'warning', message: 'third problem' },
    ])
    render(<FloatingBottomStrip />)
    expect(screen.getByText('first problem')).toBeTruthy()
    expect(screen.getByText('+2 more')).toBeTruthy()
  })
})

describe('TagManagerPanel', () => {
  it('renders built-in type tags and custom tags in separate sections', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<TagManagerPanel onClose={() => {}} />)
    expect(screen.getByText('Manage Tags')).toBeTruthy()
    expect(screen.getByText('Type')).toBeTruthy()
    expect(screen.getByText('Custom')).toBeTruthy()
    for (const builtin of ['Person', 'Software System', 'Container', 'Component']) {
      expect(screen.getByText(builtin)).toBeTruthy()
    }
    // Custom tags render as editable inputs
    expect(screen.getByDisplayValue('Team A')).toBeTruthy()
  })

  it('renders default type tags even without a workspace', () => {
    render(<TagManagerPanel onClose={() => {}} />)
    expect(screen.getByText('Person')).toBeTruthy()
    expect(screen.getByText('Component')).toBeTruthy()
    expect(screen.queryByText('Custom')).toBeNull()
  })

  it('adds a new tag via the Add button and clears the input', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<TagManagerPanel onClose={() => {}} />)
    const input = screen.getByPlaceholderText('New tag name...') as HTMLInputElement
    const addBtn = screen.getByText('Add').closest('button') as HTMLButtonElement
    expect(addBtn.disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'Deprecated' } })
    expect(addBtn.disabled).toBe(false)
    fireEvent.click(addBtn)
    expect(elementStyles().some((s) => s.tag === 'Deprecated')).toBe(true)
    expect(input.value).toBe('')
  })

  it('adds a new tag on Enter and clears the draft on Escape', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<TagManagerPanel onClose={() => {}} />)
    const input = screen.getByPlaceholderText('New tag name...') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'abandoned' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('')
    fireEvent.change(input, { target: { value: 'Frontend' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(elementStyles().some((s) => s.tag === 'Frontend')).toBe(true)
  })

  it('ignores adding a blank tag', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<TagManagerPanel onClose={() => {}} />)
    const input = screen.getByPlaceholderText('New tag name...')
    const before = elementStyles().length
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(elementStyles().length).toBe(before)
  })

  it('renames a custom tag on blur', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<TagManagerPanel onClose={() => {}} />)
    const input = screen.getByDisplayValue('Team A')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Team B' } })
    fireEvent.blur(input)
    expect(aliceTags()).toContain('Team B')
    expect(aliceTags()).not.toContain('Team A')
  })

  it('renames a custom tag via the confirm button', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<TagManagerPanel onClose={() => {}} />)
    const input = screen.getByDisplayValue('Team A')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Platform' } })
    fireEvent.mouseDown(screen.getByLabelText('Confirm rename'))
    expect(aliceTags()).toContain('Platform')
  })

  it('restores the draft when a rename is abandoned (Escape / blank blur)', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<TagManagerPanel onClose={() => {}} />)
    const input = screen.getByDisplayValue('Team A') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Nope' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)
    expect(aliceTags()).toContain('Team A')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)
    expect(aliceTags()).toContain('Team A')
    expect(input.value).toBe('Team A')
  })

  it('removes a custom tag globally', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<TagManagerPanel onClose={() => {}} />)
    fireEvent.click(screen.getByLabelText('Remove tag "Team A" globally'))
    expect(aliceTags()).not.toContain('Team A')
  })

  it('opens the inline style editor and updates shape, border, opacity, and font size', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<TagManagerPanel onClose={() => {}} />)
    // Tags sort alphabetically: Component, Container, Person, Software System, then custom Team A
    const styleButtons = screen.getAllByLabelText('Edit style')
    fireEvent.click(styleButtons[2]) // Person — has an existing style
    expect(screen.getByText('Background')).toBeTruthy()

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'Cylinder' } }) // Shape
    fireEvent.change(selects[1], { target: { value: 'Dashed' } })   // Border
    fireEvent.change(screen.getByRole('slider'), { target: { value: '50' } })
    fireEvent.change(screen.getByPlaceholderText('Default'), { target: { value: '18' } })

    const personStyle = elementStyles().find((s) => s.tag === 'Person')!
    expect(personStyle.shape).toBe('Cylinder')
    expect(personStyle.border).toBe('Dashed')
    expect(personStyle.opacity).toBe(50)
    expect(personStyle.fontSize).toBe(18)
  })

  it('updates the background color through the color picker input', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<TagManagerPanel onClose={() => {}} />)
    fireEvent.click(screen.getAllByLabelText('Edit style')[2]) // Person
    const colorInputs = screen.getAllByPlaceholderText('#hex or name')
    fireEvent.change(colorInputs[0], { target: { value: '#ff0000' } })
    expect(elementStyles().find((s) => s.tag === 'Person')!.background).toBe('#ff0000')
  })

  it('removes an existing style via "Remove style" and closes the editor', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<TagManagerPanel onClose={() => {}} />)
    fireEvent.click(screen.getAllByLabelText('Edit style')[2]) // Person
    fireEvent.click(screen.getByText('Remove style'))
    expect(elementStyles().some((s) => s.tag === 'Person')).toBe(false)
    expect(screen.queryByText('Remove style')).toBeNull()
  })

  it('offers no "Remove style" button for tags without a style, and toggles the editor closed', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<TagManagerPanel onClose={() => {}} />)
    const teamAEdit = screen.getAllByLabelText('Edit style')[4] // Team A (custom, unstyled)
    fireEvent.click(teamAEdit)
    expect(screen.queryByText('Remove style')).toBeNull()
    expect(screen.getByText('Background')).toBeTruthy()
    fireEvent.click(teamAEdit) // toggle closed
    expect(screen.queryByText('Background')).toBeNull()
  })

  it('closes via the backdrop and the header close button', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    const onClose = vi.fn()
    render(<TagManagerPanel onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    fireEvent.click(screen.getByLabelText('Close tag manager'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
