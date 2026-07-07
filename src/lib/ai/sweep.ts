import type { Workspace, ModelElement } from '@/types/model'
import type { EditOp } from './types'
import { flattenElements, relationshipsMissingDescription, isBlank } from './context'

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

/**
 * Every instantly-detectable missing-info gap, in sweep order: titles first
 * (most glaring), then descriptions, technologies, and untyped relationships.
 * When `scopeIds` is given (the element + relationship ids shown in a view), only
 * gaps for those targets are returned — so "Improve this view" stays in-view.
 */
export function missingInfoGaps(ws: Workspace, scopeIds?: ReadonlySet<string>): MissingGap[] {
  const gaps: MissingGap[] = []
  // Flatten the model ONCE and reuse it for desc/tech gaps and the name map
  // (these loops previously re-walked the whole tree three times).
  const all = flattenElements(ws)
  const names = new Map(all.map((el) => [el.id, el.name]))
  const els = scopeIds ? all.filter((el) => scopeIds.has(el.id)) : all

  // title — element with an empty/whitespace name (rare; no auto-placeholders).
  for (const el of els) {
    if (isBlank(el.name)) {
      gaps.push({ key: `title:${el.id}`, kind: 'title', targetId: el.id, targetKind: 'element', label: '(unnamed element)', elementType: el.type })
    }
  }

  // desc — any element with no description.
  for (const el of els) {
    if (isBlank(el.description)) {
      gaps.push({ key: `desc:${el.id}`, kind: 'desc', targetId: el.id, targetKind: 'element', label: el.name || '(unnamed element)', elementType: el.type })
    }
  }

  // tech — containers/components with no technology.
  for (const el of els) {
    if ((el.type === 'container' || el.type === 'component') && isBlank(el.technology)) {
      gaps.push({ key: `tech:${el.id}`, kind: 'tech', targetId: el.id, targetKind: 'element', label: el.name || '(unnamed element)', elementType: el.type })
    }
  }

  // rel — relationships with no description (untyped links).
  for (const r of relationshipsMissingDescription(ws)) {
    if (scopeIds && !scopeIds.has(r.id)) continue
    const label = `${names.get(r.sourceId) ?? r.sourceId} → ${names.get(r.destinationId) ?? r.destinationId}`
    gaps.push({ key: `rel:${r.id}`, kind: 'rel', targetId: r.id, targetKind: 'relationship', label })
  }

  return gaps
}

// ─── Model health (instant coverage %) ──────────────────────────────

/** Field-level completeness for the review header ("X of Y fields complete").
 *  Always-present fields are counted in BOTH the
 *  numerator and the denominator — each element's type (and its name, when set)
 *  plus each relationship's endpoints — so a fresh model reads as mostly
 *  complete instead of a discouraging 0%. */
export function healthFieldCounts(ws: Workspace, scopeIds?: ReadonlySet<string>): { filled: number; total: number; pct: number } {
  const all = flattenElements(ws)
  const els = scopeIds ? all.filter((e) => scopeIds.has(e.id)) : all
  const rels = (ws.model.relationships ?? []).filter((r) => !scopeIds || scopeIds.has(r.id))

  // Always-present slots: type per element, endpoints per relationship.
  let total = els.length + rels.length
  let filled = els.length + rels.length
  for (const el of els) {
    total += 2 // name + description
    if (!isBlank(el.name)) filled += 1
    if (!isBlank(el.description)) filled += 1
    if (el.type === 'container' || el.type === 'component') {
      total += 1
      if (!isBlank(el.technology)) filled += 1
    }
  }
  for (const r of rels) {
    total += 1
    if (!isBlank(r.description)) filled += 1
  }
  return { filled, total, pct: total === 0 ? 100 : Math.round((filled / total) * 100) }
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

