import { describe, it, expect } from 'vitest'
import { deriveIdFromName, uniqueDerivedId, validateElementId, isReservedIdentifier, IDENTIFIER_PATTERN } from './identifier'

describe('deriveIdFromName', () => {
  it('camelCases multi-word names', () => {
    expect(deriveIdFromName('Payment Service')).toBe('paymentService')
    expect(deriveIdFromName('Internet Banking System')).toBe('internetBankingSystem')
  })

  it('lowercases all-caps acronym words', () => {
    expect(deriveIdFromName('API Gateway')).toBe('apiGateway')
    expect(deriveIdFromName('API')).toBe('api')
  })

  it('keeps digits and splits on punctuation', () => {
    expect(deriveIdFromName('API Gateway 2')).toBe('apiGateway2')
    expect(deriveIdFromName('e-mail/queue')).toBe('eMailQueue')
  })

  it('prefixes a leading digit', () => {
    expect(deriveIdFromName('3rd Party Feed')).toBe('e3rdPartyFeed')
  })

  it('strips diacritics', () => {
    expect(deriveIdFromName('Café Menü')).toBe('cafeMenu')
  })

  it('falls back to "element" when nothing survives', () => {
    expect(deriveIdFromName('***')).toBe('element')
    expect(deriveIdFromName('')).toBe('element')
  })

  it('suffixes names that collapse to a DSL keyword', () => {
    expect(deriveIdFromName('Container')).toBe('container_')
    expect(deriveIdFromName('This')).toBe('this_')
  })

  it('always yields a valid identifier', () => {
    for (const name of ['Payment Service', '3rd Party', '***', 'Café', 'a b c 9', 'MODEL']) {
      expect(deriveIdFromName(name)).toMatch(IDENTIFIER_PATTERN)
    }
  })
})

describe('uniqueDerivedId', () => {
  it('returns the base when free', () => {
    expect(uniqueDerivedId('api', () => false)).toBe('api')
  })

  it('suffixes from 2 upward on collision', () => {
    const taken = new Set(['api', 'api2'])
    expect(uniqueDerivedId('api', (id) => taken.has(id))).toBe('api3')
  })
})

describe('validateElementId', () => {
  const noneTaken = () => false

  it('accepts plain identifiers', () => {
    expect(validateElementId('paymentService', noneTaken)).toBeNull()
    expect(validateElementId('_internal', noneTaken)).toBeNull()
    expect(validateElementId('a2', noneTaken)).toBeNull()
  })

  it('rejects empty, malformed, and digit-leading ids', () => {
    expect(validateElementId('', noneTaken)).toBeTruthy()
    expect(validateElementId('has space', noneTaken)).toBeTruthy()
    expect(validateElementId('has-hyphen', noneTaken)).toBeTruthy()
    expect(validateElementId('2fast', noneTaken)).toBeTruthy()
  })

  it('rejects DSL keywords case-insensitively', () => {
    expect(validateElementId('person', noneTaken)).toBeTruthy()
    expect(validateElementId('SoftwareSystem', noneTaken)).toBeTruthy()
    expect(validateElementId('this', noneTaken)).toBeTruthy()
    expect(isReservedIdentifier('Views')).toBe(true)
  })

  it('rejects taken ids', () => {
    expect(validateElementId('api', (id) => id === 'api')).toBeTruthy()
  })
})
