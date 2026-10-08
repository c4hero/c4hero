import { expect, it } from 'vitest'
import { descriptionLayout, textInset, wrapText } from './text'

it('keeps description wrapping and truncation independent of zoom', () => {
  const text = 'Allows customers to view information about their bank accounts, and make payments.'
  const expected = descriptionLayout(text, 216, 120, false, s => s.length * 6)
  for (const zoom of [.5, 1, 1.99, 2.01, 3, 6]) {
    const layout = descriptionLayout(text, 216 * zoom / zoom, 120 * zoom / zoom, false, s => s.length * 6)
    expect(layout).toEqual(expected)
    expect(layout.scale * zoom).toBeCloseTo(expected.scale * zoom)
  }
})

it('wraps words and unbroken identifiers within the available width', () => {
  expect(wrapText('hello world', 5, s => s.length)).toEqual(['hello', 'world'])
  expect(wrapText('abcdefghijk', 4, s => s.length)).toEqual(['abcd', 'efgh', 'ijk'])
})

it('keeps person text inside curved edges even when text is reduced', () => {
  for (const scale of [.55, 1, 4]) {
    const radius = 240, insetY = Math.min(radius, 12 * scale)
    const edge = radius - Math.sqrt(radius ** 2 - (radius - insetY) ** 2)
    expect(textInset(true, 480, scale)).toBeGreaterThan(edge)
  }
  expect(textInset(false, 480, 4)).toBe(56)
})
