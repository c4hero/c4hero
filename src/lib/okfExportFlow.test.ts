import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBigBankSample } from './templates'

const downloadBlob = vi.fn()
const writeFilesInto = vi.fn()

vi.mock('@/lib/exportUtils', () => ({ downloadBlob: (...args: unknown[]) => downloadBlob(...args) }))
vi.mock('@/lib/folderIO', () => ({ writeFilesInto: (...args: unknown[]) => writeFilesInto(...args) }))

import { runOkfExport } from './okfExportFlow'

describe('runOkfExport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    downloadBlob.mockReset()
    writeFilesInto.mockReset()
  })

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

  it('surfaces any other picker failure', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')))
    await expect(runOkfExport(createBigBankSample(), 'folder')).rejects.toThrow('denied')
  })
})
