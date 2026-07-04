import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  TemplateDialog,
  WorkspaceEditDialog,
  DuplicateCollectionDialog,
  NewCollectionDialog,
} from './WelcomeDialogs'

vi.mock('lucide-react', () => ({
  Building2: () => null,
  Network: () => null,
  Box: () => null,
  Zap: () => null,
  Trash2: () => null,
  X: () => null,
}))

beforeEach(() => {
  localStorage.clear()
})

describe('TemplateDialog', () => {
  let onSelect: ReturnType<typeof vi.fn>
  let onClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onSelect = vi.fn()
    onClose = vi.fn()
  })

  function renderDialog() {
    return render(<TemplateDialog onSelect={onSelect} onClose={onClose} />)
  }

  it('renders all four template cards with taglines', () => {
    renderDialog()
    expect(screen.getByText('Big Bank')).toBeTruthy()
    expect(screen.getByText('Microservices')).toBeTruthy()
    expect(screen.getByText('Monolith')).toBeTruthy()
    expect(screen.getByText('Event-Driven')).toBeTruthy()
    expect(screen.getByText(/Enterprise landscape with customers/)).toBeTruthy()
  })

  it('shows a content summary for each template', () => {
    renderDialog()
    // Every summary starts with a scope label and lists counts
    const summaries = screen.getAllByText(/·.*system/i)
    expect(summaries.length).toBeGreaterThan(0)
  })

  it('selects a template workspace and passes its filename', () => {
    renderDialog()
    fireEvent.click(screen.getByText('Big Bank'))
    expect(onSelect).toHaveBeenCalledOnce()
    const [ws, name] = onSelect.mock.calls[0]
    expect(name).toBe('big-bank.dsl')
    expect(ws.model.softwareSystems.length).toBeGreaterThan(0)
  })

  it('selects the microservices template', () => {
    renderDialog()
    fireEvent.click(screen.getByText('Microservices'))
    expect(onSelect.mock.calls[0][1]).toBe('microservices.dsl')
  })

  it('closes via the close button', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes when the backdrop is clicked but not the panel', () => {
    const { container } = renderDialog()
    fireEvent.click(screen.getByText('Start from a template'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(container.firstChild as HTMLElement)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes on Escape', () => {
    renderDialog()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('tracks hover state on cards without selecting', () => {
    renderDialog()
    const card = screen.getByText('Monolith').closest('button')!
    fireEvent.mouseEnter(card)
    fireEvent.mouseLeave(card)
    fireEvent.focus(card)
    fireEvent.blur(card)
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('WorkspaceEditDialog', () => {
  let onRename: ReturnType<typeof vi.fn>
  let onDelete: ReturnType<typeof vi.fn>
  let onClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onRename = vi.fn()
    onDelete = vi.fn()
    onClose = vi.fn()
  })

  function renderDialog(name = 'payments api') {
    return render(
      <WorkspaceEditDialog name={name} onRename={onRename} onDelete={onDelete} onClose={onClose} />
    )
  }

  it('prefills the current name and hides Save until dirty', () => {
    renderDialog()
    expect(screen.getByDisplayValue('payments api')).toBeTruthy()
    expect(screen.queryByText('Save')).toBeNull()
  })

  it('shows the resulting filename and Save button once the name changes', () => {
    renderDialog()
    fireEvent.change(screen.getByDisplayValue('payments api'), { target: { value: 'Billing Service' } })
    expect(screen.getByText('File: billing-service.dsl')).toBeTruthy()
    expect(screen.getByText('Save')).toBeTruthy()
  })

  it('saves the trimmed name and closes', () => {
    renderDialog()
    fireEvent.change(screen.getByDisplayValue('payments api'), { target: { value: '  billing  ' } })
    fireEvent.click(screen.getByText('Save'))
    expect(onRename).toHaveBeenCalledWith('billing')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('saves on Enter when dirty', () => {
    renderDialog()
    const input = screen.getByDisplayValue('payments api')
    fireEvent.change(input, { target: { value: 'billing' } })
    fireEvent.keyDown(input, { target: { value: 'billing' }, key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('billing')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Enter without changes closes without renaming', () => {
    renderDialog()
    fireEvent.keyDown(screen.getByDisplayValue('payments api'), { key: 'Enter' })
    expect(onRename).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('invokes onDelete from the danger zone', () => {
    renderDialog()
    fireEvent.click(screen.getByText('Delete workspace'))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('closes via Cancel', () => {
    renderDialog()
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes when both mousedown and click land on the backdrop', () => {
    const { container } = renderDialog()
    const backdrop = container.firstChild as HTMLElement
    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not close when the drag started inside the panel', () => {
    const { container } = renderDialog()
    const backdrop = container.firstChild as HTMLElement
    fireEvent.mouseDown(screen.getByDisplayValue('payments api'))
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('DuplicateCollectionDialog', () => {
  let onOpen: ReturnType<typeof vi.fn>
  let onRename: ReturnType<typeof vi.fn>
  let onCancel: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onOpen = vi.fn()
    onRename = vi.fn()
    onCancel = vi.fn()
  })

  function renderDialog() {
    return render(
      <DuplicateCollectionDialog slug="my-arch" onOpen={onOpen} onRename={onRename} onCancel={onCancel} />
    )
  }

  it('names the conflicting folder slug', () => {
    renderDialog()
    expect(screen.getByText('Folder already exists')).toBeTruthy()
    expect(screen.getByText('my-arch')).toBeTruthy()
  })

  it('opens the existing collection', () => {
    renderDialog()
    fireEvent.click(screen.getByText('Open existing collection'))
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onRename).not.toHaveBeenCalled()
  })

  it('goes back to pick a different name', () => {
    renderDialog()
    fireEvent.click(screen.getByText('Choose a different name'))
    expect(onRename).toHaveBeenCalledOnce()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('cancels via the Cancel button and the backdrop', () => {
    const { container } = renderDialog()
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
    fireEvent.click(container.firstChild as HTMLElement)
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('does not cancel when clicking inside the panel', () => {
    renderDialog()
    fireEvent.click(screen.getByText('Folder already exists'))
    expect(onCancel).not.toHaveBeenCalled()
  })
})

describe('NewCollectionDialog', () => {
  let onConfirm: ReturnType<typeof vi.fn>
  let onCancel: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onConfirm = vi.fn()
    onCancel = vi.fn()
  })

  // The dialog is controlled — wrap it in local state so typing works.
  function Harness({ initial = 'My Architecture', ...rest }: { initial?: string } & Partial<Parameters<typeof NewCollectionDialog>[0]>) {
    const [value, setValue] = useState(initial)
    return (
      <NewCollectionDialog
        value={value}
        onChange={setValue}
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...rest}
      />
    )
  }

  it('renders default title, description, and slug preview', () => {
    render(<Harness />)
    expect(screen.getByText('New collection')).toBeTruthy()
    expect(screen.getByText(/Choose a friendly name/)).toBeTruthy()
    expect(screen.getByText('my-architecture')).toBeTruthy()
    expect(screen.getByText('Choose location →')).toBeTruthy()
  })

  it('updates the slug preview as the name changes', () => {
    render(<Harness />)
    fireEvent.change(screen.getByDisplayValue('My Architecture'), { target: { value: 'Acme Payments!' } })
    expect(screen.getByText('acme-payments')).toBeTruthy()
  })

  it('disables confirm and shows placeholder slug when the name is empty', () => {
    render(<Harness initial="" />)
    expect(screen.getByText('collection')).toBeTruthy()
    const confirm = screen.getByText('Choose location →') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirms via the button and via Enter', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Choose location →'))
    expect(onConfirm).toHaveBeenCalledOnce()
    fireEvent.keyDown(screen.getByDisplayValue('My Architecture'), { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledTimes(2)
  })

  it('does not confirm on Enter when the name is empty', () => {
    render(<Harness initial="  " />)
    fireEvent.keyDown(screen.getByPlaceholderText('My Architecture'), { key: 'Enter' })
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('cancels on Escape, backdrop click, and Cancel button', () => {
    const { container } = render(<Harness />)
    fireEvent.keyDown(screen.getByDisplayValue('My Architecture'), { key: 'Escape' })
    fireEvent.click(container.firstChild as HTMLElement)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(3)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('supports custom title, description, confirm label, and hidden slug', () => {
    render(
      <Harness
        initial="Renamed"
        title="Rename collection"
        description="Update the display name."
        confirmLabel="Save"
        showSlug={false}
      />
    )
    expect(screen.getByText('Rename collection')).toBeTruthy()
    expect(screen.getByText('Update the display name.')).toBeTruthy()
    expect(screen.getByText('Save')).toBeTruthy()
    expect(screen.queryByText('Folder:')).toBeNull()
  })
})
