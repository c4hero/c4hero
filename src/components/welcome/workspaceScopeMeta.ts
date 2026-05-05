// Scope metadata is shared by welcome components and preview mocks. Keep it
// outside component modules so React Fast Refresh only sees component exports.
export const SCOPE_COLORS: Record<string, string> = {
  softwaresystem: '#38bdf8', // sky blue
  landscape: '#a78bfa',      // purple
}

const DEFAULT_SCOPE_COLOR = '#64748b' // slate for unscoped

export function scopeAccent(scope?: string): string {
  return (scope && SCOPE_COLORS[scope]) ?? DEFAULT_SCOPE_COLOR
}

/** Short uppercase label for workspace scope. Empty string for unscoped. */
export function scopeLabel(scope?: string): string {
  if (scope === 'softwaresystem') return 'System'
  if (scope === 'landscape') return 'Landscape'
  return ''
}
