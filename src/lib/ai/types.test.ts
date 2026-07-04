import { describe, it, expect } from 'vitest'
import { AiError, aiErrorMessage } from './types'

describe('AiError', () => {
  it('carries a kind and message and is an Error', () => {
    const err = new AiError('rate-limit', 'slow down')
    expect(err).toBeInstanceOf(Error)
    expect(err.kind).toBe('rate-limit')
    expect(err.message).toBe('slow down')
    expect(err.name).toBe('AiError')
  })
})

describe('aiErrorMessage', () => {
  it('maps each AiError kind to a friendly message', () => {
    expect(aiErrorMessage(new AiError('auth', 'x'))).toMatch(/API key/i)
    expect(aiErrorMessage(new AiError('auth', 'x'))).not.toMatch(/Anthropic/i)
    expect(aiErrorMessage(new AiError('rate-limit', 'x'))).toMatch(/rate limit/i)
    expect(aiErrorMessage(new AiError('network', 'x'))).toMatch(/server error/i)
    expect(aiErrorMessage(new AiError('invalid-response', 'x'))).toMatch(/unexpected/i)
  })

  it('passes through the message for connection and unknown kinds', () => {
    expect(aiErrorMessage(new AiError('connection', 'blocked before it left'))).toBe('blocked before it left')
    expect(aiErrorMessage(new AiError('unknown', 'odd failure'))).toBe('odd failure')
    // unknown with an empty message falls back to a generic line
    expect(aiErrorMessage(new AiError('unknown', ''))).toMatch(/went wrong/i)
  })

  it('handles plain Errors and non-Error values', () => {
    expect(aiErrorMessage(new Error('plain'))).toBe('plain')
    expect(aiErrorMessage('a string')).toMatch(/went wrong/i)
    expect(aiErrorMessage(null)).toMatch(/went wrong/i)
  })
})
