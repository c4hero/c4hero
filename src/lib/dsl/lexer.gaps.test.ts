import { describe, it, expect } from 'vitest'
import { lex } from './lexer'

// Coverage-gap tests for the lexer: string escapes, comments, unusual
// tokens, and error positions.

describe('string escape sequences', () => {
  it('decodes \\n, \\t, \\" and \\\\ escapes inside strings', () => {
    const { tokens, errors } = lex('"a\\nb\\tc\\"d\\\\e"')
    expect(errors).toHaveLength(0)
    expect(tokens[0].type).toBe('STRING')
    expect(tokens[0].value).toBe('a\nb\tc"d\\e')
  })

  it('preserves the backslash for unknown escape sequences', () => {
    const { tokens, errors } = lex('"a\\qb"')
    expect(errors).toHaveLength(0)
    expect(tokens[0].value).toBe('a\\qb')
  })

  it('reports an unterminated string with its start position', () => {
    const { tokens, errors } = lex('model "abc')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('Unterminated string literal')
    expect(errors[0].line).toBe(1)
    expect(errors[0].column).toBe(7)
    // The partial value is still tokenized
    const str = tokens.find(t => t.type === 'STRING')
    expect(str?.value).toBe('abc')
  })

  it('handles an unterminated string ending in a backslash without crashing', () => {
    const { errors } = lex('"abc\\')
    expect(errors.some(e => e.message === 'Unterminated string literal')).toBe(true)
  })
})

describe('comments', () => {
  it('tokenizes // line comments up to the newline', () => {
    const { tokens, errors } = lex('// hello world\nmodel')
    expect(errors).toHaveLength(0)
    expect(tokens[0].type).toBe('COMMENT')
    expect(tokens[0].value).toBe('// hello world')
    expect(tokens[1].type).toBe('NEWLINE')
    expect(tokens[2]).toMatchObject({ type: 'KEYWORD', value: 'model' })
  })

  it('tokenizes # line comments', () => {
    const { tokens, errors } = lex('# note')
    expect(errors).toHaveLength(0)
    expect(tokens[0].type).toBe('COMMENT')
    expect(tokens[0].value).toBe('# note')
  })

  it('treats # followed by hex digits as a color identifier, not a comment', () => {
    const { tokens } = lex('#ffffff')
    expect(tokens[0].type).toBe('IDENTIFIER')
    expect(tokens[0].value).toBe('#ffffff')
  })

  it('tokenizes multi-line block comments', () => {
    const { tokens, errors } = lex('/* first\nsecond */ model')
    expect(errors).toHaveLength(0)
    expect(tokens[0].type).toBe('COMMENT')
    expect(tokens[0].value).toBe('/* first\nsecond */')
    expect(tokens[1]).toMatchObject({ type: 'KEYWORD', value: 'model' })
  })

  it('reports an unterminated block comment with its start position', () => {
    const { tokens, errors } = lex('model\n/* oops')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('Unterminated block comment')
    expect(errors[0].line).toBe(2)
    expect(errors[0].column).toBe(1)
    // Everything up to EOF is swallowed into the comment token
    const comment = tokens.find(t => t.type === 'COMMENT')
    expect(comment?.value).toBe('/* oops')
  })

  it('handles a lone /* at end of input without crashing', () => {
    const { errors } = lex('/*')
    expect(errors.some(e => e.message === 'Unterminated block comment')).toBe(true)
  })
})

describe('unexpected characters', () => {
  it('reports the character and its position, then keeps lexing', () => {
    const { tokens, errors } = lex('person @ "Bob"')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe("Unexpected character: '@'")
    expect(errors[0].line).toBe(1)
    expect(errors[0].column).toBe(8)
    // Lexing continues past the bad character
    expect(tokens.map(t => t.type)).toEqual(['KEYWORD', 'STRING', 'EOF'])
  })

  it('tracks line numbers across newlines for error positions', () => {
    const { errors } = lex('model\n  $x')
    expect(errors).toHaveLength(1)
    expect(errors[0].line).toBe(2)
    expect(errors[0].column).toBe(3)
  })
})
