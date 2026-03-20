import type { Workspace } from '@/types/model'

export interface ScopeViolation {
  type: 'error' | 'warning'
  message: string
}

export function validateScope(workspace: Workspace): ScopeViolation[] {
  const violations: ScopeViolation[] = []
  const { scope, model } = workspace
  if (!scope || scope === 'none') return violations

  const systems = model.softwareSystems ?? []
  const allContainers = systems.flatMap(s => s.containers ?? [])

  if (scope === 'landscape') {
    if (allContainers.length > 0) {
      violations.push({
        type: 'error',
        message: `Landscape-scoped workspaces must not define containers. Found ${allContainers.length} container(s).`,
      })
    }
  }

  if (scope === 'softwaresystem') {
    const systemsWithContainers = systems.filter(s => (s.containers ?? []).length > 0)
    if (systemsWithContainers.length > 1) {
      violations.push({
        type: 'error',
        message: `Software system scoped workspaces must define containers for only one software system. Found ${systemsWithContainers.length}: ${systemsWithContainers.map(s => s.name).join(', ')}.`,
      })
    }
  }

  return violations
}

export function scopeAllowsContainers(scope?: string): boolean {
  return scope !== 'landscape'
}

export function scopeLabel(scope?: string): string {
  if (scope === 'softwaresystem') return 'Software system'
  if (scope === 'landscape') return 'System landscape'
  return 'Unscoped'
}
