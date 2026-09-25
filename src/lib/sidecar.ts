import type { Workspace, ElementStatus, LineStyle, SavedViewLayout } from '@/types/model'
import { allViewsOf } from '@/store/workspace-helpers'
import { createLogger } from '@/lib/logger'
import { isFiniteNumber, isRecord, isRecordOf } from '@/lib/guards'
import { sanitizeFilename } from '@/lib/filenames'
import { isElementStatusValue } from '@/lib/elementStatus'

const VALID_LINE_STYLES: ReadonlySet<string> = new Set<LineStyle>(['Curved', 'Straight', 'Orthogonal'])

// The status vocabulary is open, so a sidecar written against a vocabulary this
// machine has not declared still reads back — the value shape is what's checked.
const isValidStatus = isElementStatusValue

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

export interface SidecarData {
  version: 1
  elements?: Record<string, SidecarElement>
  relationships?: Record<string, SidecarRelationship>
  views?: Record<string, SavedViewLayout>
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

function isSidecarView(value: unknown): value is SavedViewLayout {
  if (!isRecord(value)) return false
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

  // Note: status, owner, and lineStyle are now serialized in the DSL — not duplicated here.
  // SidecarElement + SidecarRelationship readers in applySidecar are kept for backward-compat
  // migration of existing sidecar files written by older versions of c4hero.

  // Views: hand-placed and locked elements, plus the view-level layout lock.
  // A lock is worth persisting on its own — it survives a re-layout, so it
  // has to survive a reload.
  // Merge at element granularity: a missing view OR element is not evidence
  // that its hand-placed layout was deleted. Clone to keep extraction pure,
  // including when the workspace is frozen by Immer.
  const views: Record<string, SavedViewLayout> = Object.fromEntries(
    Object.entries(workspace.savedLayout ?? {}).map(([key, data]) =>
      [key, { ...data, ...(data.elements ? { elements: { ...data.elements } } : {}) }]),
  )
  for (const view of allViewsOf(workspace)) {
    const viewElements: Record<string, SidecarViewElement> = { ...views[view.key]?.elements }
    for (const el of view.elements) {
      // A live element is authoritative, including an explicit layout reset.
      delete viewElements[el.id]
      if (el.pinned || el.locked) {
        const entry: SidecarViewElement = {}
        if (el.pinned) entry.pinned = true
        if (el.locked) entry.locked = true
        if (el.x !== undefined) entry.x = el.x
        if (el.y !== undefined) entry.y = el.y
        viewElements[el.id] = entry
      }
    }
    const entry: SavedViewLayout = {}
    if (view.locked) {
      entry.locked = true
    }
    if (Object.keys(viewElements).length > 0) entry.elements = viewElements
    if (entry.locked || entry.elements) views[view.key] = entry
    else delete views[view.key]
  }
  if (Object.keys(views).length === 0 && workspace.savedLayout === undefined) return null
  // Do not return null after clearing loaded layout: save callers must write
  // the empty map, otherwise the old file resurrects positions on reopen.
  sidecar.views = views
  return sidecar
}

// ─── Apply sidecar to workspace ─────────────────────────────────────

export function applySidecar(workspace: Workspace, sidecar: SidecarData): void {
  if (sidecar.version !== 1) return
  workspace.savedLayout = Object.fromEntries(
    Object.entries(sidecar.views ?? {}).map(([key, data]) => [key, {
      ...data,
      ...(data.elements ? { elements: Object.fromEntries(
        Object.entries(data.elements).map(([id, el]) => [id, { ...el }]),
      ) } : {}),
    }]),
  )

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
    for (const view of allViewsOf(workspace)) {
      const viewData = sidecar.views[view.key]
        ?? (view.originalKey ? sidecar.views[view.originalKey] : undefined)
      if (!viewData) continue
      // Migrate only the parser's explicit key normalization alias. Never
      // infer ownership from key prefixes, declaration order or element overlap.
      // Guarded: two views can share one originalKey (the same non-conformant
      // authored key declared twice), and the first of them already moved the
      // entry — without this the second would store `undefined` under its key
      // and every later savedLayout walk would throw on it.
      if (!Object.hasOwn(sidecar.views, view.key) && view.originalKey) {
        const carried = workspace.savedLayout[view.originalKey]
        if (carried !== undefined) {
          workspace.savedLayout[view.key] = carried
          delete workspace.savedLayout[view.originalKey]
        }
      }
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
