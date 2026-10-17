import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

const files = vi.hoisted(() => ({
  file: null as FileSystemFileHandle | null,
  sidecar: null as FileSystemFileHandle | null,
  read: vi.fn(),
}))
vi.mock('@/lib/fileIO', () => ({
  getCurrentFileHandle: () => files.file,
  getCurrentSidecarHandle: () => files.sidecar,
  readCurrentFile: files.read,
}))
vi.mock('@/lib/folderIO', () => ({
  getCurrentDirHandle: () => null,
  readDSLFileForWatch: vi.fn(),
  readDSLFileAt: vi.fn(),
}))

import { useWorkspaceStore } from '@/store/workspace'
import { parseDSL } from '@/lib/dsl'
import { useDiskWatch, DISK_WATCH_INTERVAL_MS } from './useDiskWatch'
import { captureSelfWrite, recordSelfDslWrite, isSelfWrite, resetSaveCoordinator, beginSelfWrite, isSelfWritePending } from '@/lib/saveCoordinator'
import { hashSnapshot } from '@/lib/fileWatch'
import { notifyHandleChanges } from '@/lib/handleChanges'

const dsl = (person: string) => `workspace "Same name" { model { u = person "${person}" } }`
function Harness() { useDiskWatch(); return null }
function load(person: string) {
  useWorkspaceStore.getState().loadWorkspace(parseDSL(dsl(person)).workspace)
}

beforeEach(() => {
  vi.useFakeTimers()
  files.file = { name: 'first.dsl' } as FileSystemFileHandle
  files.sidecar = null
  files.read.mockReset()
  files.read.mockResolvedValue({ content: dsl('Initial') })
  useWorkspaceStore.getState().closeWorkspace()
  useWorkspaceStore.setState({ watchDisk: true, fileSaveFailed: false })
  resetSaveCoordinator()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('disk watcher target lifetime', () => {
  it('starts watching a newly linked native file without a workspace change', async () => {
    files.file = null
    load('Initial')
    const workspace = useWorkspaceStore.getState().workspace
    await act(async () => { render(<Harness />) })
    expect(files.read).not.toHaveBeenCalled()

    const nativeFile = { name: 'native.dsl' } as FileSystemFileHandle
    await act(async () => {
      files.file = nativeFile
      notifyHandleChanges()
    })
    expect(files.read).toHaveBeenLastCalledWith(nativeFile, null)
    expect(useWorkspaceStore.getState().workspace).toBe(workspace)
  })

  it('adopts a native file save still pending when a workspace edit starts watching', async () => {
    files.file = null
    load('Initial')
    await act(async () => { render(<Harness />) })
    const nativeFile = { name: 'native.dsl' } as FileSystemFileHandle
    const token = captureSelfWrite({ kind: 'file', handle: nativeFile })
    const finish = beginSelfWrite(token)
    files.read.mockResolvedValue({ content: dsl('Original on disk') })
    await act(async () => {
      files.file = nativeFile
      useWorkspaceStore.getState().updateWorkspaceMeta({ description: 'Local edit while saving' })
    })
    expect(isSelfWritePending()).toBe(true)
    expect(files.read).not.toHaveBeenCalled()

    recordSelfDslWrite(dsl('Initial'), token)
    finish()
    files.read.mockResolvedValue({ content: dsl('Initial') })
    await act(async () => { await vi.advanceTimersByTimeAsync(DISK_WATCH_INTERVAL_MS) })
    expect(useWorkspaceStore.getState().diskConflict).toBeNull()
    expect(useWorkspaceStore.getState().workspace!.description).toBe('Local edit while saving')
  })

  it('restarts for a different handle even when the workspace has the same name', async () => {
    load('Initial')
    await act(async () => { render(<Harness />) })
    const first = files.file
    expect(files.read).toHaveBeenLastCalledWith(first, null)

    const second = { name: 'second.dsl' } as FileSystemFileHandle
    await act(async () => {
      files.file = second
      files.read.mockResolvedValue({ content: dsl('Second') })
      load('Second')
    })
    expect(files.read).toHaveBeenLastCalledWith(second, null)
  })

  it('adopts a sidecar created after watching the same single file started', async () => {
    load('Initial')
    await act(async () => { render(<Harness />) })
    const sidecar = { name: 'first.c4hero.json' } as FileSystemFileHandle
    files.sidecar = sidecar
    await act(async () => { await vi.advanceTimersByTimeAsync(DISK_WATCH_INTERVAL_MS) })
    expect(files.read).toHaveBeenLastCalledWith(files.file, sidecar)
  })

  it('keeps the same file watch generation when workspace metadata is renamed', async () => {
    load('Initial')
    await act(async () => { render(<Harness />) })
    const token = captureSelfWrite({ kind: 'file', handle: files.file! })
    const readsBefore = files.read.mock.calls.length
    act(() => { useWorkspaceStore.getState().updateWorkspaceMeta({ name: 'Renamed workspace' }) })
    expect(files.read).toHaveBeenCalledTimes(readsBefore)
    recordSelfDslWrite(dsl('Our pending save'), token)
    expect(isSelfWrite(hashSnapshot({ content: dsl('Our pending save') }), hashSnapshot({ content: dsl('Initial') }))).toBe(true)
  })

  it('discards an old read which completes after switching to a same-name workspace', async () => {
    load('Initial')
    await act(async () => { render(<Harness />) })
    let finish!: (snapshot: { content: string }) => void
    files.read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    await act(async () => { await vi.advanceTimersByTimeAsync(DISK_WATCH_INTERVAL_MS) })

    await act(async () => {
      files.file = { name: 'second.dsl' } as FileSystemFileHandle
      files.read.mockResolvedValue({ content: dsl('Second') })
      load('Second')
    })
    await act(async () => { finish({ content: dsl('Old external edit') }) })

    expect(useWorkspaceStore.getState().workspace!.model.people[0].name).toBe('Second')
    expect(useWorkspaceStore.getState().diskConflict).toBeNull()
  })

  it('raises a conflict for external changes after a layout save failed without an undo entry', async () => {
    load('Initial')
    await act(async () => { render(<Harness />) })
    useWorkspaceStore.setState({ fileSaveFailed: true })
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
    files.read.mockResolvedValue({ content: dsl('External edit') })
    await act(async () => { await vi.advanceTimersByTimeAsync(DISK_WATCH_INTERVAL_MS) })
    expect(useWorkspaceStore.getState().workspace!.model.people[0].name).toBe('Initial')
    expect(useWorkspaceStore.getState().diskConflict?.reason).toBe('dirty')
  })
})
