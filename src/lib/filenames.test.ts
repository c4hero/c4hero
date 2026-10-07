import { describe, expect, it } from 'vitest'
import { safeSuggestedDslName, sanitizeFilename } from './filenames'

describe('sanitizeFilename', () => {
  it('replaces path separators, control characters, and reserved characters', () => {
    expect(sanitizeFilename('../CON.dsl')).toBe('__CON.dsl')
    expect(sanitizeFilename('line\nbreak.dsl')).toBe('line_break.dsl')
    expect(sanitizeFilename('a:b*c?d"e<f>g|h.json')).toBe('a_b_c_d_e_f_g_h.json')
  })

  it('handles blank, hidden, reserved, and long filenames safely', () => {
    expect(sanitizeFilename('...')).toBe('download')
    expect(sanitizeFilename('...hidden.txt')).toBe('_hidden.txt')
    expect(sanitizeFilename('CON.dsl')).toBe('_CON.dsl')
    expect(sanitizeFilename(`${'a'.repeat(220)}.dsl`)).toHaveLength(180)
  })

  it('handles long runs of dots and spaces both inside and at the end of a filename', () => {
    const run = '. '.repeat(100_000)
    // A final non-matching character must keep the run; the filename limit
    // then applies. Retrying a suffix regex across this run takes quadratic time.
    expect(sanitizeFilename(`a${run}b`)).toBe(`a${run}`.slice(0, 180))
    expect(sanitizeFilename(`architecture.dsl${run}`)).toBe('architecture.dsl')
  })
})

describe('safeSuggestedDslName', () => {
  it('falls back to workspace.dsl when a suggested name has no usable filename', () => {
    expect(safeSuggestedDslName('...')).toBe('workspace.dsl')
  })

  it('sanitizes valid suggestions without changing their extension', () => {
    expect(safeSuggestedDslName('../CON.dsl')).toBe('__CON.dsl')
  })

  it('adds the DSL extension when a suggestion omits it', () => {
    expect(safeSuggestedDslName('workspace')).toBe('workspace.dsl')
  })
})
