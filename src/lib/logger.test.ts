import { describe, it, expect } from 'vitest'
import { createLogger, addTransport } from './logger'
import type { LogEntry } from './logger'

// Each test registers its own transports and cleans up via the unregister fn.
// We suppress console output to keep test output clean.

describe('createLogger', () => {
  it('delivers a log entry with the correct component name', () => {
    const entries: LogEntry[] = []
    const unregister = addTransport(e => entries.push(e))

    const log = createLogger('TestModule')
    log.info('hello')

    unregister()
    expect(entries).toHaveLength(1)
    expect(entries[0].component).toBe('TestModule')
  })

  it('delivers the message string verbatim', () => {
    const entries: LogEntry[] = []
    const unregister = addTransport(e => entries.push(e))

    createLogger('mod').warn('something went wrong')

    unregister()
    expect(entries[0].message).toBe('something went wrong')
  })

  it('sets the correct level for each log method', () => {
    const entries: LogEntry[] = []
    const unregister = addTransport(e => entries.push(e))

    const log = createLogger('mod')
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')

    unregister()
    expect(entries.map(e => e.level)).toEqual(['debug', 'info', 'warn', 'error'])
  })

  it('includes optional data in the entry', () => {
    const entries: LogEntry[] = []
    const unregister = addTransport(e => entries.push(e))

    createLogger('mod').error('failed', { code: 42 })

    unregister()
    expect(entries[0].data).toEqual({ code: 42 })
  })

  it('leaves data undefined when not provided', () => {
    const entries: LogEntry[] = []
    const unregister = addTransport(e => entries.push(e))

    createLogger('mod').info('no data')

    unregister()
    expect(entries[0].data).toBeUndefined()
  })

  it('sets a non-empty ISO timestamp', () => {
    const entries: LogEntry[] = []
    const unregister = addTransport(e => entries.push(e))

    createLogger('mod').info('ts test')

    unregister()
    expect(entries[0].timestamp).toBeTruthy()
    // ISO 8601: "2024-01-01T00:00:00.000Z"
    expect(entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('addTransport', () => {
  it('returns an unregister function that stops delivery', () => {
    const entries: LogEntry[] = []
    const unregister = addTransport(e => entries.push(e))

    createLogger('mod').info('before')
    unregister()
    createLogger('mod').info('after')

    expect(entries).toHaveLength(1)
    expect(entries[0].message).toBe('before')
  })

  it('multiple transports both receive the same entry', () => {
    const a: LogEntry[] = []
    const b: LogEntry[] = []
    const ua = addTransport(e => a.push(e))
    const ub = addTransport(e => b.push(e))

    createLogger('mod').warn('multi')

    ua()
    ub()

    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
    expect(a[0].message).toBe('multi')
    expect(b[0].message).toBe('multi')
  })

  it('transport error does not propagate to caller', () => {
    const unregister = addTransport(() => { throw new Error('transport boom') })

    // Should not throw
    expect(() => createLogger('mod').info('safe')).not.toThrow()

    unregister()
  })

  it('calling unregister twice is a no-op (does not throw)', () => {
    const unregister = addTransport(() => {})
    unregister()
    expect(() => unregister()).not.toThrow()
  })
})
