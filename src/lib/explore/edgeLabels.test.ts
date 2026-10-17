import { expect, it } from 'vitest'
import { edgeLabelBox, edgeLabelOpacity, overlaps } from './edgeLabels'

it('fades labels in only at readable sizes', () => {
  expect(edgeLabelOpacity(4)).toBe(0)
  expect(edgeLabelOpacity(6)).toBe(0)
  expect(edgeLabelOpacity(7.5)).toBe(.5)
  expect(edgeLabelOpacity(11)).toBe(1)
})

it('reserves breathing room between labels and nodes', () => {
  const box = { x: 0, y: 0, width: 50, height: 15 }
  expect(overlaps(box, { ...box, x: 52 })).toBe(true)
  expect(overlaps(box, { ...box, x: 55 })).toBe(false)
  expect(overlaps(box, { ...box, y: 10 })).toBe(true)
})

it('places every caption entirely above its path anchor', () => {
  const anchor = { x: 100, y: 80 }, box = edgeLabelBox(anchor, 60, 11, 1)
  expect(box.y + box.height).toBeLessThan(anchor.y)
  expect(box.x + box.width / 2).toBe(anchor.x)
})
