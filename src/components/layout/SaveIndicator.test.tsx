import { render, fireEvent, act, waitFor } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import { saveDSLFile, getCurrentFileHandle, hasFileSystemAccess, writeToCurrentHandle } from '@/lib/fileIO'
import { getCurrentDirHandle, writeDSLFile } from '@/lib/folderIO'
import type { Workspace } from '@/types/model'
import SaveIndicator from './SaveIndicator'

vi.mock('@/lib/fileIO', () => ({
  saveDSLFile: vi.fn(async () => true),
  getCurrentFileHandle: vi.fn(() => null),
  hasFileSystemAccess: vi.fn(() => false),
  writeToCurrentHandle: vi.fn(async () => true),
  writeSidecarToHandle: vi.fn(async () => true),
}))

vi.mock('@/lib/folderIO', () => ({
  getCurrentDirHandle: vi.fn(() => null),
  writeDSLFile: vi.fn(async () => true),
  writeSidecarFile: vi.fn(async () => true),
  writeDSLFileAt: vi.fn(async () => true),
}))

function makeWs(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
      softwareSystems: [],
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

function indicatorButton(container: HTMLElement): HTMLButtonElement {
  const btn = container.querySelector('button')
  expect(btn).not.toBeNull()
  return btn as HTMLButtonElement
}

/** Push one undo entry so the workspace counts as dirty. */
function makeDirty() {
  act(() => {
    useWorkspaceStore.getState().addGroup('Dirty Group', ['alice'])
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useWorkspaceStore.getState().closeWorkspace()
  vi.mocked(saveDSLFile).mockResolvedValue(true)
  vi.mocked(getCurrentFileHandle).mockReturnValue(null)
  vi.mocked(hasFileSystemAccess).mockReturnValue(false)
  vi.mocked(getCurrentDirHandle).mockReturnValue(null)
})

describe('SaveIndicator', () => {
  it('renders download mode (floppy icon) when the File System Access API is unavailable', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    const { container } = render(<SaveIndicator />)
    const btn = indicatorButton(container)
    expect(btn.getAttribute('aria-label')).toBe('Click to download .dsl')
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('pulses with a "No file linked" tooltip when FS access exists but nothing is linked', () => {
    vi.mocked(hasFileSystemAccess).mockReturnValue(true)
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    const { container } = render(<SaveIndicator />)
    const btn = indicatorButton(container)
    expect(btn.className).toContain('save-indicator-pulse')
    expect(btn.getAttribute('aria-label')).toBe('No file linked — click to save to a .dsl file')
    // Dot mode, not icon mode
    expect(container.querySelector('svg')).toBeNull()
  })

  it('shows "All changes saved" when linked via a file handle and clean', () => {
    vi.mocked(hasFileSystemAccess).mockReturnValue(true)
    vi.mocked(getCurrentFileHandle).mockReturnValue({} as FileSystemFileHandle)
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    const { container } = render(<SaveIndicator />)
    expect(indicatorButton(container).getAttribute('aria-label')).toBe('All changes saved')
  })

  it('treats a folder handle plus active filename as linked (collection mode)', () => {
    vi.mocked(hasFileSystemAccess).mockReturnValue(true)
    vi.mocked(getCurrentDirHandle).mockReturnValue({} as FileSystemDirectoryHandle)
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().setActiveWorkspaceFilename('test.dsl')
    const { container } = render(<SaveIndicator />)
    expect(indicatorButton(container).getAttribute('aria-label')).toBe('All changes saved')
  })

  it('writes the collection file in place on click instead of prompting for a new one (TEA-339)', async () => {
    vi.mocked(hasFileSystemAccess).mockReturnValue(true)
    vi.mocked(getCurrentDirHandle).mockReturnValue({ name: 'my-architecture' } as unknown as FileSystemDirectoryHandle)
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().setActiveWorkspaceFilename('big-bank.dsl')
    const { container } = render(<SaveIndicator />)
    fireEvent.click(indicatorButton(container))
    await waitFor(() => expect(writeDSLFile).toHaveBeenCalledTimes(1))
    expect(vi.mocked(writeDSLFile).mock.calls[0][0]).toBe('big-bank.dsl')
    expect(saveDSLFile).not.toHaveBeenCalled()
    await waitFor(() => expect(indicatorButton(container).getAttribute('aria-label')).toBe('Saved to file'))
  })

  it('shows unsaved-changes state when linked and dirty', () => {
    vi.mocked(hasFileSystemAccess).mockReturnValue(true)
    vi.mocked(getCurrentFileHandle).mockReturnValue({} as FileSystemFileHandle)
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    const { container } = render(<SaveIndicator />)
    makeDirty()
    expect(indicatorButton(container).getAttribute('aria-label')).toBe('Unsaved changes — click to save')
  })

  it('does not attempt a save when no workspace is loaded', () => {
    const { container } = render(<SaveIndicator />)
    fireEvent.click(indicatorButton(container))
    expect(saveDSLFile).not.toHaveBeenCalled()
  })

  it('saves on click, flashes "Saved to file", records the saved undo length, then returns to idle', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(hasFileSystemAccess).mockReturnValue(true)
      vi.mocked(getCurrentFileHandle).mockReturnValue({} as FileSystemFileHandle)
      useWorkspaceStore.getState().loadWorkspace(makeWs())
      const { container } = render(<SaveIndicator />)
      makeDirty()

      fireEvent.click(indicatorButton(container))
      await act(async () => { await Promise.resolve(); await Promise.resolve() })

      // Linked to a file handle: written in place, never through the picker.
      expect(writeToCurrentHandle).toHaveBeenCalledTimes(1)
      expect(saveDSLFile).not.toHaveBeenCalled()
      expect(indicatorButton(container).getAttribute('aria-label')).toBe('Saved to file')
      expect(useWorkspaceStore.getState().lastSavedUndoLength).toBe(1)

      act(() => { vi.advanceTimersByTime(2000) })
      expect(indicatorButton(container).getAttribute('aria-label')).toBe('All changes saved')
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the error state when saving fails, then recovers after the flash timer', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(hasFileSystemAccess).mockReturnValue(true)
      vi.mocked(getCurrentFileHandle).mockReturnValue({} as FileSystemFileHandle)
      vi.mocked(writeToCurrentHandle).mockResolvedValue(false)
      useWorkspaceStore.getState().loadWorkspace(makeWs())
      const { container } = render(<SaveIndicator />)
      makeDirty()

      fireEvent.click(indicatorButton(container))
      await act(async () => { await Promise.resolve() })

      expect(indicatorButton(container).getAttribute('aria-label')).toBe('Save failed — click to retry')
      // Save failed, so the saved undo length must not advance
      expect(useWorkspaceStore.getState().lastSavedUndoLength).toBe(0)

      act(() => { vi.advanceTimersByTime(3000) })
      expect(indicatorButton(container).getAttribute('aria-label')).toBe('Unsaved changes — click to save')
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses download wording while saving and after saving when FS access is unavailable', async () => {
    let resolveSave: (ok: boolean) => void = () => {}
    vi.mocked(saveDSLFile).mockImplementation(
      () => new Promise<boolean>((resolve) => { resolveSave = resolve }),
    )
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    const { container } = render(<SaveIndicator />)

    fireEvent.click(indicatorButton(container))
    await waitFor(() => {
      expect(indicatorButton(container).getAttribute('aria-label')).toBe('Downloading…')
    })

    act(() => { resolveSave(true) })
    await waitFor(() => {
      expect(indicatorButton(container).getAttribute('aria-label')).toBe('Downloaded')
    })
  })
})
