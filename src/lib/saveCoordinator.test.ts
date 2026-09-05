import { describe, it, expect, beforeEach } from 'vitest'
import { recordSelfWrite, isSelfWrite, suppressSnapshot, resetSaveCoordinator } from './saveCoordinator'
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
    // Sidecar landed first.
    expect(isSelfWrite(hashSnapshot({ content: 'dsl-0', sidecarJson: 'side-1' }), previous)).toBe(true)
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

  it('remembers a bounded number of recent writes', () => {
    for (let i = 0; i < 40; i++) recordSelfWrite(`dsl-${i}`, `side-${i}`)
    expect(isSelfWrite(hashSnapshot({ content: 'dsl-39', sidecarJson: 'side-39' }), null)).toBe(true)
    expect(isSelfWrite(hashSnapshot({ content: 'dsl-0', sidecarJson: 'side-0' }), null)).toBe(false)
  })
})
