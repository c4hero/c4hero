import type { StoredViewIdentity, View, ViewType } from '@/types/model'
import { isRecord } from '@/lib/guards'

// Which view a piece of stored layout belongs to (TEA-345).
//
// Layout is filed under a view key, but for a view the DSL does not name that
// key is derived from the scope and numbered by declaration order
// (`Containers-payments`, `Containers-payments-2`), so it moves when a
// same-scope sibling is added, deleted or reordered. Matching on the key then
// hands one view another's layout. Reconstructing identity from the key alone
// was tried in PR #202 and every guess found a new way to be wrong, so each
// entry now records what it is for, and the key is only a storage slot.

/** The identity to store alongside a view's layout. */
export function viewIdentityOf(v: View): StoredViewIdentity {
  return {
    ...(!v.autoKey && { key: v.key }),
    type: v.type,
    ...(v.softwareSystemId !== undefined && { softwareSystemId: v.softwareSystemId }),
    ...(v.containerId !== undefined && { containerId: v.containerId }),
    ...(v.environment !== undefined && { environment: v.environment }),
    elementIds: [...new Set(v.elements.map((el) => el.id))].sort(),
  }
}

/** One comparable string per identity. An authored key is unique on its own,
 *  so it is the whole identity: editing a named view's scope must not strand
 *  its layout. A derived key is not part of identity at all. */
function signatureOf(id: StoredViewIdentity): string {
  if (id.key !== undefined) return JSON.stringify(['key', id.key])
  return JSON.stringify(['scope', id.type, id.softwareSystemId, id.containerId, id.environment])
}

const VIEW_TYPES: ReadonlySet<string> = new Set<ViewType>([
  'systemLandscape', 'systemContext', 'container', 'component', 'dynamic', 'deployment',
])

/** A stored identity is only trusted whole. A malformed one is treated as
 *  absent, so its entry falls back to key matching rather than failing the
 *  sidecar or reaching the matcher half-built. */
export function isStoredViewIdentity(value: unknown): value is StoredViewIdentity {
  if (!isRecord(value)) return false
  if (typeof value.type !== 'string' || !VIEW_TYPES.has(value.type)) return false
  for (const field of ['key', 'softwareSystemId', 'containerId', 'environment'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'string') return false
  }
  if (value.elementIds !== undefined
    && (!Array.isArray(value.elementIds) || !value.elementIds.every((id) => typeof id === 'string'))) return false
  return true
}

/** One piece of layout looking for its view. */
export interface LayoutCandidate<T> {
  /** The slot it is filed under. */
  key: string
  /** Absent for an entry written before entries carried their identity. */
  identity?: StoredViewIdentity
  /** Complete saved view membership, or positioned elements for older
   *  entries — the evidence that tells apart entries sharing one identity. */
  elementIds: readonly string[]
  value: T
}

/**
 * Match each view to its layout.
 *
 * Entries that carry an identity are grouped by it and paired within the
 * group, so renumbering a derived key cannot move layout between views.
 * Entries written before that are matched by exact key, then by the key the
 * parser normalised on import (TEA-166), as they always were; they gain an
 * identity on the next save. An identified entry is never matched by key: that
 * is exactly how a survivor used to inherit its deleted sibling's layout.
 *
 * Several views may share one entry when they share an authored key — c4hero
 * tolerates duplicate keys and leaves them for the validator to report.
 * Anything left unmatched is the caller's to preserve.
 */
export function resolveViewLayouts<T>(
  views: readonly View[],
  candidates: readonly LayoutCandidate<T>[],
): Map<View, LayoutCandidate<T>> {
  const byView = new Map<View, LayoutCandidate<T>>()

  const used = new Set<LayoutCandidate<T>>()
  const take = (v: View, c: LayoutCandidate<T>) => { byView.set(v, c); used.add(c) }

  // The view's own identity first. Only then the authored key the parser
  // normalised on import (TEA-166): layout saved while the view still went by
  // that name is the same view's, and a view that answers to its current name
  // must never be outbid by an old alias.
  const identities: ((v: View) => string | undefined)[] = [
    (v) => signatureOf(viewIdentityOf(v)),
    (v) => (v.originalKey ? signatureOf({ ...viewIdentityOf(v), key: v.originalKey }) : undefined),
  ]
  for (const signatureOfView of identities) {
    const groups = new Map<string, { views: View[]; candidates: LayoutCandidate<T>[] }>()
    for (const c of candidates) {
      if (!c.identity || used.has(c)) continue
      const sig = signatureOf(c.identity)
      const g = groups.get(sig)
      if (g) g.candidates.push(c)
      else groups.set(sig, { views: [], candidates: [c] })
    }
    for (const v of views) {
      const sig = byView.has(v) ? undefined : signatureOfView(v)
      if (sig !== undefined) groups.get(sig)?.views.push(v)
    }
    for (const g of groups.values()) {
      if (g.views.length === 0) continue
      if (g.candidates[0].identity?.key !== undefined && g.candidates.length === 1) {
        for (const v of g.views) take(v, g.candidates[0])
      } else {
        pairWithinGroup(g.views, g.candidates, take)
      }
    }
  }

  const legacy = candidates.filter((c) => !c.identity)
  for (const wanted of ['key', 'originalKey'] as const) {
    for (const view of views) {
      if (byView.has(view) || !view[wanted]) continue
      const hit = legacy.find((c) => c.key === view[wanted])
      if (hit) byView.set(view, hit)
    }
  }
  return byView
}

/**
 * Pair the views of one identity group with the entries that belong to it.
 *
 * Within a group the DSL says nothing to tell the entries apart, so the
 * evidence is the saved membership of each view. A pair is made only
 * where it points one way from both sides — this view's single best entry,
 * and that entry's single best view — because layout landing on the wrong
 * diagram is harder to notice than layout left unapplied.
 *
 * A lone remaining pair can match on identity alone (including lock-only
 * entries). Otherwise ties decline, except for equal-sized groups whose
 * views and entries are indistinguishable by membership: those retain their
 * unchanged keys. Reordering identical views still swaps their layout — a
 * known limitation. A key must never break a tie when counts differ.
 */
function pairWithinGroup<T>(
  views: readonly View[],
  candidates: readonly LayoutCandidate<T>[],
  take: (view: View, candidate: LayoutCandidate<T>) => void,
): void {
  const freeViews = new Set(views)
  const freeCandidates = new Set(candidates)
  const held = new Map(views.map((v) => [v, new Set(v.elements.map((el) => el.id))]))
  const candidateMembership = new Map(candidates.map((c) => [c, new Set(c.elementIds)]))

  // Complete membership uses intersection / union: an exact small view
  // must beat a larger sibling containing all its nodes, including when it
  // is the only entry with a saved lock. Older entries list only positioned
  // nodes, so extra live nodes cannot be used against them.
  type Score = readonly [number, number]
  const score = (view: View, c: LayoutCandidate<T>): Score => {
    const ids = held.get(view)!
    const savedIds = candidateMembership.get(c)!
    let n = 0
    for (const id of savedIds) if (ids.has(id)) n++
    const denominator = c.identity?.elementIds !== undefined
      ? ids.size + savedIds.size - n
      : savedIds.size
    if (c.identity?.elementIds !== undefined && denominator === 0) return [1, 0]
    return n === 0 ? [0, 0] : [n / denominator, n]
  }
  const cmp = (a: Score, b: Score): number => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
    return 0
  }
  /** The single best of `pool` against `scoreOf`, or undefined on a tie or
   *  when membership supplies no evidence (two complete empty sets match). */
  const uniqueBest = <U>(pool: Iterable<U>, scoreOf: (u: U) => Score): U | undefined => {
    let top: Score = [0, 0]
    let winners: U[] = []
    for (const u of pool) {
      const s = scoreOf(u)
      if (s[0] === 0) continue
      const d = cmp(s, top)
      if (d > 0) { top = s; winners = [u] } else if (d === 0) winners.push(u)
    }
    return winners.length === 1 ? winners[0] : undefined
  }

  for (let paired = true; paired;) {
    paired = false
    for (const view of freeViews) {
      const c = uniqueBest(freeCandidates, (x) => score(view, x))
      if (!c || uniqueBest(freeViews, (v) => score(v, c)) !== view) continue
      take(view, c)
      freeViews.delete(view)
      freeCandidates.delete(c)
      paired = true
      break
    }
  }

  if (freeViews.size === 0 || freeViews.size !== freeCandidates.size) return
  if (freeViews.size === 1) {
    take([...freeViews][0], [...freeCandidates][0])
    return
  }
  const membership = (ids: Iterable<string>) => JSON.stringify([...new Set(ids)].sort())
  if (new Set([...freeViews].map((v) => membership(held.get(v)!))).size !== 1
    || new Set([...freeCandidates].map((c) => membership(c.elementIds))).size !== 1) return
  for (const view of [...freeViews]) {
    const c = [...freeCandidates].find((x) => x.key === view.key)
    if (!c) continue
    take(view, c)
    freeViews.delete(view)
    freeCandidates.delete(c)
  }
}
