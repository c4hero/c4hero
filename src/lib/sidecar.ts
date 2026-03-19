import type { Workspace, ElementStatus, LineStyle } from '@/types/model'
import { buildElementMap, allViewsOf } from '@/store/workspace'
import { createLogger } from '@/lib/logger'

const log = createLogger('sidecar')

// ─── Sidecar schema ─────────────────────────────────────────────────
// Stores c4hero-specific metadata that isn't part of the Structurizr DSL.

interface SidecarElement {
  status?: ElementStatus
  owner?: string
}

interface SidecarRelationship {
  lineStyle?: LineStyle
}

interface SidecarViewElement {
  pinned?: boolean
}

interface SidecarView {
  elements?: Record<string, SidecarViewElement>
}

export interface SidecarData {
  version: 1
  elements?: Record<string, SidecarElement>
  relationships?: Record<string, SidecarRelationship>
  views?: Record<string, SidecarView>
}

// ─── Extract sidecar from workspace ─────────────────────────────────

export function extractSidecar(workspace: Workspace): SidecarData | null {
  const sidecar: SidecarData = { version: 1 }
  let hasData = false

  // Elements: status, owner
  const elementMap = buildElementMap(workspace)
  const elements: Record<string, SidecarElement> = {}
  for (const [id, el] of elementMap) {
    const entry: SidecarElement = {}
    if (el.status) entry.status = el.status
    if (el.owner) entry.owner = el.owner
    if (Object.keys(entry).length > 0) {
      elements[id] = entry
      hasData = true
    }
  }
  if (Object.keys(elements).length > 0) sidecar.elements = elements

  // Relationships: lineStyle
  const relationships: Record<string, SidecarRelationship> = {}
  for (const rel of workspace.model.relationships) {
    if (rel.lineStyle) {
      relationships[rel.id] = { lineStyle: rel.lineStyle }
      hasData = true
    }
  }
  if (Object.keys(relationships).length > 0) sidecar.relationships = relationships

  // Views: pinned elements
  const views: Record<string, SidecarView> = {}
  for (const view of allViewsOf(workspace)) {
    const viewElements: Record<string, SidecarViewElement> = {}
    for (const el of view.elements) {
      if (el.pinned) {
        viewElements[el.id] = { pinned: true }
        hasData = true
      }
    }
    if (Object.keys(viewElements).length > 0) {
      views[view.key] = { elements: viewElements }
    }
  }
  if (Object.keys(views).length > 0) sidecar.views = views

  return hasData ? sidecar : null
}

// ─── Apply sidecar to workspace ─────────────────────────────────────

export function applySidecar(workspace: Workspace, sidecar: SidecarData): void {
  if (sidecar.version !== 1) return

  // Elements — only apply known sidecar properties
  if (sidecar.elements) {
    const ALLOWED_ELEMENT_KEYS: (keyof SidecarElement)[] = ['status', 'owner']
    const sanitize = (data: SidecarElement): SidecarElement => {
      const clean: SidecarElement = {}
      for (const key of ALLOWED_ELEMENT_KEYS) {
        if (key in data) (clean as Record<string, unknown>)[key] = data[key]
      }
      return clean
    }
    const applyToElement = (id: string, data: SidecarElement) => {
      const safe = sanitize(data)
      // People
      for (const p of workspace.model.people) {
        if (p.id === id) { Object.assign(p, safe); return }
      }
      // Systems, containers, components
      for (const sys of workspace.model.softwareSystems) {
        if (sys.id === id) { Object.assign(sys, safe); return }
        for (const c of sys.containers) {
          if (c.id === id) { Object.assign(c, safe); return }
          for (const comp of c.components) {
            if (comp.id === id) { Object.assign(comp, safe); return }
          }
        }
      }
    }
    for (const [id, data] of Object.entries(sidecar.elements)) {
      applyToElement(id, data)
    }
  }

  // Relationships
  if (sidecar.relationships) {
    for (const rel of workspace.model.relationships) {
      const data = sidecar.relationships[rel.id]
      if (data) {
        if (data.lineStyle) rel.lineStyle = data.lineStyle
      }
    }
  }

  // Views: pinned
  if (sidecar.views) {
    for (const view of allViewsOf(workspace)) {
      const viewData = sidecar.views[view.key]
      if (!viewData?.elements) continue
      for (const el of view.elements) {
        const elData = viewData.elements[el.id]
        if (elData?.pinned) el.pinned = true
      }
    }
  }
}

// ─── Sidecar filename ───────────────────────────────────────────────

export function sidecarName(dslName: string): string {
  return dslName.replace(/\.dsl$/, '') + '.c4hero.json'
}

export function serializeSidecar(data: SidecarData): string {
  return JSON.stringify(data, null, 2)
}

export function parseSidecar(json: string): SidecarData | null {
  try {
    const data = JSON.parse(json)
    if (!data || typeof data !== 'object' || data.version !== 1) return null
    // Validate expected shape — elements/relationships/views should be objects if present
    if (data.elements && typeof data.elements !== 'object') return null
    if (data.relationships && typeof data.relationships !== 'object') return null
    if (data.views && typeof data.views !== 'object') return null
    return data as SidecarData
  } catch (err) {
    log.warn('Failed to parse sidecar JSON', err)
    return null
  }
}
