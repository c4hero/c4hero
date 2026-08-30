import type { ModelElement, View, Workspace } from '@/types/model'

/** Elements a dynamic view's steps may connect, mirroring what the real
 *  Structurizr parser accepts (verified against CLI v2025.11.09):
 *  unscoped — people and software systems only; system-scoped — plus
 *  containers; container-scoped — plus the scoped container's components. */
export function eligibleStepElements(ws: Workspace, view: View): ModelElement[] {
  const out: ModelElement[] = [...ws.model.people, ...ws.model.softwareSystems]
  if (view.softwareSystemId || view.containerId) {
    for (const system of ws.model.softwareSystems) out.push(...system.containers)
  }
  if (view.containerId) {
    const scoped = ws.model.softwareSystems
      .flatMap(s => s.containers)
      .find(c => c.id === view.containerId)
    out.push(...(scoped?.components ?? []))
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
