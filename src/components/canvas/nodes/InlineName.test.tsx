import { render, screen, fireEvent } from '@testing-library/react'
import InlineName from './InlineName'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'

function makeWs(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [],
      softwareSystems: [
        {
          id: 'sys-1',
          type: 'softwareSystem',
          name: 'Payment API',
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
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

beforeEach(() => {
  useWorkspaceStore.getState().closeWorkspace()
  useWorkspaceStore.getState().loadWorkspace(makeWs())
})

const storedName = () => useWorkspaceStore.getState().workspace!.model.softwareSystems[0].name

const display = () => screen.getByRole('button', { name: 'Payment API - press F2 to rename' })
const input = () => screen.getByRole('textbox', { name: 'Rename Payment API' }) as HTMLInputElement

describe('InlineName display mode', () => {
  it('renders the name with rename affordances, clamp class and text color', () => {
    render(<InlineName elementId="sys-1" name="Payment API" lineClamp={2} textColor="#ffffff" />)
    const el = display()
    expect(el.textContent).toBe('Payment API')
    expect(el.className).toContain('line-clamp-2')
    expect(el.getAttribute('title')).toBe('Double-click or press F2 to rename')
    expect(el.style.color).not.toBe('')
  })

  it('omits the clamp class and color style when not provided', () => {
    render(<InlineName elementId="sys-1" name="Payment API" />)
    const el = display()
    expect(el.className).not.toContain('line-clamp')
    expect(el.style.color).toBe('')
  })

  it('enters edit mode on double-click and focuses/selects the input', () => {
    render(<InlineName elementId="sys-1" name="Payment API" />)
    fireEvent.doubleClick(display())
    const field = input()
    expect(document.activeElement).toBe(field)
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe('Payment API'.length)
  })

  it('enters edit mode via F2 and Enter but not other keys', () => {
    render(<InlineName elementId="sys-1" name="Payment API" />)
    fireEvent.keyDown(display(), { key: 'a' })
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.keyDown(display(), { key: 'F2' })
    expect(screen.queryByRole('textbox')).not.toBeNull()
    fireEvent.keyDown(input(), { key: 'Escape' })
    fireEvent.keyDown(display(), { key: 'Enter' })
    expect(screen.queryByRole('textbox')).not.toBeNull()
  })
})

describe('InlineName editing', () => {
  it('commits a trimmed rename to the store on Enter', () => {
    render(<InlineName elementId="sys-1" name="Payment API" />)
    fireEvent.doubleClick(display())
    fireEvent.change(input(), { target: { value: '  Payments Platform  ' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(storedName()).toBe('Payments Platform')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('commits on blur', () => {
    render(<InlineName elementId="sys-1" name="Payment API" />)
    fireEvent.doubleClick(display())
    fireEvent.change(input(), { target: { value: 'Blurred Name' } })
    fireEvent.blur(input())
    expect(storedName()).toBe('Blurred Name')
  })

  it('cancels on Escape without touching the store and resets the draft', () => {
    render(<InlineName elementId="sys-1" name="Payment API" />)
    fireEvent.doubleClick(display())
    fireEvent.change(input(), { target: { value: 'Nope' } })
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(storedName()).toBe('Payment API')
    expect(screen.queryByRole('textbox')).toBeNull()
    // Draft is restored on the next edit
    fireEvent.doubleClick(display())
    expect(input().value).toBe('Payment API')
  })

  it('does not update the store for a whitespace-only name and resets the draft', () => {
    render(<InlineName elementId="sys-1" name="Payment API" />)
    fireEvent.doubleClick(display())
    fireEvent.change(input(), { target: { value: '   ' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(storedName()).toBe('Payment API')
    fireEvent.doubleClick(display())
    expect(input().value).toBe('Payment API')
  })

  it('does not update the store when the name is unchanged', () => {
    const before = useWorkspaceStore.getState().undoStack.length
    render(<InlineName elementId="sys-1" name="Payment API" />)
    fireEvent.doubleClick(display())
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(storedName()).toBe('Payment API')
    expect(useWorkspaceStore.getState().undoStack.length).toBe(before)
  })

  it('stops click propagation while editing so the canvas does not react', () => {
    const onClick = vi.fn()
    render(
      <div onClick={onClick}>
        <InlineName elementId="sys-1" name="Payment API" />
      </div>,
    )
    fireEvent.doubleClick(display())
    fireEvent.click(input())
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('InlineName external sync', () => {
  it('syncs the draft when the name prop changes while not editing', () => {
    const { rerender } = render(<InlineName elementId="sys-1" name="Payment API" />)
    rerender(<InlineName elementId="sys-1" name="Renamed API" />)
    expect(screen.getByText('Renamed API')).toBeTruthy()
    fireEvent.doubleClick(screen.getByText('Renamed API'))
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Renamed API')
  })

  it('keeps the in-progress draft when the name prop changes while editing', () => {
    const { rerender } = render(<InlineName elementId="sys-1" name="Payment API" />)
    fireEvent.doubleClick(display())
    fireEvent.change(input(), { target: { value: 'My Draft' } })
    rerender(<InlineName elementId="sys-1" name="Renamed API" />)
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('My Draft')
  })
})
