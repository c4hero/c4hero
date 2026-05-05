import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadViewport, saveViewport } from './viewportStorage'

describe('viewportStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('round-trips a saved viewport', () => {
    saveViewport('Workspace', 'context', { x: 12, y: -8, zoom: 1.25 })
    expect(loadViewport('Workspace', 'context')).toEqual({ x: 12, y: -8, zoom: 1.25 })
  })

  it('keeps workspace/view keys isolated', () => {
    saveViewport('A', 'context', { x: 1, y: 2, zoom: 1 })
    saveViewport('B', 'context', { x: 3, y: 4, zoom: 2 })
    expect(loadViewport('A', 'context')).toEqual({ x: 1, y: 2, zoom: 1 })
    expect(loadViewport('B', 'context')).toEqual({ x: 3, y: 4, zoom: 2 })
  })

  it('returns null for malformed JSON', () => {
    localStorage.setItem('c4hero.viewport.Workspace.context', '{broken')
    expect(loadViewport('Workspace', 'context')).toBeNull()
  })

  it('rejects non-finite coordinates and non-positive zoom', () => {
    const key = 'c4hero.viewport.Workspace.context'

    localStorage.setItem(key, JSON.stringify({ x: Number.NaN, y: 0, zoom: 1 }))
    expect(loadViewport('Workspace', 'context')).toBeNull()

    localStorage.setItem(key, JSON.stringify({ x: 0, y: Infinity, zoom: 1 }))
    expect(loadViewport('Workspace', 'context')).toBeNull()

    localStorage.setItem(key, JSON.stringify({ x: 0, y: 0, zoom: 0 }))
    expect(loadViewport('Workspace', 'context')).toBeNull()
  })

  it('does not throw when storage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => saveViewport('Workspace', 'context', { x: 0, y: 0, zoom: 1 })).not.toThrow()
  })
})
