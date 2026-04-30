// Per-view viewport persistence (localStorage).
//
// Viewport state (pan + zoom) is per-user UI preference, not workspace truth,
// so it lives in localStorage rather than on the View itself. Keying includes
// the workspace name so different workspaces with overlapping view keys don't
// collide.

export interface SavedViewport {
  x: number
  y: number
  zoom: number
}

const KEY_PREFIX = 'c4hero.viewport'

function storageKey(workspaceName: string | undefined, viewKey: string): string {
  return `${KEY_PREFIX}.${workspaceName || '_unnamed_'}.${viewKey}`
}

export function saveViewport(
  workspaceName: string | undefined,
  viewKey: string,
  vp: SavedViewport,
): void {
  try {
    localStorage.setItem(storageKey(workspaceName, viewKey), JSON.stringify(vp))
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — silently no-op
  }
}

export function loadViewport(
  workspaceName: string | undefined,
  viewKey: string,
): SavedViewport | null {
  try {
    const raw = localStorage.getItem(storageKey(workspaceName, viewKey))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as SavedViewport).x === 'number' &&
      typeof (parsed as SavedViewport).y === 'number' &&
      typeof (parsed as SavedViewport).zoom === 'number'
    ) {
      return parsed as SavedViewport
    }
    return null
  } catch {
    return null
  }
}
