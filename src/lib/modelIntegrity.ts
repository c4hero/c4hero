// Model-integrity checker — a pure, non-throwing oracle used to certify that a
// workspace's structural invariants hold after AI-driven edits are applied.
//
// This is intentionally *separate* from src/lib/scopeValidation.ts, which is a
// stricter, user-facing lint (workspace-scope rules, "can containers exist
// here" etc). This module instead answers a narrower, lower-level question:
// "is this Workspace even a well-formed model?" — duplicate ids, dangling
// relationships, broken hierarchy nesting, and views that point at nothing.
// It exists so tests (and, in dev builds, the store) can assert zero
// violations after every EditPlan apply, no matter how adversarial the plan.
import type { Component, Container, Model, ModelElement, Person, Relationship, SoftwareSystem, View, Workspace } from '@/types/model'

export interface IntegrityViolation {
  code: string
  message: string
  elementId?: string
  relationshipId?: string
  viewKey?: string
}

/** Element plus which container (system id / container id) it was found nested under, if any. */
interface WalkedElement {
  element: ModelElement
  kind: ModelElement['type']
}

/**
 * Walk the model defensively, tolerating any shape of corruption (missing
 * arrays, non-array values, non-object entries) without throwing. Returns
 * every element found, plus a running list of structural violations
 * discovered along the way (missing containers/components arrays, non-object
 * array entries).
 */
function walkElements(model: Model | undefined | null, violations: IntegrityViolation[]): WalkedElement[] {
  const out: WalkedElement[] = []
  if (!model || typeof model !== 'object') return out

  const people = Array.isArray(model.people) ? model.people : []
  for (const p of people) {
    if (p && typeof p === 'object') out.push({ element: p as Person, kind: 'person' })
  }

  const systems = Array.isArray(model.softwareSystems) ? model.softwareSystems : []
  for (const s of systems) {
    if (!s || typeof s !== 'object') continue
    const system = s as SoftwareSystem
    out.push({ element: system, kind: 'softwareSystem' })

    // (c) structural hierarchy damage — missing/malformed containers array.
    if (!('containers' in system) || !Array.isArray(system.containers)) {
      violations.push({
        code: 'malformed-containers',
        message: `Software system "${String(system.name ?? system.id)}" has a missing or non-array "containers" field.`,
        elementId: typeof system.id === 'string' ? system.id : undefined,
      })
      continue
    }

    for (const c of system.containers) {
      if (!c || typeof c !== 'object') {
        violations.push({
          code: 'malformed-container-entry',
          message: `Software system "${String(system.name ?? system.id)}" has a non-object entry in its "containers" array.`,
          elementId: typeof system.id === 'string' ? system.id : undefined,
        })
        continue
      }
      const container = c as Container
      out.push({ element: container, kind: 'container' })

      if (!('components' in container) || !Array.isArray(container.components)) {
        violations.push({
          code: 'malformed-components',
          message: `Container "${String(container.name ?? container.id)}" has a missing or non-array "components" field.`,
          elementId: typeof container.id === 'string' ? container.id : undefined,
        })
        continue
      }

      for (const cmp of container.components) {
        if (!cmp || typeof cmp !== 'object') {
          violations.push({
            code: 'malformed-component-entry',
            message: `Container "${String(container.name ?? container.id)}" has a non-object entry in its "components" array.`,
            elementId: typeof container.id === 'string' ? container.id : undefined,
          })
          continue
        }
        out.push({ element: cmp as Component, kind: 'component' })
      }
    }
  }

  return out
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(v => typeof v === 'string')
}

/** Checks a workspace's model + views for structural integrity. Never throws. */
export function checkModelIntegrity(ws: Workspace): IntegrityViolation[] {
  const violations: IntegrityViolation[] = []
  if (!ws || typeof ws !== 'object') return violations

  const walked = walkElements(ws.model, violations)

  // (a) duplicate ids across all elements and relationships share one namespace.
  const seenIds = new Set<string>()
  const elementIdToKind = new Map<string, ModelElement['type']>()
  for (const { element, kind } of walked) {
    const id = element && typeof element.id === 'string' ? element.id : undefined
    if (!id) continue
    if (seenIds.has(id)) {
      violations.push({
        code: 'duplicate-id',
        message: `Id "${id}" is used by more than one element or relationship.`,
        elementId: id,
      })
    } else {
      seenIds.add(id)
    }
    // First occurrence wins for kind-based lookups (views/relationships).
    if (!elementIdToKind.has(id)) elementIdToKind.set(id, kind)
  }

  const relationships: Relationship[] = Array.isArray(ws.model?.relationships) ? ws.model.relationships : []
  for (const rel of relationships) {
    if (!rel || typeof rel !== 'object') continue
    const id = typeof rel.id === 'string' ? rel.id : undefined
    if (id) {
      if (seenIds.has(id)) {
        violations.push({
          code: 'duplicate-id',
          message: `Id "${id}" is used by more than one element or relationship.`,
          relationshipId: id,
        })
      } else {
        seenIds.add(id)
      }
    }

    // (b) dangling relationship endpoints.
    const sourceOk = typeof rel.sourceId === 'string' && elementIdToKind.has(rel.sourceId)
    const destOk = typeof rel.destinationId === 'string' && elementIdToKind.has(rel.destinationId)
    if (!sourceOk || !destOk) {
      violations.push({
        code: 'dangling-relationship',
        message: `Relationship "${id ?? '?'}" has a source or destination that does not resolve to an existing element.`,
        relationshipId: id,
      })
    }
  }

  // (d) external systems must not have containers.
  const systems = Array.isArray(ws.model?.softwareSystems) ? ws.model.softwareSystems : []
  for (const s of systems) {
    if (!s || typeof s !== 'object') continue
    const system = s as SoftwareSystem
    if (system.location === 'External' && Array.isArray(system.containers) && system.containers.length > 0) {
      violations.push({
        code: 'external-system-has-containers',
        message: `Software system "${String(system.name ?? system.id)}" is marked External but has ${system.containers.length} container(s).`,
        elementId: typeof system.id === 'string' ? system.id : undefined,
      })
    }
  }

  // (f) tags must be a string array on every element (and relationships, for good measure).
  for (const { element } of walked) {
    if (!isStringArray(element?.tags)) {
      violations.push({
        code: 'bad-tags',
        message: `Element "${String(element?.name ?? element?.id)}" has a "tags" field that is not a string array.`,
        elementId: typeof element?.id === 'string' ? element.id : undefined,
      })
    }
  }
  for (const rel of relationships) {
    if (!rel || typeof rel !== 'object') continue
    if (!isStringArray(rel.tags)) {
      violations.push({
        code: 'bad-tags',
        message: `Relationship "${String(rel.id)}" has a "tags" field that is not a string array.`,
        relationshipId: typeof rel.id === 'string' ? rel.id : undefined,
      })
    }
  }

  // (e) view scope + element/relationship reference resolution.
  const relIds = new Set(relationships.filter(r => r && typeof r === 'object' && typeof r.id === 'string').map(r => r.id))
  const views = ws.views && typeof ws.views === 'object' ? ws.views : undefined

  function checkViewRefs(view: View) {
    const key = typeof view?.key === 'string' ? view.key : undefined
    const viewElements = Array.isArray(view?.elements) ? view.elements : []
    for (const ve of viewElements) {
      if (!ve || typeof ve !== 'object' || typeof ve.id !== 'string' || !elementIdToKind.has(ve.id)) {
        violations.push({
          code: 'dangling-view-ref',
          message: `View "${key ?? '?'}" references an element id that does not exist in the model.`,
          viewKey: key,
        })
      }
    }
    const viewRelationships = Array.isArray(view?.relationships) ? view.relationships : []
    for (const vr of viewRelationships) {
      if (!vr || typeof vr !== 'object' || typeof vr.id !== 'string' || !relIds.has(vr.id)) {
        violations.push({
          code: 'dangling-view-ref',
          message: `View "${key ?? '?'}" references a relationship id that does not exist in the model.`,
          viewKey: key,
        })
      }
    }
  }

  function checkScope(view: View, field: 'softwareSystemId' | 'containerId', wantKind: ModelElement['type']) {
    const key = typeof view?.key === 'string' ? view.key : undefined
    const scopeId = view ? (view as unknown as Record<string, unknown>)[field] : undefined
    if (typeof scopeId !== 'string' || elementIdToKind.get(scopeId) !== wantKind) {
      violations.push({
        code: 'bad-view-scope',
        message: `View "${key ?? '?'}" has a scope reference that does not resolve to an existing ${wantKind}.`,
        viewKey: key,
      })
    }
  }

  if (views) {
    // systemLandscapeViews have no element/container scope — only ref checks apply.
    for (const v of Array.isArray(views.systemLandscapeViews) ? views.systemLandscapeViews : []) {
      if (!v || typeof v !== 'object') continue
      checkViewRefs(v)
    }
    for (const v of Array.isArray(views.systemContextViews) ? views.systemContextViews : []) {
      if (!v || typeof v !== 'object') continue
      checkScope(v, 'softwareSystemId', 'softwareSystem')
      checkViewRefs(v)
    }
    for (const v of Array.isArray(views.containerViews) ? views.containerViews : []) {
      if (!v || typeof v !== 'object') continue
      checkScope(v, 'softwareSystemId', 'softwareSystem')
      checkViewRefs(v)
    }
    for (const v of Array.isArray(views.componentViews) ? views.componentViews : []) {
      if (!v || typeof v !== 'object') continue
      checkScope(v, 'containerId', 'container')
      checkViewRefs(v)
    }
  }

  return violations
}
