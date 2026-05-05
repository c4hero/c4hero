import type { Relationship } from '@/types/model'

export type EdgeLabelDensity = 'full' | 'compact'

export function getEdgeLabelDensity({
  lineStyle,
  sourceX,
  sourceY,
  targetX,
  targetY,
  description,
  technologies,
  selected,
  hovered,
}: {
  lineStyle?: Relationship['lineStyle']
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  description?: string
  technologies: string[]
  selected: boolean
  hovered: boolean
}): EdgeLabelDensity {
  if (selected || hovered) return 'full'

  const edgeLength = Math.hypot(targetX - sourceX, targetY - sourceY)
  const descriptionLength = description?.trim().length ?? 0
  const technologyLength = technologies.join(', ').length
  const totalLabelLength = descriptionLength + technologyLength

  if (lineStyle === 'Orthogonal' && totalLabelLength >= 48) return 'compact'
  if (totalLabelLength >= 72) return 'compact'
  if (edgeLength < 180 && totalLabelLength >= 30) return 'compact'

  return 'full'
}

export function truncateEdgeLabel(text: string, maxChars: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxChars) return trimmed
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}
