import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'

vi.mock('@/lib/workspaceSave', () => ({
  isWorkspaceLinked: vi.fn(() => false),
  writeLinkedWorkspace: vi.fn(async () => true),
}))
vi.mock('@/lib/fileIO', () => ({ saveToLocalStorage: vi.fn() }))

import { isWorkspaceLinked, writeLinkedWorkspace } from '@/lib/workspaceSave'
import { useWorkspaceStore } from '@/store/workspace'
import { parseDSL } from '@/lib/dsl'
import { useAutoSave } from './useAutoSave'

function Harness() { useAutoSave(); return null }

async function settle() {
  // debounce (1s) then the idle callback (setTimeout fallback, 50ms), then the write's promise
  await act(async () => { vi.advanceTimersByTime(1100); await Promise.resolve(); await Promise.resolve() })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.mocked(isWorkspaceLinked).mockReturnValue(false)
  vi.mocked(writeLinkedWorkspace).mockResolvedValue(true)
  useWorkspaceStore.getState().closeWorkspace()
})

afterEach(() => vi.useRealTimers())

describe('useAutoSave', () => {
  it('leaves an unlinked workspace marked unsaved (the disk watcher relies on it — TEA-339)', async () => {
    render(<Harness />)
    act(() => { useWorkspaceStore.getState().loadWorkspace(parseDSL('workspace "W" { model { u = person "U" } }').workspace) })
    act(() => { useWorkspaceStore.getState().updateWorkspaceMeta({ name: 'Renamed' }) })
    await settle()
    expect(writeLinkedWorkspace).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().lastSavedUndoLength).toBe(0)
  })

  it('writes a linked workspace and records the saved undo length only once the write succeeds', async () => {
    vi.mocked(isWorkspaceLinked).mockReturnValue(true)
    render(<Harness />)
    act(() => { useWorkspaceStore.getState().loadWorkspace(parseDSL('workspace "W" { model { u = person "U" } }').workspace) })
    act(() => { useWorkspaceStore.getState().setActiveWorkspaceFilename('w.dsl') })
    act(() => { useWorkspaceStore.getState().updateWorkspaceMeta({ name: 'Renamed' }) })
    await settle()
    expect(writeLinkedWorkspace).toHaveBeenCalled()
    expect(vi.mocked(writeLinkedWorkspace).mock.calls.at(-1)![1]).toBe('w.dsl')
    expect(useWorkspaceStore.getState().lastSavedUndoLength).toBe(useWorkspaceStore.getState().undoStack.length)
  })

  it('keeps the workspace dirty when the linked write fails', async () => {
    vi.mocked(isWorkspaceLinked).mockReturnValue(true)
    vi.mocked(writeLinkedWorkspace).mockResolvedValue(false)
    render(<Harness />)
    act(() => { useWorkspaceStore.getState().loadWorkspace(parseDSL('workspace "W" { model { u = person "U" } }').workspace) })
    act(() => { useWorkspaceStore.getState().updateWorkspaceMeta({ name: 'Renamed' }) })
    await settle()
    expect(writeLinkedWorkspace).toHaveBeenCalled()
    expect(useWorkspaceStore.getState().lastSavedUndoLength).toBe(0)
  })
})
