import type { Workspace, ElementStatus, LineStyle, SavedViewLayout, View } from '@/types/model'
import { allViewsOf } from '@/store/workspace-helpers'
import { createLogger } from '@/lib/logger'
import { isFiniteNumber, isRecord, isRecordOf } from '@/lib/guards'
import { sanitizeFilename } from '@/lib/filenames'
import { isElementStatusValue, normalizeElementStatus } from '@/lib/elementStatus'
import { isStoredViewIdentity, resolveViewLayouts, viewIdentityOf } from '@/lib/layoutIdentity'
import type { LayoutCandidate } from '@/lib/layoutIdentity'

const VALID_LINE_STYLES: ReadonlySet<string> = new Set<LineStyle>(['Curved', 'Straight', 'Orthogonal'])

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
  if ('status' in value && value.status !== undefined && !isElementStatusValue(value.status)) return false
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
    // Every entry says which view it belongs to, so it can be found again
    // after the view's derived key is renumbered (TEA-345).
    const entry: SavedViewLayout = { view: viewIdentityOf(view) }
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
  // Elements — only apply known sidecar properties
  if (sidecar.elements) {
    const applyToElement = (id: string, data: SidecarElement) => {
      // Explicit property-by-property assignment with runtime type validation.
      // No Object.assign — avoids prototype pollution and enforces valid union values.
      // DSL is the authoritative source; sidecar is a migration fallback for files
      // written before status/owner were serialized in the DSL.
      const applyProps = (el: { status?: ElementStatus; owner?: string }) => {
        const status = normalizeElementStatus(data.status)
        if (el.status === undefined && status !== undefined) el.status = status
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

  // Views: the view-level layout lock, plus hand-placed and locked elements.
  // Each entry is matched to its view on the identity it records, falling
  // back to its key only when it records none (TEA-345).
  const views = allViewsOf(workspace)
  const candidates: LayoutCandidate<SavedViewLayout>[] = Object.entries(sidecar.views ?? {}).map(([key, data]) => {
    const { view: identity, ...rest } = data
    const trusted = isStoredViewIdentity(identity) ? { ...identity } : undefined
    return {
      key,
      identity: trusted,
      elementIds: Object.keys(data.elements ?? {}),
      value: {
        ...(trusted && { view: trusted }),
        ...rest,
        ...(rest.elements ? { elements: Object.fromEntries(
          Object.entries(rest.elements).map(([id, el]) => [id, { ...el }]),
        ) } : {}),
      },
    }
  })
  const byView = resolveViewLayouts(views, candidates)

  // Re-file every entry under the key of the view that now owns it, so the
  // rest of the store can keep looking layout up by `view.key`. An entry no
  // view took is kept — declining a match must never cost the layout — but
  // moved out of any slot a live view answers to, where the next save would
  // otherwise merge it into that view's layout.
  const owners = new Map<LayoutCandidate<SavedViewLayout>, View[]>()
  for (const [view, c] of byView) owners.set(c, [...(owners.get(c) ?? []), view])
  const liveKeys = new Set(views.map((v) => v.key))
  const saved: Record<string, SavedViewLayout> = Object.create(null)
  for (const c of candidates) {
    // Two views can share one authored key; they share its entry too. A
    // second, different entry for that key is parked rather than overwrite it.
    const taken = owners.get(c)?.filter((view) => !Object.hasOwn(saved, view.key))
    if (taken?.length) {
      for (const view of taken) saved[view.key] = c.value
      continue
    }
    let slot = c.key
    for (let n = 2; liveKeys.has(slot) || Object.hasOwn(saved, slot); n++) slot = `${c.key}~${n}`
    saved[slot] = c.value
  }
  workspace.savedLayout = saved

  for (const view of views) {
    const viewData = byView.get(view)?.value
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
    if (!isSidecarData(data)) return null
    // Identity is an optional addition to version 1. Reject only the bad
    // identity, leaving the layout available to the legacy key matcher.
    for (const entry of Object.values(data.views ?? {})) {
      if (!isStoredViewIdentity(entry.view)) delete entry.view
    }
    return data
  } catch (err) {
    log.warn('Failed to parse sidecar JSON', err)
    return null
  }
}
