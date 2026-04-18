import { useStore } from '@xyflow/react'

export type ZoomLevel = 'compact' | 'normal' | 'full'

const COMPACT_THRESHOLD = 0.5
const FULL_THRESHOLD = 1.2

/** Quantize viewport zoom into three detail levels so nodes only re-render on threshold crossings. */
const zoomLevelSelector = (state: { transform: [number, number, number] }): ZoomLevel => {
  const zoom = state.transform[2]
  if (zoom < COMPACT_THRESHOLD) return 'compact'
  if (zoom >= FULL_THRESHOLD) return 'full'
  return 'normal'
}

export function useZoomLevel(): ZoomLevel {
  return useStore(zoomLevelSelector)
}
