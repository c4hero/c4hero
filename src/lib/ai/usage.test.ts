import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  recordAiCall, recordAiTokens, resetAiUsage, getAiUsage, subscribeAiUsage,
} from './usage'

describe('ai usage meter', () => {
  beforeEach(() => resetAiUsage())

  it('starts at zero', () => {
    expect(getAiUsage()).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, measuredCalls: 0 })
  })

  it('counts calls', () => {
    recordAiCall()
    recordAiCall()
    expect(getAiUsage().calls).toBe(2)
  })

  it('sums token usage and counts measured calls', () => {
    recordAiTokens(100, 20)
    recordAiTokens(50, 10)
    const u = getAiUsage()
    expect(u.inputTokens).toBe(150)
    expect(u.outputTokens).toBe(30)
    expect(u.measuredCalls).toBe(2)
  })

  it('ignores empty token deltas (does not inflate measuredCalls)', () => {
    recordAiTokens(0, 0)
    expect(getAiUsage().measuredCalls).toBe(0)
  })

  it('reset returns to zero and notifies subscribers', () => {
    const spy = vi.fn()
    const off = subscribeAiUsage(spy)
    recordAiCall()
    recordAiTokens(5, 5)
    resetAiUsage()
    expect(getAiUsage().calls).toBe(0)
    expect(spy).toHaveBeenCalled()
    off()
  })

  it('unsubscribed listeners stop firing', () => {
    const spy = vi.fn()
    const off = subscribeAiUsage(spy)
    off()
    recordAiCall()
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns a stable reference between changes (safe snapshot source)', () => {
    const a = getAiUsage()
    const b = getAiUsage()
    expect(a).toBe(b)
    recordAiCall()
    expect(getAiUsage()).not.toBe(a)
  })
})
