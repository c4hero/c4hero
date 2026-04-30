import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { announce } from './announce'

describe('announce', () => {
  let liveRegion: HTMLElement

  beforeEach(() => {
    liveRegion = document.createElement('div')
    liveRegion.id = 'c4hero-live'
    liveRegion.setAttribute('aria-live', 'polite')
    document.body.appendChild(liveRegion)

    // Run requestAnimationFrame callbacks synchronously in tests so we can
    // observe the message without waiting for a real frame.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0 })
  })

  afterEach(() => {
    liveRegion.remove()
    vi.restoreAllMocks()
  })

  it('sets the live region text to the given message', () => {
    announce('Element created')
    expect(liveRegion.textContent).toBe('Element created')
  })

  it('clears the live region before setting new text so assistive tech re-announces', () => {
    // Prime with existing content
    liveRegion.textContent = 'Previous message'
    const values: string[] = []

    // Stub RAF to capture both the pre-RAF state and the final state
    ;(window.requestAnimationFrame as unknown as { mockRestore: () => void }).mockRestore()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      values.push(liveRegion.textContent ?? '')
      cb(0)
      return 0
    })

    announce('New message')

    // Before the RAF fired, the live region was cleared.
    expect(values).toEqual([''])
    // After the RAF fired, it holds the new message.
    expect(liveRegion.textContent).toBe('New message')
  })

  it('is a no-op when the live region element is missing', () => {
    liveRegion.remove()
    // Should not throw
    expect(() => announce('No region')).not.toThrow()
  })

  it('accepts an empty string message', () => {
    announce('')
    expect(liveRegion.textContent).toBe('')
  })

  it('overwrites any previous message when called again', () => {
    announce('First')
    announce('Second')
    expect(liveRegion.textContent).toBe('Second')
  })

  it('handles messages with special characters', () => {
    announce('Element "Internet Banking" → created')
    expect(liveRegion.textContent).toBe('Element "Internet Banking" → created')
  })

  it('falls back to a timer when requestAnimationFrame is unavailable', () => {
    ;(window.requestAnimationFrame as unknown as { mockRestore: () => void }).mockRestore()
    const original = window.requestAnimationFrame
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: undefined,
    })
    vi.useFakeTimers()

    try {
      announce('Timer fallback')
      expect(liveRegion.textContent).toBe('')
      vi.runAllTimers()
      expect(liveRegion.textContent).toBe('Timer fallback')
    } finally {
      vi.useRealTimers()
      Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        writable: true,
        value: original,
      })
    }
  })
})
