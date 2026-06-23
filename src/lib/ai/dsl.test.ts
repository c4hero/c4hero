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
})
