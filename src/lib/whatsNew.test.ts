import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { unseenRelease, dismissRelease, type WhatsNewRelease } from './whatsNew'

const KEY = 'c4hero.whatsNewDismissed'

const release: WhatsNewRelease = {
  id: '2026-09-01-test',
  date: 'September 1, 2026',
  items: [{ title: 'Thing', body: 'Does stuff.' }],
}

beforeEach(() => {
  localStorage.clear()
  // Most cases test the enabled behavior; the opt-in default gets its own suite.
  vi.stubEnv('VITE_WHATS_NEW', '1')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('build-time opt-in (VITE_WHATS_NEW)', () => {
  it('is disabled by default: no pill, and storage is never touched', () => {
    vi.unstubAllEnvs()
    localStorage.setItem(KEY, 'some-older-release')
    expect(unseenRelease(release)).toBeNull()
    // No first-launch seeding either — flipping the flag on later starts clean.
    localStorage.clear()
    expect(unseenRelease(release)).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('accepts "true" as well as "1"', () => {
    vi.stubEnv('VITE_WHATS_NEW', 'true')
    localStorage.setItem(KEY, 'some-older-release')
    expect(unseenRelease(release)).toBe(release)
  })

  it('any other value stays disabled', () => {
    vi.stubEnv('VITE_WHATS_NEW', 'on')
    localStorage.setItem(KEY, 'some-older-release')
    expect(unseenRelease(release)).toBeNull()
  })
})

describe('unseenRelease', () => {
  it('returns null when there is no release (feature dormant)', () => {
    expect(unseenRelease(null)).toBeNull()
  })

  it('returns null for a release with no items', () => {
    expect(unseenRelease({ ...release, items: [] })).toBeNull()
  })

  it('seeds first-ever launch silently: nothing shown, id stored', () => {
    expect(unseenRelease(release)).toBeNull()
    expect(localStorage.getItem(KEY)).toBe(release.id)
  })

  it('returns the release when a DIFFERENT id was dismissed', () => {
    localStorage.setItem(KEY, 'some-older-release')
    expect(unseenRelease(release)).toBe(release)
    // Peeking must not mark it seen — only dismissal does.
    expect(localStorage.getItem(KEY)).toBe('some-older-release')
  })

  it('returns null when the SAME id was already dismissed', () => {
    localStorage.setItem(KEY, release.id)
    expect(unseenRelease(release)).toBeNull()
  })

  it('fails closed when localStorage throws', () => {
    localStorage.setItem(KEY, 'some-older-release')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(unseenRelease(release)).toBeNull()
  })
})

describe('dismissRelease', () => {
  it('stores the id so the release never shows again', () => {
    localStorage.setItem(KEY, 'some-older-release')
    expect(unseenRelease(release)).toBe(release)
    dismissRelease(release)
    expect(unseenRelease(release)).toBeNull()
  })

  it('swallows storage errors', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => dismissRelease(release)).not.toThrow()
  })
})
