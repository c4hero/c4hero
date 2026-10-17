import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/fileIO', () => ({
  enqueueFileWrites: vi.fn(async operation => operation(vi.fn())),
  getCurrentFileHandle: vi.fn(() => null),
  getCurrentSidecarHandle: vi.fn(() => null),
  writeToCurrentHandle: vi.fn(async () => true),
  writeSidecarToHandle: vi.fn(async () => true),
}))
vi.mock('@/lib/folderIO', () => ({
  getCurrentDirHandle: vi.fn(() => null),
  writeDSLFile: vi.fn(async () => true),
  writeSidecarFile: vi.fn(async () => true),
  writeDSLFileAt: vi.fn(async () => true),
  readDSLFileAt: vi.fn(async () => 's = softwareSystem "Shop"\n'),
}))

import { getCurrentFileHandle, getCurrentSidecarHandle, writeToCurrentHandle, writeSidecarToHandle } from '@/lib/fileIO'
import { getCurrentDirHandle, readDSLFileAt, writeDSLFile, writeDSLFileAt, writeSidecarFile } from '@/lib/folderIO'
import { isWorkspaceLinked, writeLinkedWorkspace } from './workspaceSave'
import { parseDSL } from '@/lib/dsl'
import { applySidecar } from './sidecar'
import { allViewsOf } from '@/store/workspace-helpers'

const ws = () => parseDSL('workspace "Shop" {\n  model {\n    s = softwareSystem "Shop"\n  }\n}').workspace

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCurrentFileHandle).mockReturnValue(null)
  vi.mocked(getCurrentSidecarHandle).mockReturnValue(null)
  vi.mocked(getCurrentDirHandle).mockReturnValue(null)
  vi.mocked(writeToCurrentHandle).mockResolvedValue(true)
  vi.mocked(writeSidecarToHandle).mockResolvedValue(true)
  vi.mocked(writeDSLFile).mockResolvedValue(true)
  vi.mocked(writeSidecarFile).mockResolvedValue(true)
  vi.mocked(writeDSLFileAt).mockResolvedValue(true)
  vi.mocked(readDSLFileAt).mockResolvedValue('s = softwareSystem "Shop"\n')
})

describe('isWorkspaceLinked', () => {
  it('is true for a single-file handle, or a folder plus an active filename', () => {
    expect(isWorkspaceLinked(null)).toBe(false)
    expect(isWorkspaceLinked('shop.dsl')).toBe(false)
    vi.mocked(getCurrentDirHandle).mockReturnValue({ name: 'arch' } as unknown as FileSystemDirectoryHandle)
    expect(isWorkspaceLinked(null)).toBe(false)
    expect(isWorkspaceLinked('shop.dsl')).toBe(true)
    vi.mocked(getCurrentDirHandle).mockReturnValue(null)
    vi.mocked(getCurrentFileHandle).mockReturnValue({} as FileSystemFileHandle)
    expect(isWorkspaceLinked(null)).toBe(true)
  })
})

describe('writeLinkedWorkspace', () => {
  it('does nothing and resolves false when nothing is linked', async () => {
    expect(await writeLinkedWorkspace(ws(), 'shop.dsl')).toBe(false)
    expect(writeDSLFile).not.toHaveBeenCalled()
    expect(writeToCurrentHandle).not.toHaveBeenCalled()
  })

  it('writes the collection file by its active filename', async () => {
    vi.mocked(getCurrentDirHandle).mockReturnValue({ name: 'arch' } as unknown as FileSystemDirectoryHandle)
    expect(await writeLinkedWorkspace(ws(), 'shop.dsl')).toBe(true)
    expect(writeDSLFile).toHaveBeenCalledTimes(1)
    const [name, dsl] = vi.mocked(writeDSLFile).mock.calls[0]
    expect(name).toBe('shop.dsl')
    expect(dsl).toContain('workspace "Shop"')
    expect(writeToCurrentHandle).not.toHaveBeenCalled()
  })

  it('writes through the single-file handle', async () => {
    vi.mocked(getCurrentFileHandle).mockReturnValue({} as FileSystemFileHandle)
    expect(await writeLinkedWorkspace(ws(), null)).toBe(true)
    expect(writeToCurrentHandle).toHaveBeenCalledTimes(1)
    expect(writeDSLFile).not.toHaveBeenCalled()
  })

  it('reports a failed write', async () => {
    vi.mocked(getCurrentDirHandle).mockReturnValue({ name: 'arch' } as unknown as FileSystemDirectoryHandle)
    vi.mocked(writeDSLFile).mockResolvedValueOnce(false)
    expect(await writeLinkedWorkspace(ws(), 'shop.dsl')).toBe(false)
  })

  it('checks included fragments on every save and accepts its own confirmed bytes', async () => {
    vi.mocked(getCurrentDirHandle).mockReturnValue({ name: 'arch' } as unknown as FileSystemDirectoryHandle)
    const w = ws()
    w.includedFiles = [{ path: 'teams/shop.dsl', writable: true, text: 'shop = softwareSystem "Shop"\n' }]
    w.model.softwareSystems[0].sourcePath = 'teams/shop.dsl'
    vi.mocked(readDSLFileAt).mockResolvedValueOnce(w.includedFiles[0].text!)
    await writeLinkedWorkspace(w, 'root.dsl')
    const first = vi.mocked(writeDSLFileAt).mock.calls.length
    expect(first).toBe(1)
    vi.mocked(readDSLFileAt).mockResolvedValue(vi.mocked(writeDSLFileAt).mock.calls[0][1])
    await writeLinkedWorkspace(w, 'root.dsl')
    expect(vi.mocked(writeDSLFileAt).mock.calls.length).toBe(first + 1)
    w.model.softwareSystems[0].name = 'Shop 2'
    await writeLinkedWorkspace(w, 'root.dsl')
    expect(vi.mocked(writeDSLFileAt).mock.calls.length).toBe(first + 2)
  })

  it.each(['folder', 'file'])('reports a layout failure after the root succeeds (%s)', async mode => {
    if (mode === 'folder') {
      vi.mocked(getCurrentDirHandle).mockReturnValue({ name: 'arch' } as FileSystemDirectoryHandle)
      vi.mocked(writeSidecarFile).mockResolvedValueOnce(false)
    } else {
      vi.mocked(getCurrentFileHandle).mockReturnValue({} as FileSystemFileHandle)
      vi.mocked(getCurrentSidecarHandle).mockReturnValue({} as FileSystemFileHandle)
      vi.mocked(writeSidecarToHandle).mockResolvedValueOnce(false)
    }
    expect(await writeLinkedWorkspace(ws(), 'shop.dsl')).toBe(false)
  })

  it('waits for included fragments and retries an unchanged failed fragment', async () => {
    vi.mocked(getCurrentDirHandle).mockReturnValue({ name: 'arch' } as FileSystemDirectoryHandle)
    const workspace = ws()
    workspace.includedFiles = [{ path: 'shop.dsl', writable: true, text: 's = softwareSystem "Shop"\n' }]
    workspace.model.softwareSystems[0].sourcePath = 'shop.dsl'
    let finish!: (ok: boolean) => void
    const began = Promise.withResolvers<void>()
    vi.mocked(writeDSLFileAt).mockImplementationOnce(() => {
      began.resolve()
      return new Promise(resolve => { finish = resolve })
    })
    let finished = false
    const save = writeLinkedWorkspace(workspace, 'root.dsl').then(ok => { finished = true; return ok })
    await began.promise
    expect(finished).toBe(false)
    finish(false)
    expect(await save).toBe(false)
    expect(await writeLinkedWorkspace(workspace, 'root.dsl')).toBe(true)
    expect(writeDSLFileAt).toHaveBeenCalledTimes(2)
  })

  it('captures the original file and sidecar before a workspace switch', async () => {
    const originalFile = { name: 'a.dsl' } as FileSystemFileHandle
    const originalSidecar = { name: 'a.c4hero.json' } as FileSystemFileHandle
    vi.mocked(getCurrentFileHandle).mockReturnValue(originalFile)
    vi.mocked(getCurrentSidecarHandle).mockReturnValue(originalSidecar)
    let finish!: (ok: boolean) => void
    const began = Promise.withResolvers<void>()
    vi.mocked(writeToCurrentHandle).mockImplementationOnce(() => {
      began.resolve()
      return new Promise(resolve => { finish = resolve })
    })
    const save = writeLinkedWorkspace(ws(), null)
    await began.promise
    vi.mocked(getCurrentFileHandle).mockReturnValue({ name: 'b.dsl' } as FileSystemFileHandle)
    vi.mocked(getCurrentSidecarHandle).mockReturnValue({ name: 'b.c4hero.json' } as FileSystemFileHandle)
    finish(true)
    expect(await save).toBe(true)
    expect(vi.mocked(writeSidecarToHandle).mock.calls[0].slice(1, 3)).toEqual([originalFile, originalSidecar])
  })

  it('saves a native single-file workspace without layout when its parent is unavailable', async () => {
    vi.mocked(getCurrentFileHandle).mockReturnValue({ name: 'shop.dsl' } as FileSystemFileHandle)
    expect(await writeLinkedWorkspace(ws(), null)).toBe(true)
    expect(writeSidecarToHandle).not.toHaveBeenCalled()
  })

  it('does not report a material layout saved when the single-file parent is unavailable', async () => {
    vi.mocked(getCurrentFileHandle).mockReturnValue({ name: 'shop.dsl' } as FileSystemFileHandle)
    vi.mocked(writeSidecarToHandle).mockResolvedValueOnce(false)
    const workspace = ws()
    Object.assign(allViewsOf(workspace)[0].elements[0], { pinned: true, x: 123, y: 456 })
    expect(await writeLinkedWorkspace(workspace, null)).toBe(false)
    expect(writeSidecarToHandle).toHaveBeenCalledOnce()
  })
})

// Verify the actual save boundary, not just the in-memory projection.
describe('layout writes', () => {
  it.each(['folder', 'file'])('clears the last position saved in the same session (%s)', async mode => {
    if (mode === 'folder') vi.mocked(getCurrentDirHandle).mockReturnValue({ name: 'arch' } as FileSystemDirectoryHandle)
    else {
      vi.mocked(getCurrentFileHandle).mockReturnValue({} as FileSystemFileHandle)
      vi.mocked(getCurrentSidecarHandle).mockReturnValue({} as FileSystemFileHandle)
    }
    const workspace = ws()
    const view = allViewsOf(workspace)[0]
    const el = view.elements[0]
    Object.assign(el, { pinned: true, x: 100, y: 200 })
    await writeLinkedWorkspace(workspace, 'shop.dsl')
    el.pinned = undefined
    el.x = undefined
    el.y = undefined
    await writeLinkedWorkspace(workspace, 'shop.dsl')
    const calls = mode === 'folder' ? vi.mocked(writeSidecarFile).mock.calls.map(c => c[1])
      : vi.mocked(writeSidecarToHandle).mock.calls.map(c => c[0])
    expect(calls).toHaveLength(2)
    expect(JSON.parse(calls[0]).views[view.key].elements[el.id]).toEqual({ pinned: true, x: 100, y: 200 })
    expect(JSON.parse(calls[1])).toEqual({ version: 1, views: {} })
  })

  it('writes missing views and missing elements alongside updated live positions', async () => {
    vi.mocked(getCurrentDirHandle).mockReturnValue({ name: 'arch' } as FileSystemDirectoryHandle)
    const workspace = ws()
    const view = allViewsOf(workspace)[0]
    const live = view.elements[0]
    const absent = { pinned: true, x: 12, y: 34 }
    applySidecar(workspace, { version: 1, views: {
      absentView: { locked: true, elements: { missing: absent } },
      [view.key]: { elements: { missing: absent } },
    } })
    Object.assign(live, { pinned: true, x: 77, y: 88 })
    await writeLinkedWorkspace(workspace, 'shop.dsl')
    const saved = JSON.parse(vi.mocked(writeSidecarFile).mock.calls[0][1])
    expect(saved.views.absentView).toEqual({ locked: true, elements: { missing: absent } })
    expect(saved.views[view.key].elements).toEqual({ missing: absent, [live.id]: { pinned: true, x: 77, y: 88 } })
  })
})


describe('failed root saves', () => {
  it.each(['folder', 'file'])('does not overwrite sidecar or included files after a failed DSL write (%s)', async mode => {
    if (mode === 'folder') {
      vi.mocked(getCurrentDirHandle).mockReturnValue({ name: 'failed-save' } as FileSystemDirectoryHandle)
      vi.mocked(writeDSLFile).mockResolvedValueOnce(false)
    } else {
      vi.mocked(getCurrentFileHandle).mockReturnValue({} as FileSystemFileHandle)
      vi.mocked(getCurrentSidecarHandle).mockReturnValue({} as FileSystemFileHandle)
      vi.mocked(writeToCurrentHandle).mockResolvedValueOnce(false)
    }
    const workspace = ws()
    workspace.includedFiles = [{ path: 'shop.dsl', writable: true, text: 's = softwareSystem "Shop"\n' }]
    workspace.model.softwareSystems[0].sourcePath = 'shop.dsl'
    expect(await writeLinkedWorkspace(workspace, 'root.dsl')).toBe(false)
    expect(writeSidecarFile).not.toHaveBeenCalled()
    expect(writeSidecarToHandle).not.toHaveBeenCalled()
    expect(writeDSLFileAt).not.toHaveBeenCalled()
    // A subsequent successful save still clears the old layout.
    expect(await writeLinkedWorkspace(workspace, 'root.dsl')).toBe(true)
    const calls = mode === 'folder' ? vi.mocked(writeSidecarFile).mock.calls.map(c => c[1])
      : vi.mocked(writeSidecarToHandle).mock.calls.map(c => c[0])
    expect(calls).toEqual([JSON.stringify({ version: 1, views: {} }, null, 2)])
  })
})
