import { create } from 'zustand'
import { isRecord } from '@/lib/guards'
import { readJSON, writeJSON } from '@/lib/safeStorage'

// ─── Types ──────────────────────────────────────────────────────────

export type MinimapMode = 'always' | 'auto' | 'never'
export type ColorTheme =
  | 'readability'
  | 'structurizr'
  | 'grayscale'
  | 'light'
  | 'highContrast'
  | 'semantic'
  | 'pastel'
  | 'slate'
  | 'sepia'
  | 'solarizedDark'
  | 'whiteboard'
  | 'monoAccent'

export interface AppSettings {
  minimapMode: MinimapMode
  showUndoRedo: boolean
  showZoomControls: boolean
  snapToGrid: boolean
  colorTheme: ColorTheme
}

function isMobile(): boolean {
  if (typeof window === 'undefined') return false
  const mediaMatches = window.matchMedia?.('(max-width: 768px)')?.matches ?? false
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  return mediaMatches || /Mobi|Android/i.test(userAgent)
}

const DEFAULTS: AppSettings = {
  minimapMode: isMobile() ? 'never' : 'auto',
  showUndoRedo: false,
  showZoomControls: false,
  snapToGrid: false,
  colorTheme: 'readability',
}

const STORAGE_KEY = 'c4hero.json'

const MINIMAP_MODES: ReadonlySet<string> = new Set<MinimapMode>(['always', 'auto', 'never'])
const COLOR_THEMES: ReadonlySet<string> = new Set<ColorTheme>([
  'readability',
  'structurizr',
  'grayscale',
  'light',
  'highContrast',
  'semantic',
  'pastel',
  'slate',
  'sepia',
  'solarizedDark',
  'whiteboard',
  'monoAccent',
])

function isMinimapMode(value: unknown): value is MinimapMode {
  return typeof value === 'string' && MINIMAP_MODES.has(value)
}

function isColorTheme(value: unknown): value is ColorTheme {
  return typeof value === 'string' && COLOR_THEMES.has(value)
}

function readBoolean(source: Record<string, unknown>, key: keyof AppSettings, fallback: boolean): boolean {
  return typeof source[key] === 'boolean' ? source[key] : fallback
}

function normalizeSettings(value: unknown): AppSettings {
  const source = isRecord(value) ? value : {}
  return {
    minimapMode: isMinimapMode(source.minimapMode) ? source.minimapMode : DEFAULTS.minimapMode,
    showUndoRedo: readBoolean(source, 'showUndoRedo', DEFAULTS.showUndoRedo),
    showZoomControls: readBoolean(source, 'showZoomControls', DEFAULTS.showZoomControls),
    snapToGrid: readBoolean(source, 'snapToGrid', DEFAULTS.snapToGrid),
    colorTheme: isColorTheme(source.colorTheme) ? source.colorTheme : DEFAULTS.colorTheme,
  }
}

// ─── Persistence ────────────────────────────────────────────────────

function load(): AppSettings {
  // normalizeSettings already absorbs any shape — pass-through validator.
  const raw = readJSON<unknown>(STORAGE_KEY, (v): v is unknown => v !== null && v !== undefined)
  return normalizeSettings(raw)
}

function persist(settings: AppSettings) {
  writeJSON(STORAGE_KEY, settings)
}

// ─── Store ──────────────────────────────────────────────────────────

interface SettingsState extends AppSettings {
  update: (patch: Partial<AppSettings>) => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...load(),

  update: (patch) => {
    set(patch)
    // persist full settings after update
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring to exclude `update` from persisted settings
    const { update: _, ...rest } = get()
    persist(rest as AppSettings)
  },
}))
