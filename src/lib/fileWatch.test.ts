import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFileWatcher, hashContent, hashSnapshot, type WatchedSnapshot } from './fileWatch'
import {
  recordSelfWrite, isSelfWrite, resetSaveCoordinator, captureSelfWrite,
  recordSelfDslWrite, beginSelfWrite, isSelfWritePending, getSelfWriteRevision,
} from './saveCoordinator'

function makeSource(initial: WatchedSnapshot | null) {
  let current = initial
  const read = vi.fn(async () => current)
  return {
    read,
    set(next: WatchedSnapshot | null) { current = next },
  }
}

async function flush() {
  // Let the awaited read + microtasks settle.
  await Promise.resolve()
  await Promise.resolve()
}

describe('hashContent', () => {
  it('is deterministic and distinguishes different text', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'))
    expect(hashContent('abc')).not.toBe(hashContent('abd'))
    expect(hashContent('')).not.toBe(hashContent(' '))
  })
})

describe('createFileWatcher', () => {
  beforeEach(() => { vi.useFakeTimers(); resetSaveCoordinator() })
  afterEach(() => { vi.useRealTimers() })

  it('seeds a baseline on start without firing, then fires on a content change', async () => {
    const src = makeSource({ content: 'a' })
    const onChange = vi.fn()
    const w = createFileWatcher({ read: src.read, onChange, intervalMs: 100 })
    await w.start()
    expect(onChange).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    expect(onChange).not.toHaveBeenCalled() // unchanged

    src.set({ content: 'b' })
    await vi.advanceTimersByTimeAsync(100)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toEqual({ content: 'b' })
    expect(onChange.mock.calls[0][1]).toEqual(hashSnapshot({ content: 'b' }))
    w.dispose()
  })

  it('treats a sidecar-only change as a change', async () => {
    const src = makeSource({ content: 'a', sidecarJson: '{}' })
    const onChange = vi.fn()
    const w = createFileWatcher({ read: src.read, onChange, intervalMs: 100 })
    await w.start()
    src.set({ content: 'a', sidecarJson: '{"x":1}' })
    await vi.advanceTimersByTimeAsync(100)
    expect(onChange).toHaveBeenCalledTimes(1)
    w.dispose()
  })

  it('ignores a self-write but moves the baseline past it', async () => {
    const src = makeSource({ content: 'a' })
    const onChange = vi.fn()
    const isSelfWrite = vi.fn((h: { dsl: string }) => h.dsl === hashContent('ours'))
    const w = createFileWatcher({ read: src.read, onChange, isSelfWrite, intervalMs: 100 })
    await w.start()

    src.set({ content: 'ours' })
    await vi.advanceTimersByTimeAsync(100)
    expect(onChange).not.toHaveBeenCalled()
    expect(isSelfWrite).toHaveBeenCalledWith(hashSnapshot({ content: 'ours' }), hashSnapshot({ content: 'a' }))
    expect(w.getBaseline()).toEqual(hashSnapshot({ content: 'ours' }))

    // A later external edit is still detected relative to the new baseline.
    src.set({ content: 'theirs' })
    await vi.advanceTimersByTimeAsync(100)
    expect(onChange).toHaveBeenCalledTimes(1)
    w.dispose()
  })

  it('acknowledges an identical skipped save so it cannot hide a later external restore', async () => {
    const src = makeSource({ content: 'original' })
    const onChange = vi.fn()
    const w = createFileWatcher({ read: src.read, onChange, isSelfWrite, intervalMs: 100 })
    await w.start()
    recordSelfWrite('original') // The write was skipped because these bytes already exist.
    await w.checkNow()
    recordSelfWrite('edited')
    src.set({ content: 'edited' })
    await w.checkNow()
    expect(onChange).not.toHaveBeenCalled()

    src.set({ content: 'original' }) // An external tool reverts the previous edit.
    await w.checkNow()
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ content: 'original' }, hashSnapshot({ content: 'original' }))
    w.dispose()
  })

  it('defers visible bytes until close succeeds and the self-write is confirmed', async () => {
    const src = makeSource({ content: 'original' })
    const onChange = vi.fn()
    const w = createFileWatcher({ read: src.read, onChange, isSelfWrite, shouldDefer: isSelfWritePending })
    await w.start()
    const token = captureSelfWrite()
    const finish = beginSelfWrite(token)
    src.set({ content: 'ours' }) // The swap happened; close() has not resolved.
    await w.checkNow()
    expect(w.getBaseline()).toEqual(hashSnapshot({ content: 'original' }))
    expect(onChange).not.toHaveBeenCalled()

    recordSelfDslWrite('ours', token)
    finish()
    await w.checkNow()
    expect(w.getBaseline()).toEqual(hashSnapshot({ content: 'ours' }))
    expect(onChange).not.toHaveBeenCalled()
    w.dispose()
  })

  it('detects external candidate bytes after an attempted write fails', async () => {
    const src = makeSource({ content: 'original' })
    const onChange = vi.fn()
    const w = createFileWatcher({ read: src.read, onChange, isSelfWrite, shouldDefer: isSelfWritePending })
    await w.start()
    const finish = beginSelfWrite(captureSelfWrite())
    src.set({ content: 'candidate' }) // An external editor produced our candidate.
    await w.checkNow()
    finish() // The attempted save failed; no success hash is recorded.
    await w.checkNow()
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ content: 'candidate' }, hashSnapshot({ content: 'candidate' }))
    w.dispose()
  })

  it('discards a read when a write starts before that read finishes', async () => {
    let complete!: (snapshot: WatchedSnapshot) => void
    const read = vi.fn().mockResolvedValueOnce({ content: 'original' })
      .mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
      .mockResolvedValue({ content: 'ours' })
    const onChange = vi.fn()
    const w = createFileWatcher({ read, onChange, isSelfWrite, shouldDefer: isSelfWritePending })
    await w.start()
    const reading = w.checkNow()
    const token = captureSelfWrite()
    const finish = beginSelfWrite(token)
    complete({ content: 'ours' })
    await reading
    expect(w.getBaseline()).toEqual(hashSnapshot({ content: 'original' }))
    recordSelfDslWrite('ours', token)
    finish()
    await w.checkNow()
    expect(onChange).not.toHaveBeenCalled()
    w.dispose()
  })

  it('detects an external restore after two own writes complete between polls', async () => {
    const src = makeSource({ content: 'original' })
    const onChange = vi.fn()
    const w = createFileWatcher({ read: src.read, onChange, isSelfWrite, shouldDefer: isSelfWritePending, readVersion: getSelfWriteRevision })
    await w.start()
    recordSelfWrite('B')
    src.set({ content: 'B' })
    recordSelfWrite('C')
    src.set({ content: 'C' })
    src.set({ content: 'B' }) // External rollback before the next poll.
    await w.checkNow()
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ content: 'B' }, hashSnapshot({ content: 'B' }))
    w.dispose()
  })

  it('retries a snapshot spanning an entire completed write without a false conflict', async () => {
    let complete!: (snapshot: WatchedSnapshot) => void
    const read = vi.fn().mockResolvedValueOnce({ content: 'original' })
      .mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
      .mockResolvedValue({ content: 'C' })
    const onChange = vi.fn()
    const w = createFileWatcher({ read, onChange, isSelfWrite, shouldDefer: isSelfWritePending, readVersion: getSelfWriteRevision })
    await w.start()
    recordSelfWrite('B')
    const reading = w.checkNow()
    const token = captureSelfWrite()
    const finish = beginSelfWrite(token)
    recordSelfDslWrite('C', token)
    finish() // No write remains pending when the old B snapshot completes.
    complete({ content: 'B' })
    await reading
    expect(w.getBaseline()).toEqual(hashSnapshot({ content: 'original' }))
    expect(onChange).not.toHaveBeenCalled()
    await w.checkNow()
    expect(w.getBaseline()).toEqual(hashSnapshot({ content: 'C' }))
    expect(onChange).not.toHaveBeenCalled()
    w.dispose()
  })

  it('does not poll while hidden and checks immediately on wake', async () => {
    const src = makeSource({ content: 'a' })
    const onChange = vi.fn()
    let visible = false
    let wake: (() => void) | null = null
    const w = createFileWatcher({
      read: src.read,
      onChange,
      intervalMs: 100,
      isVisible: () => visible,
      subscribeWake: (cb) => { wake = cb; return () => { wake = null } },
    })
    await w.start()
    const readsAfterStart = src.read.mock.calls.length

    src.set({ content: 'b' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(src.read.mock.calls.length).toBe(readsAfterStart) // no polling while hidden
    expect(onChange).not.toHaveBeenCalled()

    visible = true
    wake!()
    await flush()
    expect(onChange).toHaveBeenCalledTimes(1) // immediate check on wake

    // Polling resumes while visible.
    src.set({ content: 'c' })
    await vi.advanceTimersByTimeAsync(100)
    expect(onChange).toHaveBeenCalledTimes(2)

    // Going hidden again stops the interval.
    visible = false
    wake!()
    src.set({ content: 'd' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(onChange).toHaveBeenCalledTimes(2)
    w.dispose()
  })

  it('prefers a native observer over polling when one is available', async () => {
    const src = makeSource({ content: 'a' })
    const onChange = vi.fn()
    let notify: (() => void) | null = null
    const unobserve = vi.fn()
    const w = createFileWatcher({
      read: src.read,
      onChange,
      intervalMs: 100,
      observe: (cb) => { notify = cb; return unobserve },
    })
    await w.start()
    const readsAfterStart = src.read.mock.calls.length

    await vi.advanceTimersByTimeAsync(1000)
    expect(src.read.mock.calls.length).toBe(readsAfterStart) // no interval polling

    src.set({ content: 'b' })
    notify!()
    await flush()
    expect(onChange).toHaveBeenCalledTimes(1)

    w.dispose()
    expect(unobserve).toHaveBeenCalled()
  })

  it('reports a missing file once and recovers when it reappears', async () => {
    const src = makeSource({ content: 'a' })
    const onChange = vi.fn()
    const onMissing = vi.fn()
    const w = createFileWatcher({ read: src.read, onChange, onMissing, intervalMs: 100 })
    await w.start()

    src.set(null)
    await vi.advanceTimersByTimeAsync(300)
    expect(onMissing).toHaveBeenCalledTimes(1)

    src.set({ content: 'a' })
    await vi.advanceTimersByTimeAsync(100)
    expect(onChange).not.toHaveBeenCalled() // same bytes as before it vanished

    src.set(null)
    await vi.advanceTimersByTimeAsync(100)
    expect(onMissing).toHaveBeenCalledTimes(2)
    w.dispose()
  })

  it('swallows a transient read failure', async () => {
    let fail = false
    const read = vi.fn(async () => {
      if (fail) throw new Error('NotAllowedError')
      return { content: 'a' }
    })
    const onChange = vi.fn()
    const w = createFileWatcher({ read, onChange, intervalMs: 100 })
    await w.start()
    fail = true
    await vi.advanceTimersByTimeAsync(100)
    fail = false
    await vi.advanceTimersByTimeAsync(100)
    expect(onChange).not.toHaveBeenCalled()
    w.dispose()
  })

  it('acceptBaseline suppresses a re-fire for the accepted contents', async () => {
    const src = makeSource({ content: 'a' })
    const onChange = vi.fn()
    const w = createFileWatcher({ read: src.read, onChange, intervalMs: 100 })
    await w.start()
    w.acceptBaseline(hashSnapshot({ content: 'b' }))
    src.set({ content: 'b' })
    await vi.advanceTimersByTimeAsync(100)
    expect(onChange).not.toHaveBeenCalled()
    w.dispose()
  })

  it('does nothing after dispose', async () => {
    const src = makeSource({ content: 'a' })
    const onChange = vi.fn()
    const w = createFileWatcher({ read: src.read, onChange, intervalMs: 100 })
    await w.start()
    w.dispose()
    src.set({ content: 'b' })
    await vi.advanceTimersByTimeAsync(500)
    await w.checkNow()
    expect(onChange).not.toHaveBeenCalled()
  })
})
