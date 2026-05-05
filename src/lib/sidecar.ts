import type { Workspace, ElementStatus, LineStyle } from '@/types/model'
import { allViewsOf } from '@/store/workspace-helpers'
import { createLogger } from '@/lib/logger'
import { isFiniteNumber, isRecord, isRecordOf } from '@/lib/guards'
import { sanitizeFilename } from '@/lib/filenames'

const VALID_STATUSES: ReadonlySet<string> = new Set<ElementStatus>(['Live', 'Planned', 'Deprecated', 'Removed'])
const VALID_LINE_STYLES: ReadonlySet<string> = new Set<LineStyle>(['Curved', 'Straight', 'Orthogonal'])

function isValidStatus(v: unknown): v is ElementStatus {
  return typeof v === 'string' && VALID_STATUSES.has(v)
}

function isValidLineStyle(v: unknown): v is LineStyle {
  return typeof v === 'string' && VALID_LINE_STYLES.has(v)
}

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
  x?: number
  y?: number
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

function isSidecarElement(value: unknown): value is SidecarElement {
  if (!isRecord(value)) return false
  if ('status' in value && value.status !== undefined && !isValidStatus(value.status)) return false
  if ('owner' in value && value.owner !== undefined && typeof value.owner !== 'string') return false
  return true
}

function isSidecarRelationship(value: unknown): value is SidecarRelationship {
  if (!isRecord(value)) return false
  if ('lineStyle' in value && value.lineStyle !== undefined && !isValidLineStyle(value.lineStyle)) return false
  return true
}

function isSidecarViewElement(value: unknown): value is SidecarViewElement {
  if (!isRecord(value)) return false
  if ('pinned' in value && value.pinned !== undefined && typeof value.pinned !== 'boolean') return false
  if ('x' in value && value.x !== undefined && !isFiniteNumber(value.x)) return false
  if ('y' in value && value.y !== undefined && !isFiniteNumber(value.y)) return false
  return true
}

function isSidecarView(value: unknown): value is SidecarView {
  if (!isRecord(value)) return false
  if ('elements' in value && value.elements !== undefined && !isRecordOf(value.elements, isSidecarViewElement)) return false
  return true
}

function isSidecarData(value: unknown): value is SidecarData {
  if (!isRecord(value) || value.version !== 1) return false
  if ('elements' in value && value.elements !== undefined && !isRecordOf(value.elements, isSidecarElement)) return false
  if ('relationships' in value && value.relationships !== undefined && !isRecordOf(value.relationships, isSidecarRelationship)) return false
  if ('views' in value && value.views !== undefined && !isRecordOf(value.views, isSidecarView)) return false
  return true
}

// ─── Extract sidecar from workspace ─────────────────────────────────

export function extractSidecar(workspace: Workspace): SidecarData | null {
  const sidecar: SidecarData = { version: 1 }
  let hasData = false

  // Note: status, owner, and lineStyle are now serialized in the DSL — not duplicated here.
  // SidecarElement + SidecarRelationship readers in applySidecar are kept for backward-compat
  // migration of existing sidecar files written by older versions of c4hero.

  // Views: pinned elements
  const views: Record<string, SidecarView> = {}
  for (const view of allViewsOf(workspace)) {
    const viewElements: Record<string, SidecarViewElement> = {}
    for (const el of view.elements) {
      if (el.pinned) {
        const entry: SidecarViewElement = { pinned: true }
        if (el.x !== undefined) entry.x = el.x
        if (el.y !== undefined) entry.y = el.y
        viewElements[el.id] = entry
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
    const applyToElement = (id: string, data: SidecarElement) => {
      // Explicit property-by-property assignment with runtime type validation.
      // No Object.assign — avoids prototype pollution and enforces valid union values.
      // DSL is the authoritative source; sidecar is a migration fallback for files
      // written before status/owner were serialized in the DSL.
      const applyProps = (el: { status?: ElementStatus; owner?: string }) => {
        if (el.status === undefined && isValidStatus(data.status)) el.status = data.status
        if (el.owner === undefined && typeof data.owner === 'string') el.owner = data.owner
      }
      // People
      for (const p of workspace.model.people) {
        if (p.id === id) { applyProps(p); return }
      }
      // Systems, containers, components
      for (const sys of workspace.model.softwareSystems) {
        if (sys.id === id) { applyProps(sys); return }
        for (const c of sys.containers) {
          if (c.id === id) { applyProps(c); return }
          for (const comp of c.components) {
            if (comp.id === id) { applyProps(comp); return }
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
        if (isValidLineStyle(data.lineStyle)) rel.lineStyle = data.lineStyle
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
        if (elData?.pinned) {
          el.pinned = true
          if (isFiniteNumber(elData.x)) el.x = elData.x
          if (isFiniteNumber(elData.y)) el.y = elData.y
        }
      }
    }
  }
}

// ─── Sidecar filename ───────────────────────────────────────────────

export function sidecarName(dslName: string): string {
  const baseName = dslName.replace(/\.dsl$/i, '')
  const safeBaseName = sanitizeFilename(baseName)
  return `${safeBaseName === 'download' ? 'workspace' : safeBaseName}.c4hero.json`
}

export function serializeSidecar(data: SidecarData): string {
  return JSON.stringify(data, null, 2)
}

export function parseSidecar(json: string): SidecarData | null {
  try {
    const data = JSON.parse(json)
    return isSidecarData(data) ? data : null
  } catch (err) {
    log.warn('Failed to parse sidecar JSON', err)
    return null
  }
}
