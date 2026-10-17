/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceStore } from '@/store/workspace'
import { parseDSL } from '@/lib/dsl'
import { saveDSLFile } from '@/lib/fileIO'
import { isWorkspaceLinked, writeLinkedWorkspace } from '@/lib/workspaceSave'
import { announce } from '@/lib/announce'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'

vi.mock('@xyflow/react', () => ({ useReactFlow: () => { throw new Error('not in flow') } }))
vi.mock('@/lib/fileIO', () => ({ saveDSLFile: vi.fn(async () => true), openDSLFile: vi.fn() }))
vi.mock('@/lib/workspaceSave', () => ({
  resetIncludedSaveHistory: vi.fn(),
  isWorkspaceLinked: vi.fn(() => false),
  writeLinkedWorkspace: vi.fn(async () => true),
}))
vi.mock('@/lib/announce', () => ({ announce: vi.fn() }))

function loadWorkspace() {
  useWorkspaceStore.getState().loadWorkspace(parseDSL('workspace "Shortcut" { model { p = person "Person" } }').workspace)
  useWorkspaceStore.getState().updateWorkspaceMeta({ description: 'Unsaved edit' })
}

async function saveShortcut() {
  await act(async () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isWorkspaceLinked).mockReturnValue(false)
  vi.mocked(saveDSLFile).mockResolvedValue(true)
  vi.mocked(writeLinkedWorkspace).mockResolvedValue(true)
  loadWorkspace()
})

describe('Ctrl+S persistence', () => {
  it.each([true, false])('waits for the complete DSL/layout result before marking the snapshot saved (%s)', async (success) => {
    let complete!: (ok: boolean) => void
    vi.mocked(saveDSLFile).mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    renderHook(() => useKeyboardShortcuts())
    await saveShortcut()
    expect(saveDSLFile).toHaveBeenCalledOnce()
    expect(JSON.parse(vi.mocked(saveDSLFile).mock.calls[0][2]!)).toEqual({ version: 1, views: {} })
    expect(useWorkspaceStore.getState().lastSavedUndoLength).toBe(0)
    await act(async () => { complete(success); await Promise.resolve() })
    expect(useWorkspaceStore.getState().lastSavedUndoLength).toBe(success ? 1 : 0)
    expect(useWorkspaceStore.getState().fileSaveFailed).toBe(!success)
    if (!success) expect(announce).toHaveBeenCalledWith('Save failed')
  })

  it('includes unlinked layout in the same save request and marks only the saved snapshot', async () => {
    renderHook(() => useKeyboardShortcuts())
    await saveShortcut()
    expect(saveDSLFile).toHaveBeenCalledWith(expect.stringContaining('Unsaved edit'), 'Shortcut.dsl', expect.any(String))
    expect(writeLinkedWorkspace).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().lastSavedUndoLength).toBe(1)
  })

  it('announces a linked save failure and leaves edits unsaved', async () => {
    vi.mocked(isWorkspaceLinked).mockReturnValue(true)
    vi.mocked(writeLinkedWorkspace).mockResolvedValueOnce(false)
    renderHook(() => useKeyboardShortcuts())
    await saveShortcut()
    expect(announce).toHaveBeenCalledWith('Save failed')
    expect(useWorkspaceStore.getState().lastSavedUndoLength).toBe(0)
  })

  it('ignores completion when another edit was made during the write', async () => {
    vi.mocked(isWorkspaceLinked).mockReturnValue(true)
    let complete!: (ok: boolean) => void
    vi.mocked(writeLinkedWorkspace).mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    renderHook(() => useKeyboardShortcuts())
    await saveShortcut()
    act(() => { useWorkspaceStore.getState().updateWorkspaceMeta({ description: 'Newer edit' }) })
    await act(async () => { complete(true); await Promise.resolve() })
    expect(useWorkspaceStore.getState().lastSavedUndoLength).toBe(0)
    expect(useWorkspaceStore.getState().undoStack.length).toBe(2)
  })
})
