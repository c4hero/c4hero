import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CollectionView from './CollectionView'
import type { FolderWorkspace } from './WelcomeLeaves'

vi.mock('lucide-react', () => ({
  FolderOpen: () => null,
  Plus: () => null,
  ChevronRight: () => null,
  Search: () => null,
  Pencil: () => null,
  Trash2: () => null,
  X: () => null,
  Boxes: () => null,
  MoreHorizontal: () => null,
  FileText: () => null,
  Building2: () => null,
  Network: () => null,
  Box: () => null,
  Zap: () => null,
}))

type Callbacks = ReturnType<typeof makeCallbacks>

function makeCallbacks() {
  return {
    onOpenWorkspace: vi.fn(),
    onRenameWorkspace: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onBlankWorkspace: vi.fn(),
    onImportDSL: vi.fn(),
    onTemplate: vi.fn(),
    onOpenCollection: vi.fn(),
    onCreateCollection: vi.fn(),
    onRenameCollection: vi.fn(),
    onOpenRecent: vi.fn(),
    onBack: vi.fn(),
  }
}

const dirHandle = { name: 'acme-arch' } as unknown as FileSystemDirectoryHandle

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const workspaces: FolderWorkspace[] = [
  { name: 'api-gateway.dsl', scope: 'softwaresystem', elementCount: 6, viewCount: 2, modifiedAt: Date.now() - 3 * HOUR },
  { name: 'big_picture.dsl', scope: 'landscape', elementCount: 12, viewCount: 3, modifiedAt: Date.now() - 2 * DAY },
  { name: 'scratch.dsl', modifiedAt: Date.now() - 60 * 1000 },
]

function renderView(overrides: Partial<Parameters<typeof CollectionView>[0]> = {}): Callbacks {
  const cb = makeCallbacks()
  render(
    <CollectionView
      dirHandle={dirHandle}
      workspaces={workspaces}
      recentFolders={[
        { name: 'acme-arch', path: 'acme-arch', displayName: 'Acme Architecture' },
        { name: 'side-project', path: 'side-project' },
        { name: 'legacy', path: 'legacy', displayName: 'Legacy Estate' },
      ]}
      {...cb}
      {...overrides}
    />
  )
  return cb
}

beforeEach(() => {
  localStorage.clear()
})

describe('CollectionView', () => {
  it('summarises the workspace count with the collection display name', () => {
    renderView()
    expect(screen.getByText(/3 workspaces in Acme Architecture/)).toBeTruthy()
  })

  it('uses the singular label for one workspace', () => {
    renderView({ workspaces: [workspaces[0]] })
    expect(screen.getByText(/1 workspace in Acme Architecture/)).toBeTruthy()
  })

  it('renders a row per workspace with humanised labels and stats', () => {
    renderView()
    expect(screen.getByText('api gateway')).toBeTruthy()
    expect(screen.getByText('big picture')).toBeTruthy()
    expect(screen.getByText('scratch')).toBeTruthy()
    expect(screen.getByText('System')).toBeTruthy()
    expect(screen.getByText('Landscape')).toBeTruthy()
    // Unscoped falls back to "Workspace"
    expect(screen.getByText('Workspace')).toBeTruthy()
    expect(screen.getByLabelText('6 elements and 2 views')).toBeTruthy()
  })

  it('shows relative modification times', () => {
    renderView()
    expect(screen.getByText('edited 3h ago')).toBeTruthy()
    expect(screen.getByText('edited 2d ago')).toBeTruthy()
    expect(screen.getByText('edited just now')).toBeTruthy()
  })

  it('shows "ready to edit" when a workspace has no modification time', () => {
    renderView({ workspaces: [{ name: 'fresh.dsl' }] })
    expect(screen.getByText('ready to edit')).toBeTruthy()
  })

  it('opens a workspace on row click and via keyboard', () => {
    const cb = renderView()
    const row = screen.getByText('api gateway').closest('[role="button"]')!
    fireEvent.click(row)
    fireEvent.keyDown(row, { key: 'Enter' })
    fireEvent.keyDown(row, { key: ' ' })
    expect(cb.onOpenWorkspace).toHaveBeenCalledTimes(3)
    expect(cb.onOpenWorkspace).toHaveBeenCalledWith('api-gateway.dsl')
  })

  it('filters rows by search query and clears again', () => {
    renderView()
    const input = screen.getByLabelText('Search workspaces')
    fireEvent.change(input, { target: { value: 'gateway' } })
    expect(screen.getByText('api gateway')).toBeTruthy()
    expect(screen.queryByText('big picture')).toBeNull()
    fireEvent.click(screen.getByLabelText('Clear search'))
    expect(screen.getByText('big picture')).toBeTruthy()
  })

  it('shows a no-results message for unmatched queries', () => {
    renderView()
    fireEvent.change(screen.getByLabelText('Search workspaces'), { target: { value: 'zzz' } })
    expect(screen.getByText(/No workspaces match “zzz”/)).toBeTruthy()
  })

  it('renders the empty state with all three CTAs when there are no workspaces', () => {
    const cb = renderView({ workspaces: [] })
    expect(screen.getByText(/This collection is empty/)).toBeTruthy()
    expect(screen.getByText('Map your first system.')).toBeTruthy()
    expect(screen.queryByLabelText('Search workspaces')).toBeNull()
    fireEvent.click(screen.getByText('Import .dsl file'))
    expect(cb.onImportDSL).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByText('Start from a template'))
    expect(cb.onTemplate).toHaveBeenCalledOnce()
    // Header CTA + empty-zone CTA both offer a new workspace
    const newButtons = screen.getAllByRole('button', { name: 'New Workspace' })
    expect(newButtons).toHaveLength(2)
    fireEvent.click(newButtons[1])
    expect(cb.onBlankWorkspace).toHaveBeenCalledOnce()
  })

  it('creates a new workspace from the header CTA', () => {
    const cb = renderView()
    fireEvent.click(screen.getByRole('button', { name: 'New Workspace' }))
    expect(cb.onBlankWorkspace).toHaveBeenCalledOnce()
  })

  it('hides the header new-workspace CTA without a directory handle', () => {
    renderView({ dirHandle: null })
    expect(screen.queryByRole('button', { name: 'New Workspace' })).toBeNull()
    // Falls back to the raw slug for the collection name
    expect(screen.getByText(/3 workspaces in collection/)).toBeTruthy()
  })

  it('navigates back to the start screen via the brand button', () => {
    const cb = renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Back to start' }))
    expect(cb.onBack).toHaveBeenCalledOnce()
  })

  it('lists other recent collections as pills that switch collections', () => {
    const cb = renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Legacy Estate' }))
    expect(cb.onOpenRecent).toHaveBeenCalledWith('legacy')
    fireEvent.click(screen.getByRole('button', { name: 'side-project' }))
    expect(cb.onOpenRecent).toHaveBeenCalledWith('side-project')
  })

  it('offers open and new collection pill actions', () => {
    const cb = renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Open collection' }))
    expect(cb.onOpenCollection).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'New collection' }))
    expect(cb.onCreateCollection).toHaveBeenCalledOnce()
  })

  it('renames the collection via the current pill menu', () => {
    const cb = renderView()
    fireEvent.click(screen.getByRole('button', { name: 'Collection actions for Acme Architecture' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename collection' }))
    expect(cb.onRenameCollection).toHaveBeenCalledOnce()
  })

  it('renames a workspace through the row menu and edit dialog', () => {
    const cb = renderView()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for api gateway' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    fireEvent.change(screen.getByDisplayValue('api gateway'), { target: { value: 'edge proxy' } })
    fireEvent.click(screen.getByText('Save'))
    expect(cb.onRenameWorkspace).toHaveBeenCalledWith('api-gateway.dsl', 'edge proxy')
    expect(screen.queryByText('Edit Workspace')).toBeNull()
    expect(cb.onOpenWorkspace).not.toHaveBeenCalled()
  })

  it('deletes a workspace directly from the row menu', () => {
    const cb = renderView()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for scratch' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(cb.onDeleteWorkspace).toHaveBeenCalledWith('scratch.dsl')
    expect(cb.onOpenWorkspace).not.toHaveBeenCalled()
  })

  it('deletes a workspace from the edit dialog danger zone', () => {
    const cb = renderView()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for scratch' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    fireEvent.click(screen.getByText('Delete workspace'))
    expect(cb.onDeleteWorkspace).toHaveBeenCalledWith('scratch.dsl')
    expect(screen.queryByText('Edit Workspace')).toBeNull()
  })

  it('closes the edit dialog without renaming', () => {
    const cb = renderView()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for api gateway' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Edit Workspace')).toBeNull()
    expect(cb.onRenameWorkspace).not.toHaveBeenCalled()
  })
})
