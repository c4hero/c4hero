import { describe, it, expect } from 'vitest'
import { appendDictation } from './useDictation'

describe('appendDictation', () => {
  it('returns the chunk when the field is empty', () => {
    expect(appendDictation('', 'hello world')).toBe('hello world')
  })

  it('inserts a space between existing text and the new chunk', () => {
    expect(appendDictation('add a', 'redis cache')).toBe('add a redis cache')
  })

  it('does not double-space when the field already ends in whitespace', () => {
    expect(appendDictation('add a ', 'cache')).toBe('add a cache')
  })

  it('trims the chunk and ignores blank input', () => {
    expect(appendDictation('hi', '  there  ')).toBe('hi there')
    expect(appendDictation('hi', '   ')).toBe('hi')
  })
})
