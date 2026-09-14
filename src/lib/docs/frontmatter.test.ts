import { describe, expect, it } from 'vitest'
import { asList, firstString, parseFrontmatter, serializeFrontmatter } from './frontmatter'

describe('parseFrontmatter', () => {
  it('returns the whole text as body when there is no block', () => {
    const doc = parseFrontmatter('# Hello\n\nbody')
    expect(doc.hasFrontmatter).toBe(false)
    expect(doc.frontmatter).toEqual({})
    expect(doc.body).toBe('# Hello\n\nbody')
  })

  it('reads scalars, quoted scalars and inline lists', () => {
    const doc = parseFrontmatter([
      '---',
      'type: Decision',
      'title: "Use \\"Postgres\\""',
      "description: 'It''s fine'",
      'status: Accepted # trailing comment',
      'tags: [db, "data store", \'x\']',
      'empty: []',
      'timestamp: 2026-09-13T00:00:00Z',
      '---',
      '',
      '# Body',
    ].join('\n'))
    expect(doc.hasFrontmatter).toBe(true)
    expect(doc.frontmatter).toEqual({
      type: 'Decision',
      title: 'Use "Postgres"',
      description: "It's fine",
      status: 'Accepted',
      tags: ['db', 'data store', 'x'],
      empty: [],
      timestamp: '2026-09-13T00:00:00Z',
    })
    expect(doc.body).toBe('\n# Body')
  })

  it('is permissive: skips block maps, comments, blank lines and odd keys', () => {
    const doc = parseFrontmatter([
      '---',
      '# a comment',
      'type: Note',
      'properties:',
      '  owner: team',
      '',
      'not a key',
      'bad key!: x',
      'empty:',
      '---',
      'text',
    ].join('\n'))
    expect(doc.frontmatter).toEqual({ type: 'Note' })
    expect(doc.body).toBe('text')
  })

  it('handles CRLF files', () => {
    const doc = parseFrontmatter('---\r\ntype: X\r\n---\r\nbody\r\n')
    expect(doc.frontmatter).toEqual({ type: 'X' })
    expect(doc.body).toBe('body\r\n')
  })

  it('accepts an empty block and a leading BOM', () => {
    expect(parseFrontmatter('---\n---\nbody\n')).toEqual({ frontmatter: {}, hasFrontmatter: true, body: 'body\n' })
    expect(parseFrontmatter('\uFEFF---\ntype: X\n---\nbody')).toMatchObject({ frontmatter: { type: 'X' }, body: 'body' })
  })

  it('does not treat a --- further down as frontmatter', () => {
    const doc = parseFrontmatter('intro\n---\ntype: X\n---\n')
    expect(doc.hasFrontmatter).toBe(false)
  })
})

describe('serializeFrontmatter', () => {
  it('quotes every scalar, renders lists inline, and omits empty values', () => {
    expect(serializeFrontmatter({ type: 'Decision', title: 'A "quoted" title', tags: ['a', 'b'], none: undefined, blank: '', empty: [] }))
      .toBe('---\ntype: "Decision"\ntitle: "A \\"quoted\\" title"\ntags: ["a", "b"]\n---')
  })

  it('round-trips through the parser', () => {
    const fields = { type: 'Documentation', title: 'Ünïcode: yes', tags: ['x, y', 'z'] }
    expect(parseFrontmatter(`${serializeFrontmatter(fields)}\nbody`).frontmatter).toEqual(fields)
  })
})

describe('helpers', () => {
  it('firstString and asList normalise scalar vs list values', () => {
    expect(firstString(undefined)).toBeUndefined()
    expect(firstString('a')).toBe('a')
    expect(firstString(['a', 'b'])).toBe('a')
    expect(asList(undefined)).toEqual([])
    expect(asList('a')).toEqual(['a'])
    expect(asList(['a'])).toEqual(['a'])
  })
})
