import { describe, expect, it } from 'vitest'
import { normalizeRemoteLogEndpoint } from './remoteLogEndpoint'

describe('normalizeRemoteLogEndpoint', () => {
  const base = 'https://app.c4hero.com/workspace'

  it('returns null when unset or blank', () => {
    expect(normalizeRemoteLogEndpoint(undefined, base)).toBeNull()
    expect(normalizeRemoteLogEndpoint('   ', base)).toBeNull()
  })

  it('allows HTTPS remote endpoints', () => {
    expect(normalizeRemoteLogEndpoint('https://logs.example.com/c4hero', base)).toBe('https://logs.example.com/c4hero')
  })

  it('allows same-origin paths', () => {
    expect(normalizeRemoteLogEndpoint('/api/logs', base)).toBe('https://app.c4hero.com/api/logs')
  })

  it('rejects insecure cross-origin endpoints', () => {
    expect(normalizeRemoteLogEndpoint('http://logs.example.com/c4hero', base)).toBeNull()
  })

  it('rejects non-http schemes', () => {
    expect(normalizeRemoteLogEndpoint('javascript:alert(1)', base)).toBeNull()
    expect(normalizeRemoteLogEndpoint('data:text/plain,hello', base)).toBeNull()
  })
})
