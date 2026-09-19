import type { Workspace, ElementStatus, LineStyle, StoredViewLayout, StoredViewIdentity, ViewType } from '@/types/model'
import { allViewsOf, resolveViewLayouts, viewLayoutOf, storedIdentitySignature } from '@/store/workspace-helpers'
import type { LayoutCandidate } from '@/store/workspace-helpers'
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

// The file's view section *is* `StoredViewLayout` — the same shape the store
// parks under `workspace.unmatchedLayout` and `viewLayoutOf` projects. Aliased
// rather than restated so the two cannot drift: `extractSidecar` spreads
// parked entries straight into the file.
type SidecarViewElement = NonNullable<StoredViewLayout['elements']>[string]
type SidecarView = StoredViewLayout

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
  if ('locked' in value && value.locked !== undefined && typeof value.locked !== 'boolean') return false
  if ('x' in value && value.x !== undefined && !isFiniteNumber(value.x)) return false
  if ('y' in value && value.y !== undefined && !isFiniteNumber(value.y)) return false
  return true
}

const VIEW_TYPES: ReadonlySet<string> = new Set<ViewType>([
  'systemLandscape', 'systemContext', 'container', 'component', 'dynamic', 'deployment',
])

/** The identity an entry claims to belong to. A malformed one is not fatal —
 *  the entry simply falls back to being matched by its key, as entries written
 *  before identities existed are — but it must never reach the matcher as a
 *  half-built object, so the whole field is rejected unless it is sound. */
function isStoredViewIdentity(value: unknown): value is StoredViewIdentity {
  if (!isRecord(value)) return false
  if (typeof value.type !== 'string' || !VIEW_TYPES.has(value.type)) return false
  for (const field of ['key', 'softwareSystemId', 'containerId', 'environment'] as const) {
    if (field in value && value[field] !== undefined && typeof value[field] !== 'string') return false
  }
  return true
}

function isSidecarView(value: unknown): value is SidecarView {
  if (!isRecord(value)) return false
  if ('view' in value && value.view !== undefined && !isStoredViewIdentity(value.view)) return false
  if ('locked' in value && value.locked !== undefined && typeof value.locked !== 'boolean') return false
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
  // Start from layout whose view is not here right now. This projection is
  // the whole file — anything missing from it is deleted from disk — and a
  // view can go absent for reasons that are none of the user's doing, so
  // their positions are carried rather than dropped (TEA-342).
  const views: Record<string, SidecarView> = { ...(workspace.unmatchedLayout ?? {}) }

  // Note: status, owner, and lineStyle are now serialized in the DSL — not duplicated here.
  // SidecarElement + SidecarRelationship readers in applySidecar are kept for backward-compat
  // migration of existing sidecar files written by older versions of c4hero.

  // Views: hand-placed and locked elements, plus the view-level layout lock.
  // A lock is worth persisting on its own — it survives a re-layout, so it
  // has to survive a reload.
  //
  // A present view with layout overwrites whatever is carried under its key.
  // One *without* layout leaves the carried entry alone: `unmatchedLayout` is
  // rebuilt from scratch on every parse and holds only entries a matcher
  // deliberately declined to hand out, so a live view's key appearing there
  // means the pairing was contested — not that the entry is stale. Clearing
  // it here would delete the layout that declining was supposed to protect.
  for (const view of allViewsOf(workspace)) {
    const layout = viewLayoutOf(view)
    if (layout) views[view.key] = layout
  }
  // Layout is the only thing this projection writes, so "is there anything to
  // save?" is exactly "did any view survive the pass above". Deciding it up
  // front from the carried entries would claim a sidecar is worth writing
  // after a present view cleared the last of them.
  if (Object.keys(views).length === 0) return null
  sidecar.views = views
  return sidecar
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

  // Views: the view-level layout lock, plus hand-placed and locked elements
  if (sidecar.views) {
    // A derived view key is renumbered when a sibling with the same base comes
    // or goes, so a sidecar written before that shift stores this view's layout
    // under a key nothing matches any more. An entry that carries its own
    // identity says what it is for, so the key is not consulted at all; one
    // written before that falls back to the key as a migration path (TEA-342).
    const views = allViewsOf(workspace)
    const candidates: LayoutCandidate<SidecarView>[] = Object.entries(sidecar.views).map(([key, entry]) => ({
      key,
      signature: entry.view ? storedIdentitySignature(entry.view) : undefined,
      elementIds: Object.keys(entry.elements ?? {}),
      value: entry,
    }))

    const { byView, unclaimed } = resolveViewLayouts(views, candidates)
    // Anything no view took is kept verbatim so the next save cannot delete
    // it. This is what makes declining an ambiguous match safe rather than
    // destructive. Rebuilt, not merged: `unmatchedLayout` has to hold exactly
    // what this pass declined, because `extractSidecar` trusts that an entry
    // sitting there was deliberately preserved rather than left over.
    workspace.unmatchedLayout = unclaimed.length > 0
      ? Object.fromEntries(unclaimed.map((c) => [c.key, c.value]))
      : undefined
    for (const view of views) {
      const viewData = byView.get(view)
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
