import type { ElementStyle } from '@/types/model'
import type { ColorTheme } from '@/store/settings'

/**
 * Base C4 type styles for each color theme.
 * Only covers the four built-in types (Person, Software System, Container, Component).
 * Custom tags defined per-template are not affected by the theme.
 */
export const THEMES: Record<ColorTheme, ElementStyle[]> = {
  readability: [
    { tag: 'Person', background: '#3a2a0a', color: '#fcd34d', stroke: '#f59e0b', shape: 'Person' },
    { tag: 'Software System', background: '#1a2f4a', color: '#93c5fd', stroke: '#3b82f6' },
    { tag: 'Container', background: '#0e2f3d', color: '#67e8f9', stroke: '#0891b2' },
    { tag: 'Component', background: '#231a3a', color: '#c4b5fd', stroke: '#7c3aed' },
  ],
  structurizr: [
    { tag: 'Person', background: '#08274a', color: '#93c5fd', stroke: '#2563eb', shape: 'Person' },
    { tag: 'Software System', background: '#0c3468', color: '#60a5fa', stroke: '#3b82f6' },
    { tag: 'Container', background: '#1a4a8a', color: '#7dd3fc', stroke: '#60a5fa' },
    { tag: 'Component', background: '#1e5a9e', color: '#bfdbfe', stroke: '#93c5fd' },
  ],
  grayscale: [
    { tag: 'Person', background: '#1a1a1a', color: '#e5e5e5', stroke: '#525252', shape: 'Person' },
    { tag: 'Software System', background: '#262626', color: '#d4d4d4', stroke: '#737373' },
    { tag: 'Container', background: '#404040', color: '#e5e5e5', stroke: '#a3a3a3' },
    { tag: 'Component', background: '#525252', color: '#f5f5f5', stroke: '#d4d4d4' },
  ],
  light: [
    { tag: 'Person', background: '#fef3c7', color: '#78350f', stroke: '#d97706', shape: 'Person' },
    { tag: 'Software System', background: '#dbeafe', color: '#1e3a8a', stroke: '#2563eb' },
    { tag: 'Container', background: '#dcfce7', color: '#14532d', stroke: '#16a34a' },
    { tag: 'Component', background: '#ede9fe', color: '#4c1d95', stroke: '#7c3aed' },
  ],
  highContrast: [
    { tag: 'Person', background: '#000000', color: '#facc15', stroke: '#facc15', strokeWidth: 3, shape: 'Person' },
    { tag: 'Software System', background: '#ffffff', color: '#000000', stroke: '#000000', strokeWidth: 3 },
    { tag: 'Container', background: '#000000', color: '#22d3ee', stroke: '#22d3ee', strokeWidth: 3 },
    { tag: 'Component', background: '#ffffff', color: '#000000', stroke: '#d946ef', strokeWidth: 3 },
  ],
  semantic: [
    { tag: 'Person', background: '#422006', color: '#fcd34d', stroke: '#f59e0b', shape: 'Person' },
    { tag: 'Software System', background: '#052e16', color: '#86efac', stroke: '#16a34a' },
    { tag: 'Container', background: '#082f49', color: '#7dd3fc', stroke: '#0284c7' },
    { tag: 'Component', background: '#3b0764', color: '#d8b4fe', stroke: '#a855f7' },
  ],
  pastel: [
    { tag: 'Person', background: '#fef3c7', color: '#92400e', stroke: '#fbbf24', shape: 'Person' },
    { tag: 'Software System', background: '#cffafe', color: '#155e75', stroke: '#22d3ee' },
    { tag: 'Container', background: '#ddd6fe', color: '#4c1d95', stroke: '#a78bfa' },
    { tag: 'Component', background: '#fce7f3', color: '#9d174d', stroke: '#f472b6' },
  ],
  slate: [
    { tag: 'Person', background: '#161c26', color: '#f8fafc', stroke: '#fbbf24', strokeWidth: 2, shape: 'Person' },
    { tag: 'Software System', background: '#161c26', color: '#f8fafc', stroke: '#22d3ee', strokeWidth: 2 },
    { tag: 'Container', background: '#161c26', color: '#f8fafc', stroke: '#60a5fa', strokeWidth: 2 },
    { tag: 'Component', background: '#161c26', color: '#f8fafc', stroke: '#a78bfa', strokeWidth: 2 },
  ],
  sepia: [
    { tag: 'Person', background: '#f5e6c8', color: '#78350f', stroke: '#d97706', shape: 'Person' },
    { tag: 'Software System', background: '#f0d6cc', color: '#7c2d12', stroke: '#b45309' },
    { tag: 'Container', background: '#e6e0c8', color: '#3f5121', stroke: '#65a30d' },
    { tag: 'Component', background: '#d8d8e6', color: '#312e81', stroke: '#5b21b6' },
  ],
  solarizedDark: [
    { tag: 'Person', background: '#073642', color: '#b58900', stroke: '#b58900', strokeWidth: 2, shape: 'Person' },
    { tag: 'Software System', background: '#073642', color: '#268bd2', stroke: '#268bd2', strokeWidth: 2 },
    { tag: 'Container', background: '#073642', color: '#2aa198', stroke: '#2aa198', strokeWidth: 2 },
    { tag: 'Component', background: '#073642', color: '#859900', stroke: '#859900', strokeWidth: 2 },
  ],
  whiteboard: [
    { tag: 'Person', background: '#ffffff', color: '#b91c1c', stroke: '#b91c1c', strokeWidth: 2, shape: 'Person' },
    { tag: 'Software System', background: '#ffffff', color: '#1d4ed8', stroke: '#1d4ed8', strokeWidth: 2 },
    { tag: 'Container', background: '#ffffff', color: '#047857', stroke: '#047857', strokeWidth: 2 },
    { tag: 'Component', background: '#ffffff', color: '#1f2937', stroke: '#1f2937', strokeWidth: 2 },
  ],
  monoAccent: [
    { tag: 'Person', background: '#0c2340', color: '#dbeafe', stroke: '#1d4ed8', shape: 'Person' },
    { tag: 'Software System', background: '#1e3a8a', color: '#dbeafe', stroke: '#3b82f6' },
    { tag: 'Container', background: '#2563eb', color: '#eff6ff', stroke: '#93c5fd' },
    { tag: 'Component', background: '#3b82f6', color: '#ffffff', stroke: '#dbeafe' },
  ],
}

/**
 * Canvas background color for each theme. Light themes get light canvases so
 * the element fills read correctly. Dark themes return null to fall back to
 * the app's default `--color-bg-primary`.
 */
export const THEME_CANVAS_BACKGROUNDS: Record<ColorTheme, string | null> = {
  readability: null,
  structurizr: null,
  grayscale: '#0a0a0a',
  light: '#f8fafc',
  highContrast: '#ffffff',
  semantic: null,
  pastel: '#fdf4ff',
  slate: '#0b1220',
  sepia: '#f5f0e6',
  solarizedDark: '#002b36',
  whiteboard: '#fafaf5',
  monoAccent: null,
}

/**
 * True when the theme renders the canvas on a light background (so the dot
 * grid and other canvas chrome should switch to dark variants for contrast).
 * Defaults to false when no canvas override is set (we fall back to the app's
 * dark bg).
 */
export function isLightCanvasTheme(theme: ColorTheme): boolean {
  return theme === 'light' || theme === 'pastel' || theme === 'highContrast' || theme === 'sepia' || theme === 'whiteboard'
}

/**
 * Per-theme selection highlight color used for selected node borders + glow.
 * Picked to harmonize with each palette rather than the fixed blue accent.
 */
/**
 * Per-theme edge stroke color. Null falls back to the global `--color-edge`.
 * Tuned for contrast against each canvas plus aesthetic match (e.g. sepia uses
 * warm brown lines, Slate uses cool steel, Solarized uses base01 grey).
 */
export const THEME_EDGE_COLORS: Record<ColorTheme, string | null> = {
  readability: null,
  structurizr: null,
  grayscale: '#737373',
  light: '#475569',
  highContrast: '#000000',
  semantic: null,
  pastel: '#94a3b8',
  slate: '#3a4658',
  sepia: '#92400e',
  solarizedDark: '#586e75',
  whiteboard: '#1f2937',
  monoAccent: '#3b82f6',
}

/**
 * Per-theme edge label text colors. Tuned to match each theme's warmth so
 * edge descriptions and technology pills don't read as alien (e.g. cold
 * slate-grey on a warm sepia canvas). Null falls back to the default
 * light/dark switch (`#1f2937` on light canvases, --color-text-secondary
 * on dark).
 */
export const THEME_LABEL_COLORS: Record<ColorTheme, string | null> = {
  readability: null,
  structurizr: null,
  grayscale: null,
  light: null,
  highContrast: '#000000',
  semantic: null,
  pastel: '#312e81',
  slate: null,
  sepia: '#7c2d12',
  solarizedDark: '#93a1a1',
  whiteboard: '#0f172a',
  monoAccent: null,
}

export const THEME_LABEL_MUTED_COLORS: Record<ColorTheme, string | null> = {
  readability: null,
  structurizr: null,
  grayscale: null,
  light: null,
  highContrast: '#374151',
  semantic: null,
  pastel: '#4338ca',
  slate: null,
  sepia: '#a16207',
  solarizedDark: '#586e75',
  whiteboard: '#475569',
  monoAccent: null,
}

export const THEME_SELECTION_COLORS: Record<ColorTheme, string> = {
  readability: '#facc15',
  structurizr: '#3b82f6',
  grayscale: '#9ca3af',
  light: '#0d9488',
  highContrast: '#facc15',
  semantic: '#f59e0b',
  pastel: '#4338ca',
  slate: '#22d3ee',
  sepia: '#92400e',
  solarizedDark: '#b58900',
  whiteboard: '#ea580c',
  monoAccent: '#93c5fd',
}

