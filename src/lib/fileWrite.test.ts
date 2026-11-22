import { File as NativeFile } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { fileAlreadyHas, writeFileIfChanged } from './fileIO'

function snapshot(content: string | Uint8Array): File {
  return new NativeFile([content], 'workspace.dsl') as unknown as File
}

function barrier() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

describe('file writes preserve the latest requested bytes', () => {
  it('replaces malformed UTF-8 even when its decoded text and byte length match', async () => {
    // This truncated four-byte sequence decodes to one replacement character,
    // whose valid UTF-8 encoding also occupies three bytes. A text comparison
    // after the size check would incorrectly leave the malformed bytes on disk.
    let content = new Uint8Array([0xf0, 0x90, 0x80])
    const replacement = '\uFFFD'
    const createWritable = vi.fn(async () => {
      let pending = content
      return {
        write: async (text: string) => { pending = new TextEncoder().encode(text) },
        close: async () => { content = pending },
      }
    })
    const handle = {
      getFile: async () => snapshot(content),
      createWritable,
    } as unknown as FileSystemFileHandle

    expect(await snapshot(content).text()).toBe(replacement)
    expect(content.byteLength).toBe(new TextEncoder().encode(replacement).byteLength)
    expect(await fileAlreadyHas(handle, replacement)).toBe(false)

    await writeFileIfChanged(handle, replacement)

    expect(createWritable).toHaveBeenCalledOnce()
    expect(Array.from(content)).toEqual([0xef, 0xbf, 0xbd])
  })

  it('waits for an earlier write to close before comparing a request to restore the original bytes', async () => {
    let content = 'A'
    let opened = 0
    const reads: string[] = []
    const firstCloseStarted = barrier()
    const allowFirstClose = barrier()
    const handle = {
      getFile: async () => {
        reads.push(content)
        return snapshot(content)
      },
      createWritable: async () => {
        const first = ++opened === 1
        let pending = ''
        return {
          write: async (text: string) => { pending = text },
          close: async () => {
            if (first) {
              firstCloseStarted.release()
              await allowFirstClose.promise
            }
            content = pending
          },
        }
      },
    } as unknown as FileSystemFileHandle

    const first = writeFileIfChanged(handle, 'B')
    await firstCloseStarted.promise
    const second = writeFileIfChanged(handle, 'A')
    try {
      // Let the queued request run if it can. It must not inspect the old A
      // while the preceding save is still preparing to replace it with B.
      await Promise.resolve()
      expect(reads).toEqual(['A'])
    } finally {
      allowFirstClose.release()
      await Promise.all([first, second])
    }

    expect(reads).toEqual(['A', 'B'])
    expect(opened).toBe(2)
    expect(content).toBe('A')
  })

  it.each(['write', 'close'] as const)('rejects a failed %s without blocking the next save to the same handle', async (phase) => {
    let content = 'A'
    let opened = 0
    const failure = new Error(`Failed to ${phase}`)
    const handle = {
      getFile: async () => snapshot(content),
      createWritable: async () => {
        const first = ++opened === 1
        let pending = ''
        return {
          write: async (text: string) => {
            if (first && phase === 'write') throw failure
            pending = text
          },
          close: async () => {
            if (first && phase === 'close') throw failure
            content = pending
          },
        }
      },
    } as unknown as FileSystemFileHandle

    const first = writeFileIfChanged(handle, 'B')
    const second = writeFileIfChanged(handle, 'C')
    await Promise.all([
      expect(first).rejects.toThrow(failure),
      expect(second).resolves.toBeUndefined(),
    ])

    expect(opened).toBe(2)
    expect(content).toBe('C')
  })
})
