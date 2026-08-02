import { describe, it, expect } from 'vitest'
import { stripCodeFence, extractDsl } from './dsl'

describe('stripCodeFence', () => {
  it('removes a ```dsl fence', () => {
    expect(stripCodeFence('```dsl\nworkspace {}\n```')).toBe('workspace {}')
  })

  it('removes a bare ``` fence', () => {
    expect(stripCodeFence('```\nhello\n```')).toBe('hello')
  })

  it('leaves unfenced text untouched (trimmed)', () => {
    expect(stripCodeFence('  workspace {}  ')).toBe('workspace {}')
  })
})

describe('extractDsl', () => {
  it('pulls the workspace block out of preamble + fence', () => {
    const resp = 'Here is your model:\n```dsl\nworkspace "X" {\n  model {}\n}\n```\nHope it helps!'
    expect(extractDsl(resp)).toBe('workspace "X" {\n  model {}\n}')
  })

  it('handles nested braces correctly', () => {
    const dsl = 'workspace {\n  model {\n    a = person "A"\n  }\n}'
    expect(extractDsl('prose\n' + dsl + '\nmore prose')).toBe(dsl)
  })

  it('returns fence-stripped text when no workspace keyword present', () => {
    expect(extractDsl('```\njust text\n```')).toBe('just text')
  })

  it('returns from workspace onward when braces are unbalanced', () => {
    expect(extractDsl('workspace "X" {\n  model {')).toContain('workspace "X" {')
  })

  it('ignores braces inside quoted string literals', () => {
    const dsl = 'workspace {\n  model {\n    a = person "Name with a } brace" "uses { and } in desc"\n  }\n}'
    expect(extractDsl('prose\n' + dsl + '\ntrailing prose')).toBe(dsl)
  })

  it('anchors on the workspace declaration, not a prose mention of the word', () => {
    const dsl = 'workspace "X" {\n  model {}\n}'
    expect(extractDsl('Here is your workspace:\n```dsl\n' + dsl + '\n```')).toBe(dsl)
    expect(extractDsl('I built a workspace for you. workspace {\n  model {}\n}')).toBe('workspace {\n  model {}\n}')
  })

  it('ignores braces inside // and # comments', () => {
    const dsl = 'workspace {\n  // returns a map {key: value}\n  model {\n    a = person "A"\n  }\n  # TODO: close } the loop\n}'
    expect(extractDsl(dsl + '\nafter')).toBe(dsl)
  })

  it('ignores braces inside /* */ block comments', () => {
    const dsl = 'workspace {\n  /* a brace } here */\n  model {}\n}'
    expect(extractDsl(dsl + '\nmore')).toBe(dsl)
  })

  it('treats a backslash before a quote the way the lexer does (consume-one)', () => {
    // In `"see \\"manual\\""` the first backslash is literal and the second
    // escapes the quote, so the string continues to the final quote. A
    // two-char-per-backslash scanner would end the string early and
    // miscount the braces that follow.
    const dsl = 'workspace {\n  model {\n    a = person "A" "see \\\\"manual\\\\""\n  }\n}'
    expect(extractDsl(dsl + '\ntrailing prose')).toBe(dsl)
  })

  it('anchor regex agrees with the lexer about a workspace name ending in backslashes', () => {
    // `workspace "net\\" {` — per the consume-one rule the string swallows
    // the quote and the brace, so there is no well-formed declaration to
    // anchor on. extractDsl must fall back to returning everything (letting
    // the parser report the real error), not pretend it found a block.
    const text = 'workspace "net\\\\" {\n  model {\n    a = person "A"\n  }\n}\ntrailing prose'
    expect(extractDsl(text)).toBe(text)
  })

  it('ignores a brace inside a mid-line # comment, like the lexer does', () => {
    const dsl = 'workspace {\n  model {\n    a = person "A" # persona {details}\n  }\n}'
    expect(extractDsl(dsl + '\nafter')).toBe(dsl)
  })

  it('does not treat a hex color as a # comment', () => {
    const dsl = 'workspace {\n  views {\n    styles {\n      element "X" {\n        background #ffffff\n      }\n    }\n  }\n}'
    expect(extractDsl(dsl + '\nmore')).toBe(dsl)
  })

  it('agrees with the lexer that a trailing backslash swallows the closing quote', () => {
    // `"path C:\\"` is the GH #109 case: the tokenizer reads the first
    // backslash as literal and `\"` as an escaped quote, so the string never
    // closes and the block is unbalanced. extractDsl must fall back to
    // returning everything rather than pretending the block closed.
    const dsl = 'workspace {\n  model {\n    a = person "A" "path C:\\\\"\n  }\n}'
    expect(extractDsl(dsl + '\ntrailing')).toBe(dsl + '\ntrailing')
  })

  it('does not let a brace in a description truncate the block', () => {
    const dsl = 'workspace "X" {\n  model {\n    s = softwareSystem "S" "Emits a } then continues"\n  }\n}'
    // Without string-awareness the first "}" inside the description would close
    // the workspace early and drop the rest.
    expect(extractDsl(dsl + '\nmore prose')).toBe(dsl)
  })
})
