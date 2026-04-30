import { describe, it, expect } from 'vitest'
import { isFiniteNumber, isNonEmptyString, isRecord, isRecordOf, isStringArray, isStringRecord } from './guards'

describe('guards', () => {
  it('accepts plain records and rejects null, arrays, and primitives', () => {
    expect(isRecord({ a: 1 })).toBe(true)
    expect(isRecord(null)).toBe(false)
    expect(isRecord([])).toBe(false)
    expect(isRecord('x')).toBe(false)
  })

  it('accepts only finite numbers', () => {
    expect(isFiniteNumber(0)).toBe(true)
    expect(isFiniteNumber(12.5)).toBe(true)
    expect(isFiniteNumber(Number.NaN)).toBe(false)
    expect(isFiniteNumber(Infinity)).toBe(false)
  })

  it('accepts strings with non-whitespace content', () => {
    expect(isNonEmptyString('workspace.dsl')).toBe(true)
    expect(isNonEmptyString('   ')).toBe(false)
    expect(isNonEmptyString(42)).toBe(false)
  })

  it('accepts string arrays and string records', () => {
    expect(isStringArray(['a', 'b'])).toBe(true)
    expect(isStringArray(['a', 1])).toBe(false)
    expect(isStringRecord({ a: 'one', b: 'two' })).toBe(true)
    expect(isStringRecord({ a: 'one', b: 2 })).toBe(false)
  })

  it('validates records with a supplied entry guard', () => {
    const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
    expect(isRecordOf({ a: true, b: false }, isBoolean)).toBe(true)
    expect(isRecordOf({ a: true, b: 'no' }, isBoolean)).toBe(false)
    expect(isRecordOf([], isBoolean)).toBe(false)
  })
})
