import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBigBankSample } from './templates'

const downloadBlob = vi.fn()
const writeFilesInto = vi.fn()
const readFileIn = vi.fn<(dir: unknown, path: string) => Promise<string | null>>()
const listFilesIn = vi.fn<(dir: unknown, dirs: readonly string[]) => Promise<string[]>>()
const removeFilesIn = vi.fn<(dir: unknown, paths: readonly string[]) => Promise<string[]>>()

vi.mock('@/lib/exportUtils', () => ({ downloadBlob: (...args: unknown[]) => downloadBlob(...args) }))
vi.mock('@/lib/folderIO', () => ({
  writeFilesInto: (...args: unknown[]) => writeFilesInto(...args),
  readFileIn: (dir: unknown, path: string) => readFileIn(dir, path),
  listFilesIn: (dir: unknown, dirs: readonly string[]) => listFilesIn(dir, dirs),
  removeFilesIn: (dir: unknown, paths: readonly string[]) => removeFilesIn(dir, paths),
}))

import { runOkfExport } from './okfExportFlow'

describe('runOkfExport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    downloadBlob.mockReset()
    writeFilesInto.mockReset()
    readFileIn.mockReset()
    listFilesIn.mockReset()
    removeFilesIn.mockReset()
  })

  /** An empty folder: nothing to recognise, nothing to prune. */
  function emptyFolder() {
    readFileIn.mockResolvedValue(null)
    listFilesIn.mockResolvedValue([])
    removeFilesIn.mockResolvedValue([])
  }

  it('downloads a zip named after the workspace', async () => {
    const message = await runOkfExport(createBigBankSample(), 'zip')
    expect(downloadBlob).toHaveBeenCalledTimes(1)
    const [blob, filename] = downloadBlob.mock.calls[0] as [Blob, string]
    expect(blob.type).toBe('application/zip')
    expect(filename).toBe('Big Bank plc-okf.zip')
    expect(message).toMatch(/^Exported OKF bundle \(\d+ files\)$/)
  })

  it('falls back to the zip when there is no directory picker', async () => {
    const orig = (window as Record<string, unknown>).showDirectoryPicker
    delete (window as Record<string, unknown>).showDirectoryPicker
    try {
      await runOkfExport(createBigBankSample(), 'folder')
      expect(downloadBlob).toHaveBeenCalledTimes(1)
      expect(writeFilesInto).not.toHaveBeenCalled()
    } finally {
      if (orig !== undefined) (window as Record<string, unknown>).showDirectoryPicker = orig
    }
  })

  it('writes into the picked folder and reports the count', async () => {
    const dir = { name: 'architecture' }
    emptyFolder()
    vi.stubGlobal('showDirectoryPicker', vi.fn().mockResolvedValue(dir))
    const message = await runOkfExport(createBigBankSample(), 'folder', 'c4hero test')
    expect(writeFilesInto).toHaveBeenCalledTimes(1)
    const [handle, files] = writeFilesInto.mock.calls[0] as [unknown, Array<{ path: string }>]
    expect(handle).toBe(dir)
    expect(files[0].path).toBe('index.md')
    expect(message).toBe(`Exported ${files.length} files to architecture/`)
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('treats a cancelled picker as a no-op, not an error', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')))
    await expect(runOkfExport(createBigBankSample(), 'folder')).resolves.toBeNull()
    expect(writeFilesInto).not.toHaveBeenCalled()
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('removes the concepts a previous export left behind', async () => {
    const dir = { name: 'architecture' }
    vi.stubGlobal('showDirectoryPicker', vi.fn().mockResolvedValue(dir))
    readFileIn.mockResolvedValue('---\nokf_version: "0.1"\n---\n\n# Big Bank plc\n')
    listFilesIn.mockResolvedValue(['index.md', 'README.md', 'systems/gone.md', 'systems/notes.txt'])
    removeFilesIn.mockResolvedValue(['systems/gone.md'])

    const message = await runOkfExport(createBigBankSample(), 'folder')

    // Only stale markdown inside a section directory: a file the bundle still
    // writes stays, and neither a non-markdown file nor someone's own
    // `README.md` beside the bundle is the exporter's to delete.
    expect(removeFilesIn).toHaveBeenCalledWith(dir, ['systems/gone.md'])
    expect(message).toMatch(/, 1 stale file removed$/)
    // Decided before the write, or every file would look current.
    expect(readFileIn.mock.invocationCallOrder[0]).toBeLessThan(writeFilesInto.mock.invocationCallOrder[0])
  })

  it('leaves a folder that is not a bundle alone', async () => {
    const dir = { name: 'Documents' }
    vi.stubGlobal('showDirectoryPicker', vi.fn().mockResolvedValue(dir))
    readFileIn.mockResolvedValue('# My notes\n\nNothing to do with c4hero.\n')
    listFilesIn.mockResolvedValue(['index.md', 'systems/taxes.md'])
    removeFilesIn.mockResolvedValue([])

    const message = await runOkfExport(createBigBankSample(), 'folder')

    expect(removeFilesIn).toHaveBeenCalledWith(dir, [])
    expect(writeFilesInto).toHaveBeenCalledTimes(1)
    expect(message).not.toMatch(/stale/)
  })

  it('exports anyway when the folder cannot be checked for stale files', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn().mockResolvedValue({ name: 'architecture' }))
    readFileIn.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    removeFilesIn.mockResolvedValue([])

    await expect(runOkfExport(createBigBankSample(), 'folder')).resolves.toMatch(/^Exported \d+ files/)
    expect(writeFilesInto).toHaveBeenCalledTimes(1)
  })

  it('surfaces any other picker failure', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')))
    await expect(runOkfExport(createBigBankSample(), 'folder')).rejects.toThrow('denied')
  })
})
