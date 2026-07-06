import { describe, it, expect } from 'vitest'
import { parseBlocks } from './markdownBlocks'

describe('parseBlocks', () => {
  it('splits paragraphs on blank lines and keeps soft-wrapped lines together', () => {
    expect(parseBlocks('One line.\nStill one.\n\nTwo.')).toEqual([
      { t: 'p', lines: ['One line.', 'Still one.'] },
      { t: 'p', lines: ['Two.'] },
    ])
  })

  it('collects *, - and • bullets into one list', () => {
    expect(parseBlocks('Intro:\n* a\n- b\n• c')).toEqual([
      { t: 'p', lines: ['Intro:'] },
      { t: 'ul', items: ['a', 'b', 'c'] },
    ])
  })

  it('parses numbered lists with . and ) markers', () => {
    expect(parseBlocks('1. first\n2) second')).toEqual([
      { t: 'ol', items: ['first', 'second'] },
    ])
  })

  it('parses headings with their level', () => {
    expect(parseBlocks('## Section\nBody')).toEqual([
      { t: 'h', level: 2, text: 'Section' },
      { t: 'p', lines: ['Body'] },
    ])
  })

  it('captures fenced code verbatim, tolerating a missing closing fence (streaming)', () => {
    expect(parseBlocks('```dsl\ncontainer "API"\n```\nafter')).toEqual([
      { t: 'code', lines: ['container "API"'] },
      { t: 'p', lines: ['after'] },
    ])
    expect(parseBlocks('```\npartial')).toEqual([
      { t: 'code', lines: ['partial'] },
    ])
  })

  it('returns nothing for empty/whitespace input', () => {
    expect(parseBlocks('')).toEqual([])
    expect(parseBlocks('  \n\n')).toEqual([])
  })
})
