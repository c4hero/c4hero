import { useEffect } from 'react'
import { useSettingsStore } from '@/store/settings'
import { THEME_CANVAS_BACKGROUNDS, THEME_SELECTION_COLORS, THEME_EDGE_COLORS, THEME_LABEL_COLORS, THEME_LABEL_MUTED_COLORS, isLightCanvasTheme } from '@/lib/themes'

/** Apply the same theme to the canvas and floating controls in either mode. */
export function useCanvasTheme() {
  const colorTheme = useSettingsStore(s => s.colorTheme)
  const themeCanvasBackground = THEME_CANVAS_BACKGROUNDS[colorTheme]
  const themeSelectionColor = THEME_SELECTION_COLORS[colorTheme]
  const themeEdgeColor = THEME_EDGE_COLORS[colorTheme]
  const isLightCanvas = isLightCanvasTheme(colorTheme)
  // Cascade canvas-related theme vars to document.documentElement so the
  // floating chrome (top pill, tool rail, inspector, etc.) — which is rendered
  // outside the canvas tree — can also read them.
  useEffect(() => {
    const root = document.documentElement
    const set = (key: string, value: string | null) => {
      if (value == null) root.style.removeProperty(key)
      else root.style.setProperty(key, value)
    }
    const labelColorOverride = THEME_LABEL_COLORS[colorTheme]
    const labelMutedOverride = THEME_LABEL_MUTED_COLORS[colorTheme]
    const boundaryBorder = colorTheme === 'highContrast'
      ? '#000000'
      : isLightCanvas
        ? 'color-mix(in srgb, var(--canvas-selection, var(--color-accent)) 42%, transparent)'
        : null
    set('--canvas-bg', themeCanvasBackground ?? null)
    set('--canvas-selection', themeSelectionColor)
    set('--canvas-label-color', labelColorOverride ?? (isLightCanvas ? '#1f2937' : 'var(--color-text-secondary)'))
    set('--canvas-label-muted', labelMutedOverride ?? (isLightCanvas ? '#475569' : 'var(--color-text-muted)'))
    set('--canvas-edge', themeEdgeColor ?? null)
    set('--canvas-boundary-border', boundaryBorder)
    set('--canvas-boundary-bg', isLightCanvas ? 'rgba(15, 23, 42, 0.012)' : null)
    set('--canvas-boundary-title', isLightCanvas ? 'var(--canvas-label-muted)' : null)
    set('--canvas-boundary-subtitle', isLightCanvas ? 'color-mix(in srgb, var(--canvas-label-muted) 74%, transparent)' : null)
    if (isLightCanvas) root.setAttribute('data-canvas-light', '')
    else root.removeAttribute('data-canvas-light')
    return () => {
      set('--canvas-bg', null)
      set('--canvas-selection', null)
      set('--canvas-label-color', null)
      set('--canvas-label-muted', null)
      set('--canvas-edge', null)
      set('--canvas-boundary-border', null)
      set('--canvas-boundary-bg', null)
      set('--canvas-boundary-title', null)
      set('--canvas-boundary-subtitle', null)
      root.removeAttribute('data-canvas-light')
    }
  }, [themeCanvasBackground, themeSelectionColor, themeEdgeColor, isLightCanvas, colorTheme])

}

