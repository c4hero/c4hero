import { describe, expect, it, vi } from 'vitest'
import { createDocumentSync } from './vscodeSync'
const snapshot = (content: string, sidecarJson?: string) => ({ content, sidecarJson, includes: {} })

describe('VS Code document synchronization', () => {
  it('serializes edits against acknowledged revisions and waits before save', async () => {
    let release!: (revision: number) => void
    const edit = vi.fn().mockImplementationOnce(() => new Promise<number>(resolve => { release = resolve })).mockResolvedValueOnce(9)
    const sync = createDocumentSync(snapshot('A'), 7, edit)
    const first = sync.push(snapshot('B')); const second = sync.push(snapshot('C'))
    await Promise.resolve()
    expect(edit).toHaveBeenCalledTimes(1)
    expect(edit).toHaveBeenNthCalledWith(1, snapshot('B'), 7)
    release(8)
    await Promise.all([first, second, sync.flush()])
    expect(edit).toHaveBeenNthCalledWith(2, snapshot('C'), 8)
  })
  it('sends layout-only changes and suppresses identical snapshots', async () => {
    const edit = vi.fn().mockResolvedValue(2)
    const sync = createDocumentSync(snapshot('A'), 1, edit)
    await sync.push(snapshot('A'))
    expect(edit).not.toHaveBeenCalled()
    await sync.push(snapshot('A', '{"version":1}'))
    expect(edit).toHaveBeenCalledTimes(1)
  })
  it('reports failed edits to save instead of acknowledging success', async () => {
    const sync = createDocumentSync(snapshot('A'), 1, vi.fn().mockRejectedValue(new Error('Conflict')))
    await expect(sync.push(snapshot('B'))).rejects.toThrow('Conflict')
    await expect(sync.flush()).rejects.toThrow('Conflict')
  })
  it('discards queued old edits after an external document revision arrives', async () => {
    const edit = vi.fn().mockResolvedValue(4)
    const sync = createDocumentSync(snapshot('A'), 1, edit)
    const pending = sync.push(snapshot('B'))
    sync.receive(snapshot('External'), 3)
    await pending
    expect(edit).not.toHaveBeenCalled()
    await sync.push(snapshot('Next'))
    expect(edit).toHaveBeenCalledWith(snapshot('Next'), 3)
  })
})

it('a rejected obsolete edit does not poison the new external revision', async () => {
  let reject!: (error: Error) => void
  const edit = vi.fn().mockImplementationOnce(() => new Promise<number>((_, fail) => { reject = fail })).mockResolvedValue(5)
  const sync = createDocumentSync(snapshot('A'), 1, edit)
  const pending = sync.push(snapshot('B'))
  await Promise.resolve()
  sync.receive(snapshot('External'), 4)
  reject(new Error('Stale revision'))
  await pending
  await sync.push(snapshot('Next'))
  await expect(sync.flush()).resolves.toBeUndefined()
  expect(edit).toHaveBeenLastCalledWith(snapshot('Next'), 4)
})
