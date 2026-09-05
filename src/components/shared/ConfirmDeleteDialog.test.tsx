import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'

vi.mock('lucide-react', () => ({ Trash2: () => null, ArrowRight: () => null }))

function makeWs(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
      softwareSystems: [{ id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {}, containers: [] }],
      relationships: [{ id: 'rel1', sourceId: 'alice', destinationId: 'api', description: 'uses', tags: ['Relationship'], properties: {} }],
      groups: [],
      deploymentEnvironments: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      dynamicViews: [],
      deploymentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

describe('ConfirmDeleteDialog', () => {
  let onConfirm: ReturnType<typeof vi.fn>
  let onCancel: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onConfirm = vi.fn()
    onCancel = vi.fn()
    useWorkspaceStore.getState().closeWorkspace()
  })

  it('renders with the message text visible', () => {
    render(
      <ConfirmDeleteDialog
        message="Are you sure you want to delete this element?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    expect(screen.getByText('Are you sure you want to delete this element?')).toBeTruthy()
  })

  it('renders "Confirm delete" heading', () => {
    render(
      <ConfirmDeleteDialog
        message="Delete this view?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    expect(screen.getByText('Confirm delete')).toBeTruthy()
  })

  it('clicking "Delete" button calls onConfirm', () => {
    render(
      <ConfirmDeleteDialog
        message="Delete?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    fireEvent.click(screen.getByText('Delete'))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('clicking "Cancel" button calls onCancel', () => {
    render(
      <ConfirmDeleteDialog
        message="Delete?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('clicking the backdrop (fixed overlay) calls onCancel', () => {
    const { container } = render(
      <ConfirmDeleteDialog
        message="Delete?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    // The backdrop is the first div with fixed inset-0 style
    const backdrop = container.firstChild as HTMLElement
    fireEvent.click(backdrop)
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('pressing Escape calls onCancel', () => {
    render(
      <ConfirmDeleteDialog
        message="Delete?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('pressing Enter calls onConfirm', () => {
    render(
      <ConfirmDeleteDialog
        message="Delete?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('"Delete" button is focused on mount', () => {
    render(
      <ConfirmDeleteDialog
        message="Delete?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    const deleteBtn = screen.getByText('Delete')
    expect(document.activeElement).toBe(deleteBtn)
  })

  it('clicking the dialog panel itself does not call onCancel', () => {
    render(
      <ConfirmDeleteDialog
        message="Delete?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('dialog has aria-modal="true"', () => {
    render(
      <ConfirmDeleteDialog
        message="Delete?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('renders both Cancel and Delete buttons', () => {
    render(
      <ConfirmDeleteDialog
        message="Delete?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    expect(screen.getByText('Cancel')).toBeTruthy()
    expect(screen.getByText('Delete')).toBeTruthy()
  })

  it('does not call onConfirm when Cancel is clicked', () => {
    render(
      <ConfirmDeleteDialog
        message="Delete?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('does not call onCancel when Delete is clicked', () => {
    render(
      <ConfirmDeleteDialog
        message="Delete?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    fireEvent.click(screen.getByText('Delete'))
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('other keys do not trigger callbacks', () => {
    render(
      <ConfirmDeleteDialog
        message="Delete?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    fireEvent.keyDown(window, { key: 'Tab' })
    fireEvent.keyDown(window, { key: 'a' })
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('renders a structured impact list when impact prop is present', () => {
    render(
      <ConfirmDeleteDialog
        message='Delete "Payments API" from the model?'
        impact={{
          elementCount: 1, elementNames: ['Payments API'],
          descendantContainers: 4, descendantComponents: 11,
          relationships: 7, scopedViews: 2,
        }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByRole('list', { name: /cascade impact/i })).toBeTruthy()
    expect(screen.getByText(/4 containers/)).toBeTruthy()
    expect(screen.getByText(/11 components/)).toBeTruthy()
    expect(screen.getByText(/7 relationships/)).toBeTruthy()
    expect(screen.getByText(/2 dependent views/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /delete from model/i })).toBeTruthy()
  })

  it('shows "Delete" label when impact prop is absent', () => {
    render(<ConfirmDeleteDialog message='Delete this view "Foo"?' onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeTruthy()
    expect(screen.queryByRole('list', { name: /cascade impact/i })).toBeNull()
  })

  it('renders the full removal-impact report inline when targetIds are provided', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(
      <ConfirmDeleteDialog
        message='Delete "API" from the model?'
        impact={{
          elementCount: 1, elementNames: ['API'],
          descendantContainers: 0, descendantComponents: 0,
          relationships: 1, scopedViews: 0,
        }}
        targetIds={['api']}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    // The full report replaces the compact bullet list.
    expect(screen.queryByRole('list', { name: /cascade impact/i })).toBeNull()
    expect(screen.getByRole('region', { name: /goes away/i })).toBeTruthy()
    expect(screen.getAllByText('API').length).toBeGreaterThan(0)
    // Alice depends on the deleted system: she breaks and loses her only link.
    expect(screen.getByRole('region', { name: /breaks now/i })).toBeTruthy()
    expect(screen.getByRole('region', { name: /relationships removed/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /delete from model/i })).toBeTruthy()
  })

  it('falls back to the compact dialog when no workspace is open', () => {
    render(
      <ConfirmDeleteDialog
        message="Delete workspace file?"
        targetIds={['ghost']}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    expect(screen.queryByRole('region', { name: /goes away/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeTruthy()
  })

  it('keeps "Delete" label when impact has all zero counts', () => {
    render(
      <ConfirmDeleteDialog
        message='Delete "Lonely" from the model?'
        impact={{
          elementCount: 1, elementNames: ['Lonely'],
          descendantContainers: 0, descendantComponents: 0,
          relationships: 0, scopedViews: 0,
        }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeTruthy()
    expect(screen.queryByRole('list', { name: /cascade impact/i })).toBeNull()
  })
})
