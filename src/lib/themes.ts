import type { ElementStyle } from '@/types/model'
import type { ColorTheme } from '@/store/settings'

/**
 * Base C4 type styles for each color theme.
 * Only covers the four built-in types (Person, Software System, Container, Component).
 * Custom tags defined per-template are not affected by the theme.
 */
export const THEMES: Record<ColorTheme, ElementStyle[]> = {
  readability: [
    { tag: 'Person', background: '#1a3a2a', color: '#86efac', stroke: '#22c55e', shape: 'Person' },
    { tag: 'Software System', background: '#1a2f4a', color: '#93c5fd', stroke: '#3b82f6' },
    { tag: 'Container', background: '#0f2a2a', color: '#5eead4', stroke: '#14b8a6' },
    { tag: 'Component', background: '#231a3a', color: '#c4b5fd', stroke: '#7c3aed' },
  ],
  structurizr: [
    { tag: 'Person', background: '#08274a', color: '#93c5fd', stroke: '#2563eb', shape: 'Person' },
    { tag: 'Software System', background: '#0c3468', color: '#60a5fa', stroke: '#3b82f6' },
    { tag: 'Container', background: '#1a4a8a', color: '#7dd3fc', stroke: '#60a5fa' },
    { tag: 'Component', background: '#1e5a9e', color: '#bfdbfe', stroke: '#93c5fd' },
  ],
}

