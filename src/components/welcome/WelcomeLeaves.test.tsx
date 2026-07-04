import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DensityGlyph, WorkspaceTile, RecentRow, StartupActionCard, SectionDivider } from './WelcomeLeaves'

vi.mock('lucide-react', () => ({
  FolderOpen: () => null,
  Pencil: () => null,
  X: () => null,
  Building2: () => null,
  Network: () => null,
  Box: () => null,
  Zap: () => null,
  Trash2: () => null,
}))

beforeEach(() => {
  localStorage.clear()
})

describe('DensityGlyph', () => {
  function rects(elementCount: number, scope?: string) {
    const { container } = render(<DensityGlyph scope={scope} elementCount={elementCount} />)
    return container.querySelectorAll('rect')
  }

  it('renders a single dashed placeholder for an empty workspace', () => {
    const r = rects(0)
    expect(r).toHaveLength(1)
    expect(r[0].getAttribute('stroke-dasharray')).toBe('2 2')
  })

  it('renders one node per element for small workspaces', () => {
    expect(rects(3)).toHaveLength(3)
    expect(rects(5)).toHaveLength(5)
  })

  it('buckets node counts for medium and large workspaces', () => {
    expect(rects(10)).toHaveLength(8)
    expect(rects(30)).toHaveLength(12)
    expect(rects(100)).toHaveLength(16)
  })

  it('adds a boundary frame for software-system scope', () => {
    // frame + 3 nodes
    expect(rects(3, 'softwaresystem')).toHaveLength(4)
    // frame + placeholder
    expect(rects(0, 'softwaresystem')).toHaveLength(2)
  })

  it('renders no frame for landscape scope', () => {
    expect(rects(3, 'landscape')).toHaveLength(3)
  })
})

describe('WorkspaceTile', () => {
  let onClick: ReturnType<typeof vi.fn>
  let onRename: ReturnType<typeof vi.fn>
  let onDelete: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onClick = vi.fn()
    onRename = vi.fn()
    onDelete = vi.fn()
  })

  it('shows the label, scope type, and element/view counts', () => {
    render(
      <WorkspaceTile label="payments" scope="softwaresystem" elementCount={4} viewCount={2} onClick={onClick} />
    )
    expect(screen.getByText('payments')).toBeTruthy()
    expect(screen.getByText('System')).toBeTruthy()
    expect(screen.getByText('4 elements · 2v')).toBeTruthy()
  })

  it('shows "Empty" for a workspace without elements and no type for unscoped', () => {
    render(<WorkspaceTile label="blank" elementCount={0} viewCount={0} onClick={onClick} />)
    expect(screen.getByText('Empty')).toBeTruthy()
    expect(screen.queryByText('System')).toBeNull()
    expect(screen.queryByText('Landscape')).toBeNull()
  })

  it('uses the singular element label', () => {
    render(<WorkspaceTile label="tiny" elementCount={1} viewCount={1} onClick={onClick} />)
    expect(screen.getByText('1 element · 1v')).toBeTruthy()
  })

  it('fires onClick on click and via keyboard', () => {
    render(<WorkspaceTile label="payments" elementCount={1} viewCount={1} onClick={onClick} />)
    const tile = screen.getByText('payments').closest('[role="button"]')!
    fireEvent.click(tile)
    fireEvent.keyDown(tile, { key: 'Enter' })
    fireEvent.keyDown(tile, { key: ' ' })
    expect(onClick).toHaveBeenCalledTimes(3)
  })

  it('hides the edit button unless both onRename and onDelete are provided', () => {
    render(<WorkspaceTile label="payments" elementCount={1} viewCount={1} onClick={onClick} onRename={onRename} />)
    expect(screen.queryByRole('button', { name: 'Edit workspace' })).toBeNull()
  })

  it('opens the edit dialog from the pencil without triggering onClick', () => {
    render(
      <WorkspaceTile label="payments" elementCount={1} viewCount={1} onClick={onClick} onRename={onRename} onDelete={onDelete} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit workspace' }))
    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByText('Edit Workspace')).toBeTruthy()
  })

  it('renames through the edit dialog and closes it', () => {
    render(
      <WorkspaceTile label="payments" elementCount={1} viewCount={1} onClick={onClick} onRename={onRename} onDelete={onDelete} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit workspace' }))
    fireEvent.change(screen.getByDisplayValue('payments'), { target: { value: 'billing' } })
    fireEvent.click(screen.getByText('Save'))
    expect(onRename).toHaveBeenCalledWith('billing')
    expect(screen.queryByText('Edit Workspace')).toBeNull()
  })

  it('deletes through the edit dialog and closes it', () => {
    render(
      <WorkspaceTile label="payments" elementCount={1} viewCount={1} onClick={onClick} onRename={onRename} onDelete={onDelete} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit workspace' }))
    fireEvent.click(screen.getByText('Delete workspace'))
    expect(onDelete).toHaveBeenCalledOnce()
    expect(screen.queryByText('Edit Workspace')).toBeNull()
  })

  it('closes the edit dialog via Cancel without side effects', () => {
    render(
      <WorkspaceTile label="payments" elementCount={1} viewCount={1} onClick={onClick} onRename={onRename} onDelete={onDelete} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit workspace' }))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Edit Workspace')).toBeNull()
    expect(onRename).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })
})

describe('RecentRow', () => {
  let onClick: ReturnType<typeof vi.fn>
  let onRemove: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onClick = vi.fn()
    onRemove = vi.fn()
  })

  it('shows the display name plus slug when they differ', () => {
    render(
      <RecentRow name="acme-arch" displayName="Acme Architecture" path="acme-arch" onClick={onClick} onRemove={onRemove} />
    )
    expect(screen.getByText('Acme Architecture')).toBeTruthy()
    expect(screen.getByText('acme-arch')).toBeTruthy()
  })

  it('falls back to the folder name without a duplicate slug', () => {
    render(<RecentRow name="acme-arch" path="acme-arch" onClick={onClick} onRemove={onRemove} />)
    expect(screen.getAllByText('acme-arch')).toHaveLength(1)
  })

  it('opens on click and keyboard', () => {
    render(<RecentRow name="acme-arch" path="acme-arch" onClick={onClick} onRemove={onRemove} />)
    const row = screen.getByText('acme-arch').closest('[role="button"]')!
    fireEvent.click(row)
    fireEvent.keyDown(row, { key: 'Enter' })
    fireEvent.keyDown(row, { key: ' ' })
    expect(onClick).toHaveBeenCalledTimes(3)
  })

  it('removes from recents without opening the row', () => {
    render(
      <RecentRow name="acme-arch" displayName="Acme" path="acme-arch" onClick={onClick} onRemove={onRemove} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove Acme from recents' }))
    expect(onRemove).toHaveBeenCalledOnce()
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('StartupActionCard', () => {
  it('renders icon, label, and description, and handles clicks', () => {
    const onClick = vi.fn()
    render(
      <StartupActionCard
        icon={<span data-testid="icon" />}
        label="New collection"
        description="Create a folder of workspaces"
        onClick={onClick}
      />
    )
    expect(screen.getByTestId('icon')).toBeTruthy()
    expect(screen.getByText('Create a folder of workspaces')).toBeTruthy()
    fireEvent.click(screen.getByText('New collection'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('SectionDivider', () => {
  it('renders its label', () => {
    render(<SectionDivider label="Recent" />)
    expect(screen.getByText('Recent')).toBeTruthy()
  })

  it('renders muted variant', () => {
    render(<SectionDivider label="Older" muted />)
    expect(screen.getByText('Older')).toBeTruthy()
  })
})
