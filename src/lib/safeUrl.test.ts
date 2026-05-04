import { describe, expect, it } from 'vitest'
import { normalizeSafeExternalUrl } from './safeUrl'

describe('normalizeSafeExternalUrl', () => {
  it('allows http and https URLs', () => {
    expect(normalizeSafeExternalUrl('https://example.com/docs')).toBe('https://example.com/docs')
    expect(normalizeSafeExternalUrl('http://example.com/docs')).toBe('http://example.com/docs')
  })

  it('trims surrounding whitespace and normalizes protocol-relative URLs to https', () => {
    expect(normalizeSafeExternalUrl('  https://example.com/docs  ')).toBe('https://example.com/docs')
    expect(normalizeSafeExternalUrl('//example.com/docs')).toBe('https://example.com/docs')
  })

  it('rejects unsafe or non-external schemes', () => {
    expect(normalizeSafeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeSafeExternalUrl('data:text/html,<h1>x</h1>')).toBeNull()
    expect(normalizeSafeExternalUrl('mailto:hello@example.com')).toBeNull()
    expect(normalizeSafeExternalUrl('/relative/path')).toBeNull()
  })

  it('rejects blank and malformed URLs', () => {
    expect(normalizeSafeExternalUrl('')).toBeNull()
    expect(normalizeSafeExternalUrl('not a url')).toBeNull()
  })
})
