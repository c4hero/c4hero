import type { ModelElement, ElementStyle } from '@/types/model'

export interface C4NodeData {
  element: ModelElement
  style?: ElementStyle
  childCount?: number
  canDrill?: boolean
  onDrillIn?: (elementId: string) => void
  viewCount?: number
  /** True when this node matches the active highlighter filters — render highlight rail. */
  highlighted?: boolean
}
