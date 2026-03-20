import { create } from 'zustand'
import { createLogger } from '@/lib/logger'

const log = createLogger('settings')

// ─── Types ──────────────────────────────────────────────────────────

export type MinimapMode = 'always' | 'auto' | 'never'
export type ColorTheme = 'readability' | 'structurizr'

export interface AppSettings {
  minimapMode: MinimapMode
  showUndoRedo: boolean
  showZoomControls: boolean
  snapToGrid: boolean
  colorTheme: ColorTheme
}

function isMobile(): boolean {
  return window.matchMedia('(max-width: 768px)').matches || /Mobi|Android/i.test(navigator.userAgent)
}

const DEFAULTS: AppSettings = {
  minimapMode: isMobile() ? 'never' : 'auto',
  showUndoRedo: false,
  showZoomControls: false,
  snapToGrid: false,
  colorTheme: 'readability',
}

const STORAGE_KEY = 'c4hero.json'

// ─── Persistence ────────────────────────────────────────────────────

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch (err) {
    log.warn('Failed to load settings from localStorage', err)
    return { ...DEFAULTS }
  }
}

function persist(settings: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings, null, 2))
  } catch (err) {
    log.warn('Failed to persist settings to localStorage', err)
  }
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
