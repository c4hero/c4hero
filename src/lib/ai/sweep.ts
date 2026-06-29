import type { Workspace, ModelElement } from '@/types/model'
import type { EditOp } from './types'
import { flattenElements, relationshipsMissingDescription } from './context'

// Pure, deterministic logic for the Guided Sweep's "Missing info" category and
// the instant model-health readout. No AI, no store access — unit-tested in
// isolation. AI-backed categories (review/interview/repo) are wired separately
// in the panel; this module only covers what we can compute instantly.

export type GapKind = 'title' | 'desc' | 'tech' | 'rel'

/** A single, instantly-detectable hole in the model the sweep can fix. */
export interface MissingGap {
  /** Stable identity across re-computation: `${kind}:${targetId}`. */
  key: string
  kind: GapKind
  /** Element id, or relationship id when `targetKind` is 'relationship'. */
  targetId: string
  targetKind: 'element' | 'relationship'
  /** Display label — element name, or "Source → Destination" for a relationship. */
  label: string
  /** Element type, for picking an icon (absent for relationship gaps). */
  elementType?: ModelElement['type']
}

function blank(value?: string): boolean {
  return !value || value.trim().length === 0
}

/**
 * Every instantly-detectable missing-info gap, in sweep order: titles first
 * (most glaring), then descriptions, technologies, and untyped relationships.
 */
export function missingInfoGaps(ws: Workspace): MissingGap[] {
  const gaps: MissingGap[] = []
  // Flatten the model ONCE and reuse it for desc/tech gaps and the name map
  // (these loops previously re-walked the whole tree three times).
  const els = flattenElements(ws)
  const names = new Map(els.map((el) => [el.id, el.name]))

  // title — element with an empty/whitespace name (rare; no auto-placeholders).
  for (const el of els) {
    if (blank(el.name)) {
      gaps.push({ key: `title:${el.id}`, kind: 'title', targetId: el.id, targetKind: 'element', label: '(unnamed element)', elementType: el.type })
    }
  }

  // desc — any element with no description.
  for (const el of els) {
    if (blank(el.description)) {
      gaps.push({ key: `desc:${el.id}`, kind: 'desc', targetId: el.id, targetKind: 'element', label: el.name || '(unnamed element)', elementType: el.type })
    }
  }

  // tech — containers/components with no technology.
  for (const el of els) {
    if ((el.type === 'container' || el.type === 'component') && blank(el.technology)) {
      gaps.push({ key: `tech:${el.id}`, kind: 'tech', targetId: el.id, targetKind: 'element', label: el.name || '(unnamed element)', elementType: el.type })
    }
  }

  // rel — relationships with no description (untyped links).
  for (const r of relationshipsMissingDescription(ws)) {
    const label = `${names.get(r.sourceId) ?? r.sourceId} → ${names.get(r.destinationId) ?? r.destinationId}`
    gaps.push({ key: `rel:${r.id}`, kind: 'rel', targetId: r.id, targetKind: 'relationship', label })
  }

  return gaps
}

// ─── Model health (instant coverage %) ──────────────────────────────

interface HealthCounts {
  /** Total fillable slots: descriptions + technologies + relationship labels. */
  checkable: number
  /** Slots already filled. */
  filled: number
}

/**
 * Coverage over the three things the sweep can fix: element descriptions,
 * container/component technologies, and relationship descriptions. Titles are
 * excluded — names are effectively always present, so they'd only pad the
 * denominator with always-filled slots.
 */
function healthCounts(ws: Workspace): HealthCounts {
  const els = flattenElements(ws)
  const techBearing = els.filter((e) => e.type === 'container' || e.type === 'component')
  const rels = ws.model.relationships ?? []

  const descSlots = els.length
  const descFilled = els.filter((e) => !blank(e.description)).length
  const techSlots = techBearing.length
  const techFilled = techBearing.filter((e) => !blank(e.technology)).length
  const relSlots = rels.length
  const relFilled = rels.filter((r) => !blank(r.description)).length

  return { checkable: descSlots + techSlots + relSlots, filled: descFilled + techFilled + relFilled }
}

/** Instant model-health percentage (0–100). 100 for an empty model. */
export function modelHealthPercent(ws: Workspace): number {
  const { checkable, filled } = healthCounts(ws)
  if (checkable === 0) return 100
  return Math.round((filled / checkable) * 100)
}

/**
 * Health % projected once the given staged missing-info gaps are applied.
 * Title gaps don't move coverage, so they're ignored here.
 */
export function projectedHealthPercent(ws: Workspace, stagedKeys: ReadonlySet<string>): number {
  const { checkable, filled } = healthCounts(ws)
  if (checkable === 0) return 100
  const add = missingInfoGaps(ws).filter((g) => g.kind !== 'title' && stagedKeys.has(g.key)).length
  return Math.round((Math.min(filled + add, checkable) / checkable) * 100)
}

// ─── Gap → edit operation ───────────────────────────────────────────

/** Turn a gap and its (possibly user-edited) draft value into an edit op. */
export function gapToOp(gap: MissingGap, value: string): EditOp {
  const v = value.trim()
  switch (gap.kind) {
    case 'desc': return { op: 'updateElement', id: gap.targetId, description: v }
    case 'tech': return { op: 'updateElement', id: gap.targetId, technology: v }
    case 'title': return { op: 'updateElement', id: gap.targetId, name: v }
    case 'rel': return { op: 'updateRelationship', id: gap.targetId, description: v }
  }
}

/** The pre-change value of one field an update-op will overwrite, so apply-as-you-go
 *  changes can be reverted exactly. */
export interface Restore { kind: 'element' | 'relationship'; id: string; patch: { name?: string; description?: string; technology?: string } }

/** Read the current value of every field the given update-ops would overwrite, so
 *  a later revert can put each back. Add-ops contribute nothing here — they revert
 *  by deleting what they created (their ids are captured after the apply, not here).
 *  Call this BEFORE applying the ops. */
export function captureRestores(ws: Workspace, ops: EditOp[]): Restore[] {
  const flat = flattenElements(ws)
  const out: Restore[] = []
  for (const op of ops) {
    if (op.op === 'updateElement') {
      const el = flat.find((e) => e.id === op.id)
      if (!el) continue
      const patch: Restore['patch'] = {}
      if (op.name !== undefined) patch.name = el.name ?? ''
      if (op.description !== undefined) patch.description = el.description ?? ''
      if (op.technology !== undefined) patch.technology = el.technology ?? ''
      out.push({ kind: 'element', id: op.id, patch })
    } else if (op.op === 'updateRelationship') {
      const r = ws.model.relationships.find((x) => x.id === op.id)
      if (!r) continue
      const patch: Restore['patch'] = {}
      if (op.description !== undefined) patch.description = r.description ?? ''
      if (op.technology !== undefined) patch.technology = r.technology ?? ''
      out.push({ kind: 'relationship', id: op.id, patch })
    }
  }
  return out
}
