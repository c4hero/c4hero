import { create } from 'zustand'

// ─── Types ──────────────────────────────────────────────────────────

export type MinimapMode = 'always' | 'auto' | 'never'

export interface AppSettings {
  minimapMode: MinimapMode
  showUndoRedo: boolean
  showZoomControls: boolean
  snapToGrid: boolean
}

function isMobile(): boolean {
  return window.matchMedia('(max-width: 768px)').matches || /Mobi|Android/i.test(navigator.userAgent)
}

const DEFAULTS: AppSettings = {
  minimapMode: isMobile() ? 'never' : 'auto',
  showUndoRedo: false,
  showZoomControls: false,
  snapToGrid: false,
}

const STORAGE_KEY = 'c4hero.json'

// ─── Persistence ────────────────────────────────────────────────────

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

function persist(settings: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings, null, 2))
  } catch {
    // localStorage full or unavailable — silently ignore
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
