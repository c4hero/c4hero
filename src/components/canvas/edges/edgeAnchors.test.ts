import { expect, it } from 'vitest'
import { Position } from '@xyflow/react'
import { snapToNode } from './edgeAnchors'

it('anchors source and target handles to their visible centres at every scale and side', () => {
  for (const radius of [3, 4, 7]) for (const scale of [1, .5, .08]) {
    // Transformed handle top-left, with the unscaled dimensions React Flow adds.
    const left = 100 - radius * scale, top = 200 - radius * scale
    const endpoints = {
      [Position.Top]: [left + radius, top],
      [Position.Bottom]: [left + radius, top + radius * 2],
      [Position.Left]: [left, top + radius],
      [Position.Right]: [left + radius * 2, top + radius],
    }
    for (const side of Object.values(Position)) {
      const [x, y] = endpoints[side]
      const corrected = snapToNode(x, y, side, radius, scale)
      expect(corrected[0]).toBeCloseTo(100)
      expect(corrected[1]).toBeCloseTo(200)
    }
  }
})
