import { UserRound, Globe, Box, Puzzle } from 'lucide-react'
import type { ModelElement } from '@/types/model'

export const TYPE_ICONS: Record<string, React.ReactNode> = {
  person: <UserRound size={14} />,
  softwareSystem: <Globe size={14} />,
  container: <Box size={14} />,
  component: <Puzzle size={14} />,
}

export const TYPE_COLORS: Record<string, string> = {
  person: 'var(--color-type-person)',
  softwareSystem: 'var(--color-type-system)',
  container: 'var(--color-type-container)',
  component: 'var(--color-type-component)',
}

export const TYPE_LABELS: Record<string, string> = {
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
}

/**
 * Common Structurizr container patterns. When an element is tagged with one of
 * these, the UI prefers it as the type chip (e.g. "Web Application" instead of
 * the generic "Container") so users see the most specific role at a glance.
 * Order matters: the first match wins.
 */
const COMMON_CONTAINER_TAGS = [
  'Web Application',
  'Mobile App',
  'Database',
  'Queue',
  'Service',
  'File System',
] as const

/**
 * Display label for an element's type. For containers, returns the most
 * specific common-container tag (e.g. "Web Application") if one is set;
 * otherwise falls back to the generic type label ("Container").
 */
export function getElementTypeLabel(element: ModelElement): string {
  if (element.type === 'container') {
    const match = COMMON_CONTAINER_TAGS.find((t) => element.tags.includes(t))
    if (match) return match
  }
  return TYPE_LABELS[element.type] ?? element.type
}
