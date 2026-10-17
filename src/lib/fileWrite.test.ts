import { File as NativeFile } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { enqueueFileWrites, fileAlreadyHas, writeFileIfChanged } from './fileIO'

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
      expect(second).resolves.toBe(true),
    ])

    expect(opened).toBe(2)
    expect(content).toBe('C')
  })

  it('orders deferred destination resolution with the writes it precedes', async () => {
    let content = 'original'
    const lookupStarted = barrier()
    const allowLookup = barrier()
    const handle = {
      getFile: async () => snapshot(content),
      createWritable: async () => {
        let pending = ''
        return { write: async (value: string) => { pending = value }, close: async () => { content = pending } }
      },
    } as unknown as FileSystemFileHandle
    const first = writeFileIfChanged(async () => {
      lookupStarted.release()
      await allowLookup.promise
      return handle
    }, 'earlier')
    await lookupStarted.promise
    const second = writeFileIfChanged(handle, 'later')
    allowLookup.release()
    expect(await Promise.all([first, second])).toEqual([true, true])
    expect(content).toBe('later')
  })

  it('confirms successful unchanged and changed saves, but never a failed or missing save', async () => {
    const confirmed = vi.fn()
    const writable = { write: vi.fn(async () => {}), close: vi.fn(async () => {}) }
    const handle = {
      getFile: async () => snapshot('same'),
      createWritable: async () => writable,
    } as unknown as FileSystemFileHandle
    expect(await writeFileIfChanged(handle, 'same', confirmed)).toBe(true)
    expect(writable.write).not.toHaveBeenCalled()
    expect(confirmed).toHaveBeenCalledTimes(1)
    expect(await writeFileIfChanged(handle, 'changed', confirmed)).toBe(true)
    expect(confirmed).toHaveBeenCalledTimes(2)
    writable.close.mockRejectedValueOnce(new Error('close failed'))
    await expect(writeFileIfChanged(handle, 'changed again', confirmed)).rejects.toThrow('close failed')
    expect(await writeFileIfChanged(async () => null, 'missing', confirmed)).toBe(false)
    expect(confirmed).toHaveBeenCalledTimes(2)
  })

  it('keeps all stages of an earlier batch ahead of a later direct save', async () => {
    let content = 'initial'
    const firstWritten = barrier()
    const allowSecond = barrier()
    const handle = {
      getFile: async () => snapshot(content),
      createWritable: async () => {
        let pending = ''
        return { write: async (value: string) => { pending = value }, close: async () => { content = pending } }
      },
    } as unknown as FileSystemFileHandle
    const bundle = enqueueFileWrites(async (write) => {
      await write(handle, 'first stage')
      firstWritten.release()
      await allowSecond.promise
      return write(handle, 'last stage')
    })
    await firstWritten.promise
    const direct = writeFileIfChanged(handle, 'latest direct save')
    try {
      await Promise.resolve()
      expect(content).toBe('first stage')
    } finally {
      allowSecond.release()
      await Promise.all([bundle, direct])
    }
    expect(content).toBe('latest direct save')
  })

  it('defers watcher observations only while a changed write is pending and always clears it', async () => {
    const events: string[] = []
    const writable = { write: async () => {}, close: vi.fn(async () => {}) }
    const handle = {
      getFile: async () => snapshot('same'),
      createWritable: async () => writable,
    } as unknown as FileSystemFileHandle
    const confirm = () => { events.push('confirmed') }
    const begin = () => { events.push('started'); return () => { events.push('finished') } }
    await writeFileIfChanged(handle, 'same', confirm, begin)
    expect(events).toEqual(['confirmed'])
    events.length = 0
    await writeFileIfChanged(handle, 'changed', confirm, begin)
    expect(events).toEqual(['started', 'confirmed', 'finished'])
    events.length = 0
    writable.close.mockRejectedValueOnce(new Error('close failed'))
    await expect(writeFileIfChanged(handle, 'changed', confirm, begin)).rejects.toThrow('close failed')
    expect(events).toEqual(['started', 'finished'])
  })
})
