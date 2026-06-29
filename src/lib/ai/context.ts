import type {
  Workspace, ModelElement, Person, SoftwareSystem, Container, Component, Relationship, View,
} from '@/types/model'

// Pure helpers that flatten a Workspace into compact, id-tagged context for
// prompts, and collect items that lack descriptions. No store access, no I/O —
// these are unit-tested in isolation.

export interface FlatElement {
  id: string
  type: ModelElement['type']
  name: string
  description?: string
  technology?: string
  /** Parent element id for containers (their system) and components (their container). */
  parentId?: string
  parentName?: string
}

/** Walk people + systems + containers + components into a flat, ordered list. */
export function flattenElements(ws: Workspace): FlatElement[] {
  const out: FlatElement[] = []
  for (const p of ws.model.people) {
    out.push({ id: p.id, type: 'person', name: p.name, description: p.description })
  }
  for (const sys of ws.model.softwareSystems) {
    out.push({ id: sys.id, type: 'softwareSystem', name: sys.name, description: sys.description })
    for (const c of sys.containers) {
      out.push({
        id: c.id, type: 'container', name: c.name, description: c.description,
        technology: c.technology, parentId: sys.id, parentName: sys.name,
      })
      for (const comp of c.components) {
        out.push({
          id: comp.id, type: 'component', name: comp.name, description: comp.description,
          technology: comp.technology, parentId: c.id, parentName: c.name,
        })
      }
    }
  }
  return out
}

/** Map an element id to its display name (for rendering relationships). */
export function elementNameMap(ws: Workspace): Map<string, string> {
  const map = new Map<string, string>()
  for (const el of flattenElements(ws)) map.set(el.id, el.name)
  return map
}

/** Set of every valid element id in the workspace. */
export function elementIdSet(ws: Workspace): Set<string> {
  return new Set(flattenElements(ws).map((el) => el.id))
}

/** True for an absent or whitespace-only string (missing name/description/tech). */
export function isBlank(value?: string): boolean {
  return !value || value.trim().length === 0
}

/** Elements whose description is empty. */
export function elementsMissingDescription(ws: Workspace): FlatElement[] {
  return flattenElements(ws).filter((el) => isBlank(el.description))
}

/** Relationships whose description is empty. */
export function relationshipsMissingDescription(ws: Workspace): Relationship[] {
  return ws.model.relationships.filter((r) => isBlank(r.description))
}

/** Compact, human/LLM-readable snapshot of the model. Every line is id-tagged so
 *  the model can reference elements precisely in operations and descriptions. */
export function serializeContext(ws: Workspace): string {
  const lines: string[] = []
  lines.push(`Workspace: ${ws.name || '(untitled)'}`)
  if (ws.description) lines.push(`Description: ${ws.description}`)
  lines.push('')
  lines.push('ELEMENTS (id | type | name | technology | description):')

  const people = ws.model.people
  if (people.length) {
    lines.push('People:')
    for (const p of people) lines.push(`  ${formatElementLine(p)}`)
  }

  for (const sys of ws.model.softwareSystems) {
    lines.push(`Software System: ${formatElementLine(sys)}`)
    for (const c of sys.containers) {
      lines.push(`  Container: ${formatElementLine(c)}`)
      for (const comp of c.components) {
        lines.push(`    Component: ${formatElementLine(comp)}`)
      }
    }
  }

  const rels = ws.model.relationships
  lines.push('')
  lines.push('RELATIONSHIPS (id | source -> destination | description | technology):')
  if (rels.length === 0) {
    lines.push('  (none)')
  } else {
    const names = elementNameMap(ws)
    for (const r of rels) {
      const src = names.get(r.sourceId) ?? r.sourceId
      const dst = names.get(r.destinationId) ?? r.destinationId
      const parts = [
        r.id,
        `${src} -> ${dst}`,
        r.description?.trim() || '(no description)',
        r.technology?.trim() || '-',
      ]
      lines.push(`  ${parts.join(' | ')}`)
    }
  }

  return lines.join('\n')
}

function formatElementLine(el: Person | SoftwareSystem | Container | Component): string {
  const technology = 'technology' in el && el.technology ? el.technology : '-'
  const description = el.description?.trim() || '(no description)'
  return `${el.id} | ${el.type} | ${el.name} | ${technology} | ${description}`
}

const VIEW_TYPE_LABELS: Record<View['type'], string> = {
  systemLandscape: 'System Landscape',
  systemContext: 'System Context',
  container: 'Container',
  component: 'Component',
}

/** Short human label for a view, e.g. "Container view "Containers"". */
export function viewLabel(view: View): string {
  const kind = VIEW_TYPE_LABELS[view.type]
  return view.title ? `${kind} view “${view.title}”` : `${kind} view`
}

/** Focused context for one view: the view itself plus only the elements and
 *  relationships actually shown in it. Used to ground the interview on the
 *  current screen rather than the whole workspace. */
export function serializeViewContext(ws: Workspace, view: View): string {
  const names = elementNameMap(ws)
  const flat = new Map(flattenElements(ws).map((e) => [e.id, e]))
  const viewElementIds = new Set(view.elements.map((e) => e.id))

  const lines: string[] = []
  lines.push(`The user is viewing the ${viewLabel(view)} (key: ${view.key}).`)
  const scopeId = view.softwareSystemId ?? view.containerId
  if (scopeId) lines.push(`Scope element: ${names.get(scopeId) ?? scopeId} (${scopeId}).`)
  lines.push('')
  lines.push('ELEMENTS ON SCREEN (id | type | name | technology | description):')
  if (viewElementIds.size === 0) {
    lines.push('  (the view is empty)')
  } else {
    for (const id of viewElementIds) {
      const el = flat.get(id)
      if (el) lines.push(`  ${el.id} | ${el.type} | ${el.name} | ${el.technology ?? '-'} | ${el.description?.trim() || '(no description)'}`)
    }
  }

  lines.push('')
  lines.push('RELATIONSHIPS ON SCREEN (id | source -> destination | description):')
  const onScreenRels = ws.model.relationships.filter(
    (r) => viewElementIds.has(r.sourceId) && viewElementIds.has(r.destinationId),
  )
  if (onScreenRels.length === 0) {
    lines.push('  (none)')
  } else {
    for (const r of onScreenRels) {
      lines.push(`  ${r.id} | ${names.get(r.sourceId) ?? r.sourceId} -> ${names.get(r.destinationId) ?? r.destinationId} | ${r.description?.trim() || '(no description)'}`)
    }
  }

  return lines.join('\n')
}
