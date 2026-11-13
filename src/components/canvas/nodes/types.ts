import type { ModelElement, ElementStyle } from '@/types/model'

export interface C4NodeData {
  semantic?: { scale: number; width: number; height: number; reveal: number; expandable: boolean; nested?: boolean; onMeasure?: (id: string, size: { width: number; height: number; headerHeight?: number }) => void }
  element: ModelElement
  style?: ElementStyle
  childCount?: number
  canDrill?: boolean
  onDrillIn?: (elementId: string) => void
  viewCount?: number
  /** True when this node matches the active highlighter filters — render highlight rail. */
  highlighted?: boolean
  /** True when the user has locked this node in place. */
  locked?: boolean
}
