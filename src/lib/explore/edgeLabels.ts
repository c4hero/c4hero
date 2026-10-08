import type { Box } from './layout'

export function overlaps(a: Box, b: Box, padding = 3) {
  return a.x < b.x + b.width + padding && a.x + a.width + padding > b.x &&
    a.y < b.y + b.height + padding && a.y + a.height + padding > b.y
}

export function edgeLabelOpacity(fontSize: number) {
  return Math.max(0, Math.min(1, (fontSize - 6) / 3))
}

export function edgeLabelBox(anchor: { x: number; y: number }, width: number, fontSize: number, scale: number): Box {
  const pad = 4 * scale, height = fontSize * 1.4
  return { x: anchor.x - width / 2 - pad, y: anchor.y - height - 4 * scale, width: width + pad * 2, height }
}
