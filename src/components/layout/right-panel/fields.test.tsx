import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'
import { FieldLabel, EditableField, TechnologyField, OwnerField } from './fields'

function makeWs(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [{ id: 'bob', type: 'person', name: 'Bob', tags: ['Element', 'Person'], properties: {}, owner: 'Team A' }],
      softwareSystems: [{
        id: 'sys', type: 'softwareSystem', name: 'Sys', tags: ['Element', 'Software System'], properties: {}, owner: 'Team A',
        containers: [
          {
            id: 'c1', type: 'container', name: 'C1', tags: ['Element', 'Container'], properties: {},
            technology: 'React', owner: 'Team B',
            components: [{ id: 'cmp', type: 'component', name: 'Cmp', tags: ['Element', 'Component'], properties: {}, technology: 'Redis' }],
          },
          { id: 'c2', type: 'container', name: 'C2', tags: ['Element', 'Container'], properties: {}, technology: 'React, PostgreSQL', components: [] },
        ],
      }],
      relationships: [
        { id: 'r1', sourceId: 'bob', destinationId: 'sys', tags: ['Relationship'], properties: {}, technology: 'HTTP' },
        { id: 'r2', sourceId: 'sys', destinationId: 'bob', tags: ['Relationship'], properties: {}, technology: 'HTTP, gRPC' },
      ],
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
  localStorage.clear()
  useWorkspaceStore.getState().closeWorkspace()
  useWorkspaceStore.getState().loadWorkspace(makeWs())
})

describe('FieldLabel', () => {
  it('renders a label bound to the given control id', () => {
    render(<FieldLabel htmlFor="x">Owner</FieldLabel>)
    const label = screen.getByText('Owner')
    expect(label.tagName).toBe('LABEL')
    expect(label.getAttribute('for')).toBe('x')
  })
})

describe('EditableField', () => {
  it('commits the draft on blur and reports live changes', () => {
    const onCommit = vi.fn()
    const onLiveChange = vi.fn()
    render(<EditableField value="old" aria-label="Name" onCommit={onCommit} onLiveChange={onLiveChange} />)

    const input = screen.getByLabelText('Name')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'new name' } })
    expect(onLiveChange).toHaveBeenLastCalledWith('new name')
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith('new name')
  })

  it('commits on Enter for single-line fields', () => {
    const onCommit = vi.fn()
    render(<EditableField value="old" aria-label="Name" onCommit={onCommit} />)

    const input = screen.getByLabelText('Name')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'draft' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('draft')
  })

  it('Escape resets the draft to the original value', () => {
    const onCommit = vi.fn()
    const onLiveChange = vi.fn()
    render(<EditableField value="orig" aria-label="Name" onCommit={onCommit} onLiveChange={onLiveChange} />)

    const input = screen.getByLabelText('Name') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'scrap this' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onLiveChange).toHaveBeenLastCalledWith('orig')
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith('orig')
  })

  it('renders a textarea in multiline mode where Enter does not commit', () => {
    const onCommit = vi.fn()
    render(<EditableField value="desc" aria-label="Description" onCommit={onCommit} multiline />)

    const area = screen.getByLabelText('Description')
    expect(area.tagName).toBe('TEXTAREA')
    fireEvent.focus(area)
    fireEvent.change(area, { target: { value: 'line' } })
    fireEvent.keyDown(area, { key: 'Enter' })
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.blur(area)
    expect(onCommit).toHaveBeenCalledWith('line')
  })
})

describe('TechnologyField', () => {
  function setup(value = '', scope: 'element' | 'relationship' = 'element', onCommit = vi.fn()) {
    render(<TechnologyField value={value} scope={scope} aria-label="Technology" onCommit={onCommit} />)
    const wrapper = screen.getByLabelText('Technology')
    const input = wrapper.querySelector('input')!
    return { wrapper, input, onCommit }
  }

  it('suggests element technologies by usage on focus, excluding tokens already present', () => {
    const { input } = setup('React')
    fireEvent.focus(input)

    // React is already a chip → not suggested again
    expect(screen.queryByRole('button', { name: /^React/ })).toBeNull()
    expect(screen.getByText('PostgreSQL')).toBeTruthy()
    expect(screen.getByText('Redis')).toBeTruthy()
    // Relationship technologies stay out of element scope
    expect(screen.queryByText('HTTP')).toBeNull()
  })

  it('suggests relationship technologies in relationship scope', () => {
    const { input } = setup('', 'relationship')
    fireEvent.focus(input)

    expect(screen.getByText('HTTP')).toBeTruthy()
    expect(screen.getByText('gRPC')).toBeTruthy()
    expect(screen.queryByText('React')).toBeNull()
  })

  it('filters suggestions while typing and commits a clicked suggestion', () => {
    const { input, onCommit } = setup('')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'post' } })

    expect(screen.getByText('PostgreSQL')).toBeTruthy()
    expect(screen.queryByText('Redis')).toBeNull()

    fireEvent.mouseDown(screen.getByText('PostgreSQL'))
    expect(onCommit).toHaveBeenCalledWith('PostgreSQL')
  })

  it('Enter commits the typed draft as a new token', () => {
    const { input, onCommit } = setup('React')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Vue' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('React, Vue')
  })

  it('ArrowDown highlights a suggestion that Enter then picks', () => {
    const { input, onCommit } = setup('')
    fireEvent.focus(input)
    // Suggestions sorted by count desc then name: React(2), PostgreSQL(1), Redis(1)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('React')
  })

  it('typing a comma commits the pending token immediately', () => {
    const { input, onCommit } = setup('')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Kafka, ' } })
    expect(onCommit).toHaveBeenCalledWith('Kafka')
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('Backspace on an empty draft removes the last chip', () => {
    const { input, onCommit } = setup('React, PostgreSQL')
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(onCommit).toHaveBeenCalledWith('React')
  })

  it('chip remove buttons drop a single token', () => {
    const { onCommit } = setup('React, PostgreSQL')
    fireEvent.click(screen.getByRole('button', { name: 'Remove React' }))
    expect(onCommit).toHaveBeenCalledWith('PostgreSQL')
  })

  it('blur commits any pending draft text', () => {
    const { input, onCommit } = setup('')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Elixir' } })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith('Elixir')
  })

  it('Escape first clears the dropdown highlight, then clears the draft', () => {
    const { input, onCommit } = setup('')
    fireEvent.focus(input)
    // Dropdown open (suggestions exist) → Escape only resets the highlight
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).not.toHaveBeenCalled()

    // No matches → dropdown closed → Escape clears the draft
    fireEvent.change(input, { target: { value: 'zzz-no-match' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect((input as HTMLInputElement).value).toBe('')
  })
})

describe('OwnerField', () => {
  function setup(value = '', onCommit = vi.fn(), onLiveChange = vi.fn()) {
    const view = render(
      <OwnerField value={value} aria-label="Owner" placeholder="e.g. Team Alpha" onCommit={onCommit} onLiveChange={onLiveChange} />,
    )
    const input = screen.getByPlaceholderText('e.g. Team Alpha') as HTMLInputElement
    return { view, input, onCommit, onLiveChange }
  }

  it('suggests owners from the model with usage counts', () => {
    const { input } = setup()
    fireEvent.focus(input)

    // Team A used twice (person + system), Team B once (container)
    expect(screen.getByText('Team A')).toBeTruthy()
    expect(screen.getByText('Team B')).toBeTruthy()
  })

  it('commits a suggestion picked with the mouse', () => {
    const { input, onCommit } = setup()
    fireEvent.focus(input)
    fireEvent.mouseDown(screen.getByText('Team A'))
    expect(onCommit).toHaveBeenCalledWith('Team A')
    expect(input.value).toBe('Team A')
  })

  it('filters suggestions while typing and commits typed text on Enter', () => {
    const { input, onCommit, onLiveChange } = setup()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'team b' } })
    expect(onLiveChange).toHaveBeenLastCalledWith('team b')
    expect(screen.queryByText('Team A')).toBeNull()
    expect(screen.getByText('Team B')).toBeTruthy()

    fireEvent.change(input, { target: { value: 'Brand New Team' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('Brand New Team')
  })

  it('ArrowDown + Enter chooses the highlighted suggestion', () => {
    const { input, onCommit } = setup()
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('Team A')
  })

  it('Escape reverts the draft to the current value', () => {
    const { input, onCommit } = setup('Team B')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'half typed' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('Team B')
    fireEvent.blur(input)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('blur commits a changed draft', () => {
    const { input, onCommit } = setup('Team B')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Platform' } })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith('Platform')
  })

  it('clear button empties the value', () => {
    const { onCommit } = setup('Team B')
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Clear owner' }))
    expect(onCommit).toHaveBeenCalledWith('')
  })

  it('syncs the draft when the external value changes', () => {
    const onCommit = vi.fn()
    const { rerender } = render(
      <OwnerField value="Team A" aria-label="Owner" placeholder="e.g. Team Alpha" onCommit={onCommit} />,
    )
    const input = screen.getByPlaceholderText('e.g. Team Alpha') as HTMLInputElement
    expect(input.value).toBe('Team A')

    rerender(<OwnerField value="Team B" aria-label="Owner" placeholder="e.g. Team Alpha" onCommit={onCommit} />)
    expect(input.value).toBe('Team B')
  })

  it('stops mousedown from propagating to document-level listeners', () => {
    const docSpy = vi.fn()
    document.addEventListener('mousedown', docSpy)
    try {
      const { input } = setup('Team B')
      fireEvent.mouseDown(input)
      expect(docSpy).not.toHaveBeenCalled()

      fireEvent.mouseDown(document.body)
      expect(docSpy).toHaveBeenCalledTimes(1)
    } finally {
      document.removeEventListener('mousedown', docSpy)
    }
  })

  it('supports full keyboard entry via user-event', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    setup('', onCommit)
    const input = screen.getByPlaceholderText('e.g. Team Alpha')
    await user.click(input)
    await user.keyboard('Core Team{Enter}')
    expect(onCommit).toHaveBeenCalledWith('Core Team')
  })
})
