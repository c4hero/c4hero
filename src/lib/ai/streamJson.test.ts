import { describe, it, expect } from 'vitest'
import { createArrayStreamParser } from './streamJson'

// Feed the parser a full payload one character at a time, collecting everything
// it emits — models the worst-case single-token-at-a-time SSE stream.
function drip(payload: string, key = 'findings'): unknown[] {
  const feed = createArrayStreamParser(key)
  const out: unknown[] = []
  let acc = ''
  for (const ch of payload) { acc += ch; out.push(...feed(acc)) }
  return out
}

describe('createArrayStreamParser', () => {
  it('emits each array object as it closes, character-by-character', () => {
    const payload = '{"findings":[{"a":1},{"b":2},{"c":3}]}'
    expect(drip(payload)).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
  })

  it('emits progressively — an element is available before later ones arrive', () => {
    const feed = createArrayStreamParser('findings')
    expect(feed('{"findings":[{"a":1}')).toEqual([{ a: 1 }])
    expect(feed('{"findings":[{"a":1},{"b":2}')).toEqual([{ b: 2 }])
    expect(feed('{"findings":[{"a":1},{"b":2}]}')).toEqual([])
  })

  it('tolerates a leading code fence and prose before the object', () => {
    const payload = 'Sure — here are the findings:\n```json\n{"findings": [ {"x": 10} ]}\n```'
    expect(drip(payload)).toEqual([{ x: 10 }])
  })

  it('handles braces, brackets and escaped quotes inside strings', () => {
    const payload = '{"findings":[{"title":"has } and ] and \\" inside","n":[1,2]}]}'
    expect(drip(payload)).toEqual([{ title: 'has } and ] and " inside', n: [1, 2] }])
  })

  it('handles nested objects and arrays within an element', () => {
    const el = { title: 'A', operations: [{ op: 'updateElement', id: 'e1' }], options: [{ label: 'x', operations: [] }] }
    const payload = `{"findings":[${JSON.stringify(el)}]}`
    expect(drip(payload)).toEqual([el])
  })

  it('skips a malformed element but still emits the valid ones', () => {
    // The middle element has a trailing comma — invalid JSON — so it is dropped.
    const feed = createArrayStreamParser('findings')
    expect(feed('{"findings":[{"a":1},{"b":2,},{"c":3}]}')).toEqual([{ a: 1 }, { c: 3 }])
  })

  it('returns nothing once the array has closed, even if more text arrives', () => {
    const feed = createArrayStreamParser('findings')
    expect(feed('{"findings":[{"a":1}]}')).toEqual([{ a: 1 }])
    expect(feed('{"findings":[{"a":1}]} {"a":2}')).toEqual([])
  })

  it('emits nothing until the key and opening bracket have arrived', () => {
    const feed = createArrayStreamParser('findings')
    expect(feed('{"meta":{"n":0},"find')).toEqual([])
    expect(feed('{"meta":{"n":0},"findings":[{"a":1}]}')).toEqual([{ a: 1 }])
  })
})
