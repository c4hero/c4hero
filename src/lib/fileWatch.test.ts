import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFileWatcher, hashContent, hashSnapshot, type WatchedSnapshot } from './fileWatch'

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
  beforeEach(() => { vi.useFakeTimers() })
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
