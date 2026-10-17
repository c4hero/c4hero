import { describe, it, expect, beforeEach } from 'vitest'
import {
  captureSelfWrite, withSelfWriteDestination, recordSelfDslWrite, recordSelfSidecarWrite,
  recordSelfWrite, isSelfWrite, suppressSnapshot, resetSaveCoordinator, beginSelfWrite, isSelfWritePending, startWatchingDestination,
} from './saveCoordinator'
import { hashSnapshot } from './fileWatch'

describe('saveCoordinator', () => {
  beforeEach(() => resetSaveCoordinator())

  it('recognises exactly what was written', () => {
    recordSelfWrite('dsl-1', 'side-1')
    expect(isSelfWrite(hashSnapshot({ content: 'dsl-1', sidecarJson: 'side-1' }), null)).toBe(true)
    expect(isSelfWrite(hashSnapshot({ content: 'dsl-2', sidecarJson: 'side-1' }), null)).toBe(false)
  })

  it('accepts a half-written pair when the other half is unchanged from the baseline', () => {
    const previous = hashSnapshot({ content: 'dsl-0', sidecarJson: 'side-0' })
    recordSelfWrite('dsl-1', 'side-1')
    // DSL landed, sidecar not yet: sidecar still equals the baseline.
    expect(isSelfWrite(hashSnapshot({ content: 'dsl-1', sidecarJson: 'side-0' }), previous)).toBe(true)
    // The sidecar arrives after the DSL acknowledgement. The DSL is now
    // explained by the updated baseline rather than a historical marker.
    expect(isSelfWrite(hashSnapshot({ content: 'dsl-1', sidecarJson: 'side-1' }),
      hashSnapshot({ content: 'dsl-1', sidecarJson: 'side-0' }))).toBe(true)
    // Both differ and neither was ours: external.
    expect(isSelfWrite(hashSnapshot({ content: 'dsl-9', sidecarJson: 'side-9' }), previous)).toBe(false)
  })

  it('an external DSL edit next to our own sidecar is still external', () => {
    const previous = hashSnapshot({ content: 'dsl-0', sidecarJson: 'side-0' })
    recordSelfWrite('dsl-0', 'side-1')
    expect(isSelfWrite(hashSnapshot({ content: 'edited', sidecarJson: 'side-1' }), previous)).toBe(false)
  })

  it('treats "no sidecar on disk" as matching a workspace saved without one', () => {
    recordSelfWrite('dsl-1', undefined)
    expect(isSelfWrite(hashSnapshot({ content: 'dsl-1' }), null)).toBe(true)
  })

  it('suppressSnapshot makes that exact on-disk state count as ours', () => {
    const theirs = hashSnapshot({ content: 'theirs', sidecarJson: '' })
    expect(isSelfWrite(theirs, null)).toBe(false)
    suppressSnapshot(theirs)
    expect(isSelfWrite(theirs, null)).toBe(true)
    // A further external edit is not covered by the suppression.
    expect(isSelfWrite(hashSnapshot({ content: 'theirs-2' }), theirs)).toBe(false)
  })

  it('only remembers the latest successful bytes for each file', () => {
    for (let i = 0; i < 40; i++) recordSelfWrite(`dsl-${i}`, `side-${i}`)
    expect(isSelfWrite(hashSnapshot({ content: 'dsl-39', sidecarJson: 'side-39' }), null)).toBe(true)
    expect(isSelfWrite(hashSnapshot({ content: 'dsl-38', sidecarJson: 'side-38' }), null)).toBe(false)
  })

  it('recognises the sidecar arriving before the DSL', () => {
    const previous = hashSnapshot({ content: 'dsl-0', sidecarJson: 'side-0' })
    recordSelfWrite('dsl-1', 'side-1')
    const partial = hashSnapshot({ content: 'dsl-0', sidecarJson: 'side-1' })
    expect(isSelfWrite(partial, previous)).toBe(true)
    expect(isSelfWrite(hashSnapshot({ content: 'dsl-1', sidecarJson: 'side-1' }), partial)).toBe(true)
  })

  it('does not hide an external restore of previously observed self-written bytes', () => {
    const initial = hashSnapshot({ content: 'original' })
    recordSelfWrite('first')
    const first = hashSnapshot({ content: 'first' })
    expect(isSelfWrite(first, initial)).toBe(true)
    recordSelfWrite('second')
    const second = hashSnapshot({ content: 'second' })
    expect(isSelfWrite(second, first)).toBe(true)
    expect(isSelfWrite(first, second)).toBe(false)
  })

  it('does not hide an external restore of a superseded write which polling never saw', () => {
    recordSelfWrite('first')
    recordSelfWrite('second')
    expect(isSelfWrite(hashSnapshot({ content: 'first' }), hashSnapshot({ content: 'original' }))).toBe(false)
  })

  it('discards unobserved expectations and queued tokens on an external change', () => {
    const queued = captureSelfWrite()
    recordSelfWrite('first')
    const external = hashSnapshot({ content: 'external' })
    expect(isSelfWrite(external, hashSnapshot({ content: 'original' }))).toBe(false)
    recordSelfDslWrite('queued', queued)
    expect(isSelfWrite(hashSnapshot({ content: 'queued' }), external)).toBe(false)
  })

  it('keeps queued tokens valid when an earlier self-write is acknowledged', () => {
    const queued = captureSelfWrite()
    recordSelfDslWrite('new-dsl', queued)
    const partial = hashSnapshot({ content: 'new-dsl', sidecarJson: 'old-sidecar' })
    expect(isSelfWrite(partial, hashSnapshot({ content: 'old-dsl', sidecarJson: 'old-sidecar' }))).toBe(true)
    recordSelfSidecarWrite('new-sidecar', queued)
    expect(isSelfWrite(hashSnapshot({ content: 'new-dsl', sidecarJson: 'new-sidecar' }), partial)).toBe(true)
  })

  it('rejects a completion from the previous watcher generation', () => {
    const token = captureSelfWrite()
    resetSaveCoordinator()
    recordSelfDslWrite('old-save', token)
    expect(isSelfWrite(hashSnapshot({ content: 'old-save' }), hashSnapshot({ content: 'new-file' }))).toBe(false)
  })

  it('only remembers writes to the watched file in a folder', () => {
    const handle = {} as FileSystemDirectoryHandle
    resetSaveCoordinator({ kind: 'folder', handle, filename: 'root.dsl' })
    recordSelfDslWrite('fragment', captureSelfWrite({ kind: 'folder', handle, filename: 'fragment.dsl' }))
    recordSelfDslWrite('other-folder', captureSelfWrite({ kind: 'folder', handle: {} as FileSystemDirectoryHandle, filename: 'root.dsl' }))
    const token = withSelfWriteDestination(captureSelfWrite(), { kind: 'folder', handle, filename: 'root.dsl' })
    recordSelfDslWrite('root', token)
    expect(isSelfWrite(hashSnapshot({ content: 'root' }), hashSnapshot({ content: 'original' }))).toBe(true)
    expect(isSelfWrite(hashSnapshot({ content: 'fragment' }), hashSnapshot({ content: 'root' }))).toBe(false)
  })

  it('only defers the watcher for an active write to its own destination', () => {
    const handle = {} as FileSystemDirectoryHandle
    resetSaveCoordinator({ kind: 'folder', handle, filename: 'root.dsl' })
    const finishOther = beginSelfWrite(captureSelfWrite({ kind: 'folder', handle, filename: 'other.dsl' }))
    expect(isSelfWritePending()).toBe(false)
    const finishRoot = beginSelfWrite(captureSelfWrite({ kind: 'folder', handle, filename: 'root.dsl' }))
    expect(isSelfWritePending()).toBe(true)
    finishRoot()
    finishOther()
    expect(isSelfWritePending()).toBe(false)
  })

  it('does not let an old active operation defer a new watcher generation', () => {
    const finish = beginSelfWrite(captureSelfWrite())
    expect(isSelfWritePending()).toBe(true)
    resetSaveCoordinator()
    expect(isSelfWritePending()).toBe(false)
    finish()
    expect(isSelfWritePending()).toBe(false)
  })

  it('adopts a matching active save when its file first becomes watchable', () => {
    const handle = {} as FileSystemFileHandle
    const token = captureSelfWrite({ kind: 'file', handle })
    const finish = beginSelfWrite(token)
    startWatchingDestination({ kind: 'file', handle })
    expect(isSelfWritePending()).toBe(true)
    recordSelfDslWrite('saved', token)
    finish()
    expect(isSelfWrite(hashSnapshot({ content: 'saved' }), hashSnapshot({ content: 'original' }))).toBe(true)
  })

  it('does not adopt a foreign save when a different file first becomes watchable', () => {
    const finish = beginSelfWrite(captureSelfWrite({ kind: 'file', handle: {} as FileSystemFileHandle }))
    startWatchingDestination({ kind: 'file', handle: {} as FileSystemFileHandle })
    expect(isSelfWritePending()).toBe(false)
    finish()
  })
})
