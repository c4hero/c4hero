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

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Build a reusable id→name rewriter for a workspace. Compiles the element-name
 *  map and per-element RegExps ONCE; callers that humanize many strings (a whole
 *  review's findings) should make one humanizer and reuse it rather than calling
 *  {@link humanizeIds} per string (which rebuilds everything each time). */
export function makeHumanizer(ws: Workspace): (text: string) => string {
  const entries = [...elementNameMap(ws)]
    .filter(([id, name]) => id.length > 0 && name.trim().length > 0 && id !== name)
    // Longest ids first so a longer id isn't shadowed by a shorter one it contains.
    .sort((a, b) => b[0].length - a[0].length)
  const idRes = entries.map(([id, name]) => [new RegExp(`(?<![\\w-])${escapeRegExp(id)}(?![\\w-])`, 'g'), name] as const)
  // Collapse "Name ('Name')" / "Name (\"Name\")" / "Name (Name)" → "Name".
  const nameRes = [...new Set(entries.map(([, n]) => n))].map((name) => {
    const e = escapeRegExp(name)
    return [new RegExp(`${e}\\s*\\(['"]?${e}['"]?\\)`, 'g'), name] as const
  })
  return (text: string): string => {
    if (!text) return text
    let out = text
    for (const [re, name] of idRes) out = out.replace(re, name)
    for (const [re, name] of nameRes) out = out.replace(re, name)
    return out
  }
}

/** Rewrite raw element ids in human-readable review text into element names, so
 *  findings read naturally ("ATM Website" instead of "UuymxwcN ('ATM Website')").
 *  For many strings over the same workspace, prefer {@link makeHumanizer}. */
export function humanizeIds(text: string, ws: Workspace): string {
  return makeHumanizer(ws)(text)
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

/** The ids that are *internal* to a view's scope: the scope element (system or
 *  container) plus its descendants. Everything else shown on the view is external
 *  context — another system/container drawn in its own boundary. Empty when the
 *  view has no scope element (a landscape view, where there's no boundary). */
export function viewScopeInternalIds(ws: Workspace, view: View): Set<string> {
  const scopeId = view.softwareSystemId ?? view.containerId
  const internal = new Set<string>()
  if (!scopeId) return internal
  internal.add(scopeId)
  // Two passes so components of in-scope containers are picked up after their
  // container is admitted (container.parent = system, component.parent = container).
  const flat = flattenElements(ws)
  for (const el of flat) if (el.parentId === scopeId) internal.add(el.id)
  for (const el of flat) if (el.parentId && internal.has(el.parentId)) internal.add(el.id)
  return internal
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
  const internal = viewScopeInternalIds(ws, view)
  const hasExternal = scopeId != null && [...viewElementIds].some((id) => !internal.has(id))
  if (hasExternal) {
    lines.push('')
    lines.push('NOTE: elements marked EXTERNAL belong to ANOTHER system/container and are shown')
    lines.push('only as context (drawn inside their own boundary). This is intentional C4 — do NOT')
    lines.push('flag EXTERNAL elements as misplaced, mis-parented, orphaned, or recommend moving/')
    lines.push('removing them from this view; treat them only as the surrounding context.')
  }
  lines.push('')
  lines.push('ELEMENTS ON SCREEN (id | type | name | technology | description | belongs-to | scope):')
  if (viewElementIds.size === 0) {
    lines.push('  (the view is empty)')
  } else {
    for (const id of viewElementIds) {
      const el = flat.get(id)
      if (!el) continue
      const belongsTo = el.parentName ? `part of ${el.parentName}` : '-'
      const scope = scopeId == null ? '-' : internal.has(id) ? 'in-scope' : 'EXTERNAL'
      lines.push(`  ${el.id} | ${el.type} | ${el.name} | ${el.technology ?? '-'} | ${el.description?.trim() || '(no description)'} | ${belongsTo} | ${scope}`)
    }
  }

  lines.push('')
  lines.push('RELATIONSHIPS ON SCREEN (id | source -> destination | description):')
  // A relationship is drawn only when it's in the view's explicit relationship list
  // AND both endpoints are shown — the canvas renderer intersects the two (see
  // canvasBuilders). Endpoints-present alone would surface links the view
  // intentionally omits, grounding the assistant on relationships the user can't see.
  const viewRelIds = new Set(view.relationships.map((r) => r.id))
  const onScreenRels = ws.model.relationships.filter(
    (r) => viewRelIds.has(r.id) && viewElementIds.has(r.sourceId) && viewElementIds.has(r.destinationId),
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
