import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/fileIO', () => ({
  getCurrentFileHandle: vi.fn(() => null),
  writeToCurrentHandle: vi.fn(async () => true),
  writeSidecarToHandle: vi.fn(async () => true),
}))
vi.mock('@/lib/folderIO', () => ({
  getCurrentDirHandle: vi.fn(() => null),
  writeDSLFile: vi.fn(async () => true),
  writeSidecarFile: vi.fn(async () => true),
  writeDSLFileAt: vi.fn(async () => true),
}))

import { getCurrentFileHandle, writeToCurrentHandle, writeSidecarToHandle } from '@/lib/fileIO'
import { getCurrentDirHandle, writeDSLFile, writeDSLFileAt, writeSidecarFile } from '@/lib/folderIO'
import { isWorkspaceLinked, writeLinkedWorkspace } from './workspaceSave'
import { parseDSL } from '@/lib/dsl'
import { applySidecar } from './sidecar'
import { allViewsOf } from '@/store/workspace-helpers'

const ws = () => parseDSL('workspace "Shop" {\n  model {\n    s = softwareSystem "Shop"\n  }\n}').workspace

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCurrentFileHandle).mockReturnValue(null)
  vi.mocked(getCurrentDirHandle).mockReturnValue(null)
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

  it('writes back an included fragment once until it changes', async () => {
    vi.mocked(getCurrentDirHandle).mockReturnValue({ name: 'arch' } as unknown as FileSystemDirectoryHandle)
    const w = ws()
    w.includedFiles = [{ path: 'teams/shop.dsl', writable: true, text: 'shop = softwareSystem "Shop"\n' }]
    w.model.softwareSystems[0].sourcePath = 'teams/shop.dsl'
    await writeLinkedWorkspace(w, 'root.dsl')
    const first = vi.mocked(writeDSLFileAt).mock.calls.length
    expect(first).toBe(1)
    await writeLinkedWorkspace(w, 'root.dsl')
    expect(vi.mocked(writeDSLFileAt).mock.calls.length).toBe(first)
    w.model.softwareSystems[0].name = 'Shop 2'
    await writeLinkedWorkspace(w, 'root.dsl')
    expect(vi.mocked(writeDSLFileAt).mock.calls.length).toBe(first + 1)
  })
})

// Verify the actual save boundary, not just the in-memory projection.
describe('layout writes', () => {
  it.each(['folder', 'file'])('clears the last position saved in the same session (%s)', async mode => {
    if (mode === 'folder') vi.mocked(getCurrentDirHandle).mockReturnValue({ name: 'arch' } as FileSystemDirectoryHandle)
    else vi.mocked(getCurrentFileHandle).mockReturnValue({} as FileSystemFileHandle)
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
