// View-type display strings, kept out of ViewSwitcher.tsx so that file only
// exports components — eslint-plugin-react-refresh flags a module that mixes
// component and constant exports, because it breaks fast refresh.

export const VIEW_TYPE_LABELS: Record<string, string> = {
  systemLandscape: 'System Landscape',
  systemContext: 'System Context',
  container: 'Container',
  component: 'Component',
  dynamic: 'Dynamic',
  deployment: 'Deployment',
}

export const LEVEL_BADGE: Record<string, string> = {
  systemLandscape: 'Map',
  systemContext: 'L1',
  container: 'L2',
  component: 'L3',
  dynamic: 'Dyn',
  deployment: 'Dep',
}
