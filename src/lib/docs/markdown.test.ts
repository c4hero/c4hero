import { describe, expect, it } from 'vitest'
import { parseBlocks } from './markdown'

const parse = (text: string) => parseBlocks(text.split('\n'))

describe('parseBlocks', () => {
  it('splits headings, paragraphs and rules', () => {
    expect(parse('# Title\n\nOne\ntwo\n\n---\n\n## Sub ##')).toEqual([
      { kind: 'heading', level: 1, text: 'Title' },
      { kind: 'paragraph', text: 'One two' },
      { kind: 'hr' },
      { kind: 'heading', level: 2, text: 'Sub' },
    ])
  })

  it('keeps fenced code verbatim, with its language', () => {
    expect(parse('```dsl\nworkspace {\n  # not a heading\n}\n```\nafter')).toEqual([
      { kind: 'code', text: 'workspace {\n  # not a heading\n}', lang: 'dsl' },
      { kind: 'paragraph', text: 'after' },
    ])
    expect(parse('~~~\nx\n~~~')).toEqual([{ kind: 'code', text: 'x', lang: undefined }])
  })

  it('reads indented code', () => {
    expect(parse('    a\n    b\n\ntext')).toEqual([
      { kind: 'code', text: 'a\nb' },
      { kind: 'paragraph', text: 'text' },
    ])
  })

  it('nests lists by indentation and distinguishes ordered lists', () => {
    expect(parse('- a\n- b\n  - b1\n  - b2\n- c\n\n1. x\n2) y')).toEqual([
      {
        kind: 'list',
        ordered: false,
        items: [
          [{ kind: 'paragraph', text: 'a' }],
          [{ kind: 'paragraph', text: 'b' }, { kind: 'list', ordered: false, items: [[{ kind: 'paragraph', text: 'b1' }], [{ kind: 'paragraph', text: 'b2' }]] }],
          [{ kind: 'paragraph', text: 'c' }],
        ],
      },
      { kind: 'list', ordered: true, items: [[{ kind: 'paragraph', text: 'x' }], [{ kind: 'paragraph', text: 'y' }]] },
    ])
  })

  it('continues an item across a wrapped line and a blank line between items', () => {
    expect(parse('- first line\n  continued\n\n- second')).toEqual([
      { kind: 'list', ordered: false, items: [[{ kind: 'paragraph', text: 'first line continued' }], [{ kind: 'paragraph', text: 'second' }]] },
    ])
  })

  it('parses blockquotes recursively', () => {
    expect(parse('> # Quoted\n> text\n>\n> - item')).toEqual([
      { kind: 'quote', blocks: [{ kind: 'heading', level: 1, text: 'Quoted' }, { kind: 'paragraph', text: 'text' }, { kind: 'list', ordered: false, items: [[{ kind: 'paragraph', text: 'item' }]] }] },
    ])
  })

  it('parses pipe tables and escaped pipes', () => {
    expect(parse('| A | B |\n|---|:--:|\n| 1 | x \\| y |\n| 2 |')).toEqual([
      { kind: 'table', header: ['A', 'B'], rows: [['1', 'x | y'], ['2']] },
    ])
  })

  it('does not mistake a lone pipe line for a table', () => {
    expect(parse('a | b\nplain')).toEqual([{ kind: 'paragraph', text: 'a | b plain' }])
  })

  it('handles an unterminated fence at EOF', () => {
    expect(parse('```\nopen')).toEqual([{ kind: 'code', text: 'open', lang: undefined }])
  })
})
