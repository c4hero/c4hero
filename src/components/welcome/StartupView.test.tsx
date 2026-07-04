import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StartupView from './StartupView'

vi.mock('lucide-react', () => ({
  FolderOpen: () => null,
  FileText: () => null,
  Plus: () => null,
  ChevronRight: () => null,
  X: () => null,
  MoreHorizontal: () => null,
}))

const hasFolderAccessMock = vi.hoisted(() => vi.fn(() => true))
vi.mock('@/lib/folderIO', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/folderIO')>()
  return { ...mod, hasFolderAccess: hasFolderAccessMock }
})

type Callbacks = {
  onCreateCollection: ReturnType<typeof vi.fn>
  onOpenCollection: ReturnType<typeof vi.fn>
  onOpenRecent: ReturnType<typeof vi.fn>
  onRemoveRecent: ReturnType<typeof vi.fn>
  onOpenFile: ReturnType<typeof vi.fn>
}

function makeCallbacks(): Callbacks {
  return {
    onCreateCollection: vi.fn(),
    onOpenCollection: vi.fn(),
    onOpenRecent: vi.fn(),
    onRemoveRecent: vi.fn(),
    onOpenFile: vi.fn(),
  }
}

function renderView(recentFolders: { name: string; path: string; displayName?: string }[], cb = makeCallbacks()) {
  render(<StartupView {...cb} recentFolders={recentFolders} />)
  return cb
}

beforeEach(() => {
  localStorage.clear()
  hasFolderAccessMock.mockReturnValue(true)
})

describe('StartupView', () => {
  describe('with no recent folders (hero)', () => {
    it('shows the hero headline and collection CTAs when folder access is available', () => {
      const cb = renderView([])
      expect(screen.getByRole('heading', { name: /Diagram your architecture/ })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: /New collection/ }))
      expect(cb.onCreateCollection).toHaveBeenCalledOnce()
      fireEvent.click(screen.getByRole('button', { name: /Open collection/ }))
      expect(cb.onOpenCollection).toHaveBeenCalledOnce()
    })

    it('falls back to the .dsl file flow when folder access is unavailable', () => {
      hasFolderAccessMock.mockReturnValue(false)
      const cb = renderView([])
      expect(screen.getByText(/Folder collections require a Chromium-based browser/)).toBeTruthy()
      expect(screen.queryByRole('button', { name: /New collection/ })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /Open \.dsl file/ }))
      expect(cb.onOpenFile).toHaveBeenCalledOnce()
    })
  })

  describe('with recent folders', () => {
    const recents = [
      { name: 'acme-arch', path: 'acme-arch', displayName: 'Acme Architecture' },
      { name: 'side-project', path: 'side-project' },
    ]

    it('shows the welcome-back header with a collection count', () => {
      renderView(recents)
      expect(screen.getByRole('heading', { name: /Welcome back/ })).toBeTruthy()
      expect(screen.getByText('2 collections')).toBeTruthy()
    })

    it('uses the singular count label for one collection', () => {
      renderView([recents[0]])
      expect(screen.getByText('1 collection')).toBeTruthy()
    })

    it('renders each recent row with display name and slug', () => {
      renderView(recents)
      expect(screen.getByText('Acme Architecture')).toBeTruthy()
      expect(screen.getByText('acme-arch')).toBeTruthy()
      // Falls back to slug as label when no display name
      expect(screen.getAllByText('side-project').length).toBeGreaterThan(0)
    })

    it('caps the visible list at six recents', () => {
      const many = Array.from({ length: 8 }, (_, i) => ({
        name: `folder-${i}`,
        path: `folder-${i}`,
      }))
      renderView(many)
      expect(screen.getByText('8 collections')).toBeTruthy()
      expect(screen.queryAllByText('folder-5').length).toBeGreaterThan(0)
      expect(screen.queryAllByText('folder-6')).toHaveLength(0)
      expect(screen.queryAllByText('folder-7')).toHaveLength(0)
    })

    it('opens a recent collection on row click', () => {
      const cb = renderView(recents)
      fireEvent.click(screen.getByText('Acme Architecture'))
      expect(cb.onOpenRecent).toHaveBeenCalledWith('acme-arch')
    })

    it('opens a recent collection with Enter and Space keys', () => {
      const cb = renderView(recents)
      const row = screen.getByText('Acme Architecture').closest('[role="button"]')!
      fireEvent.keyDown(row, { key: 'Enter' })
      fireEvent.keyDown(row, { key: ' ' })
      expect(cb.onOpenRecent).toHaveBeenCalledTimes(2)
      expect(cb.onOpenRecent).toHaveBeenCalledWith('acme-arch')
    })

    it('removes a recent via the row overflow menu without opening it', () => {
      const cb = renderView(recents)
      fireEvent.click(screen.getByRole('button', { name: 'More actions for Acme Architecture' }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Remove from recents/ }))
      expect(cb.onRemoveRecent).toHaveBeenCalledWith('acme-arch')
      expect(cb.onOpenRecent).not.toHaveBeenCalled()
    })

    it('still offers collection CTAs in the header', () => {
      const cb = renderView(recents)
      fireEvent.click(screen.getByRole('button', { name: /New collection/ }))
      expect(cb.onCreateCollection).toHaveBeenCalledOnce()
    })

    it('offers the .dsl fallback CTA when folder access is unavailable', () => {
      hasFolderAccessMock.mockReturnValue(false)
      const cb = renderView(recents)
      fireEvent.click(screen.getByRole('button', { name: /Open \.dsl file/ }))
      expect(cb.onOpenFile).toHaveBeenCalledOnce()
    })
  })
})
