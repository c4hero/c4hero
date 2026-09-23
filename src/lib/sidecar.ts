import type { Workspace, ElementStatus, LineStyle } from '@/types/model'
import { allViewsOf, viewLayoutOf } from '@/store/workspace-helpers'
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
  locked?: boolean
  x?: number
  y?: number
}

interface SidecarView {
  /** View-level layout lock (freezes Auto-arrange + dragging for the view). */
  locked?: boolean
  elements?: Record<string, SidecarViewElement>
}

export interface SidecarData {
  version: 1
  explore?: Workspace['exploreLayout']
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
  if ('locked' in value && value.locked !== undefined && typeof value.locked !== 'boolean') return false
  if ('x' in value && value.x !== undefined && !isFiniteNumber(value.x)) return false
  if ('y' in value && value.y !== undefined && !isFiniteNumber(value.y)) return false
  return true
}

function isSidecarView(value: unknown): value is SidecarView {
  if (!isRecord(value)) return false
  if ('locked' in value && value.locked !== undefined && typeof value.locked !== 'boolean') return false
  if ('elements' in value && value.elements !== undefined && !isRecordOf(value.elements, isSidecarViewElement)) return false
  return true
}

function isSidecarData(value: unknown): value is SidecarData {
  if (!isRecord(value) || value.version !== 1) return false
  if (value.explore !== undefined) {
    if (!isRecord(value.explore)) return false
    const { direction, hiddenIds } = value.explore
    if (!isSidecarView(value.explore) || (direction !== undefined && !['TB', 'BT', 'LR', 'RL'].includes(String(direction))) ||
      (hiddenIds !== undefined && (!Array.isArray(hiddenIds) || !hiddenIds.every(id => typeof id === 'string')))) return false
  }
  if ('elements' in value && value.elements !== undefined && !isRecordOf(value.elements, isSidecarElement)) return false
  if ('relationships' in value && value.relationships !== undefined && !isRecordOf(value.relationships, isSidecarRelationship)) return false
  if ('views' in value && value.views !== undefined && !isRecordOf(value.views, isSidecarView)) return false
  return true
}

// ─── Extract sidecar from workspace ─────────────────────────────────

export function extractSidecar(workspace: Workspace): SidecarData | null {
  const sidecar: SidecarData = { version: 1 }
  if (workspace.exploreLayout) sidecar.explore = structuredClone(workspace.exploreLayout)

  // Note: status, owner, and lineStyle are now serialized in the DSL — not duplicated here.
  // SidecarElement + SidecarRelationship readers in applySidecar are kept for backward-compat
  // migration of existing sidecar files written by older versions of c4hero.

  // Start from layout whose view is not here right now. This projection is the
  // whole file — anything missing from it is deleted from disk — and a view can
  // go absent for reasons that are none of the user's doing, so their positions
  // are carried rather than dropped (TEA-342).
  const views: Record<string, SidecarView> = { ...(workspace.unmatchedLayout ?? {}) }

  // Views: hand-placed and locked elements, plus the view-level layout lock.
  // A lock is worth persisting on its own — it survives a re-layout, so it has
  // to survive a reload. A present view with layout speaks for its own key and
  // replaces anything carried under it; one without layout leaves the carried
  // entry alone, since `unmatchedLayout` holds only entries whose view really
  // is absent.
  for (const view of allViewsOf(workspace)) {
    const layout = viewLayoutOf(view)
    if (layout) views[view.key] = layout
  }

  // Layout is the only thing this projection writes, so "is there anything to
  // save?" is exactly "is `views` empty". A contentless `{version:1}` is not
  // worth a file: every caller gates on truthiness and would write one where it
  // used to write none.
  if (Object.keys(views).length === 0 && !sidecar.explore) return null
  sidecar.views = views
  return sidecar
}

// ─── Apply sidecar to workspace ─────────────────────────────────────

export function applySidecar(workspace: Workspace, sidecar: SidecarData): void {
  if (sidecar.version !== 1) return
  if (sidecar.explore && isSidecarData({ version: 1, explore: sidecar.explore })) workspace.exploreLayout = structuredClone(sidecar.explore)

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

  // Views: the view-level layout lock, plus hand-placed and locked elements
  if (sidecar.views) {
    // Entries no view claims are kept rather than dropped, so the next save
    // cannot delete layout just because its view is not here right now
    // (TEA-342). Rebuilt, not merged: it has to hold exactly what this pass
    // did not apply.
    const claimed = new Set<string>()
    for (const view of allViewsOf(workspace)) {
      const key = sidecar.views[view.key] !== undefined ? view.key
        : (view.originalKey && sidecar.views[view.originalKey] !== undefined ? view.originalKey : undefined)
      if (key !== undefined) claimed.add(key)
    }
    const unclaimed = Object.entries(sidecar.views).filter(([key]) => !claimed.has(key))
    workspace.unmatchedLayout = unclaimed.length > 0 ? Object.fromEntries(unclaimed) : undefined

    for (const view of allViewsOf(workspace)) {
      const viewData = sidecar.views[view.key]
        ?? (view.originalKey ? sidecar.views[view.originalKey] : undefined)
      if (!viewData) continue
      if (viewData.locked) view.locked = true
      if (!viewData.elements) continue
      for (const el of view.elements) {
        const elData = viewData.elements[el.id]
        // An entry with explicit pinned:false / locked:false is well-formed
        // per isSidecarViewElement — checking the entry's presence rather
        // than the truthiness of its fields is what makes that entry's x/y
        // apply instead of being silently dropped alongside the false flags.
        if (!elData) continue
        if (elData.pinned !== undefined) el.pinned = elData.pinned || undefined
        if (elData.locked !== undefined) el.locked = elData.locked || undefined
        if (isFiniteNumber(elData.x)) el.x = elData.x
        if (isFiniteNumber(elData.y)) el.y = elData.y
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
