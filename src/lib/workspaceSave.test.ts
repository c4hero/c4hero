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

import { getCurrentFileHandle, writeToCurrentHandle } from '@/lib/fileIO'
import { getCurrentDirHandle, writeDSLFile, writeDSLFileAt } from '@/lib/folderIO'
import { isWorkspaceLinked, writeLinkedWorkspace } from './workspaceSave'
import { parseDSL } from '@/lib/dsl'

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
