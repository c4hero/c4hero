/** Shape and color constants used by the tag manager surfaces. Lives in a
 *  separate plain-TS module so the component file can satisfy the React
 *  Fast Refresh "components-only exports" rule. */

export const STRUCTURIZR_SHAPES = [
  'Box', 'RoundedBox', 'Circle', 'Ellipse', 'Hexagon',
  'Cylinder', 'Pipe', 'Person', 'Robot', 'Folder',
  'WebBrowser', 'MobileDevicePortrait', 'MobileDeviceLandscape', 'Component',
]

export const PRESET_COLORS = [
  '#2dd4bf', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6',
  '#f59e0b', '#ef4444', '#6366f1', '#14b8a6', '#8b5cf6',
  '#22c55e', '#3b82f6', '#ec4899', '#f97316', '#64748b',
]

export const TAG_TEXT_PRESETS = ['#ffffff', '#e2e8f0', '#0b1219', '#1e293b', ...PRESET_COLORS.slice(0, 6)]
