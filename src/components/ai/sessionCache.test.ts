/** @vitest-environment jsdom */
import { renderHook, act } from '@testing-library/react'
import { usePersistentState, clearAiSession, ensureSessionForWorkspace } from './sessionCache'

beforeEach(() => clearAiSession())

describe('usePersistentState', () => {
  it('restores the value on a fresh mount (survives unmount)', () => {
    const a = renderHook(() => usePersistentState('k', 'initial'))
    act(() => a.result.current[1]('edited'))
    expect(a.result.current[0]).toBe('edited')
    a.unmount()

    // A new mount with the same key resumes where we left off.
    const b = renderHook(() => usePersistentState('k', 'initial'))
    expect(b.result.current[0]).toBe('edited')
  })

  it('supports updater functions', () => {
    const { result } = renderHook(() => usePersistentState<number>('n', 1))
    act(() => result.current[1]((p) => p + 4))
    expect(result.current[0]).toBe(5)
  })

  it('falls back to the initial when nothing is cached', () => {
    const { result } = renderHook(() => usePersistentState('fresh', 'init'))
    expect(result.current[0]).toBe('init')
  })
})

describe('clearAiSession', () => {
  it('clears only the keys under a prefix', () => {
    renderHook(() => usePersistentState('sweep.queue', 'x'))
    const inter = renderHook(() => usePersistentState('interview.history', 'y'))
    act(() => inter.result.current[1]('kept'))
    clearAiSession('sweep')
    // sweep.* is gone (a fresh mount sees the initial)…
    const sweep = renderHook(() => usePersistentState('sweep.queue', 'default'))
    expect(sweep.result.current[0]).toBe('default')
    // …interview.* is untouched.
    const inter2 = renderHook(() => usePersistentState('interview.history', 'default'))
    expect(inter2.result.current[0]).toBe('kept')
  })
})

describe('ensureSessionForWorkspace', () => {
  it('drops the cache when the workspace name changes', () => {
    ensureSessionForWorkspace('Model A')
    const a = renderHook(() => usePersistentState('view', 'home'))
    act(() => a.result.current[1]('wizard'))

    // Same workspace → cache preserved.
    ensureSessionForWorkspace('Model A')
    expect(renderHook(() => usePersistentState('view', 'home')).result.current[0]).toBe('wizard')

    // Different workspace → cache cleared, back to the initial.
    ensureSessionForWorkspace('Model B')
    expect(renderHook(() => usePersistentState('view', 'home')).result.current[0]).toBe('home')
  })
})
