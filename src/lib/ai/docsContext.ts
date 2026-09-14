import type { ModelElement, View, Workspace } from '@/types/model'
import type { DocConcept, DocsBundle } from '@/lib/docs/bundle'
import { bundleKey, elementDocsScope, workspaceDocsScope, type DocsKind } from '@/lib/docs/bundle'

/**
 * Turn the workspace's `!docs` / `!adrs` bundles into prompt context so the
 * assistant can reason about — and cite — what the team already wrote down,
 * instead of offering generic C4 advice.
 *
 * Retrieval, not a dump: documents are ranked by how close they are to what
 * the user is looking at and clipped to a character budget, so a large
 * bundle never blows the context window. Concept ids are the bundle paths
 * without `.md` (the OKF notion of a concept ID); the model is told to cite
 * those verbatim in a finding's `citations`, and the caller keeps only the
 * ids that exist, so a citation always resolves to a real document.
 */

export interface DocsContext {
  /** The prompt section, ready to append to a user message. */
  text: string
  /** Every concept id the model was shown and may cite. */
  conceptIds: Set<string>
  /** Concept id → title, for rendering citations. */
  titles: Map<string, string>
  /** Documents shown / left out for budget. */
  included: number
  omitted: number
}

export interface DocsContextOptions {
  /** Whole-section budget in characters (roughly a quarter of that in tokens). */
  maxChars?: number
  /** Per-document body cap; longer bodies are clipped at a line break. */
  maxDocChars?: number
}

const DEFAULTS: Required<DocsContextOptions> = { maxChars: 12000, maxDocChars: 2000 }

export function conceptId(concept: Pick<DocConcept, 'path'>): string {
  return concept.path.replace(/\.md$/i, '')
}

/** Concept id → title over every loaded bundle, for the UI. */
export function conceptTitleMap(bundles: Record<string, DocsBundle | null>): Map<string, string> {
  const out = new Map<string, string>()
  for (const bundle of Object.values(bundles)) {
    for (const c of bundle?.concepts ?? []) out.set(conceptId(c), c.title)
  }
  return out
}

interface Candidate {
  concept: DocConcept
  kind: DocsKind
  /** Lower ranks first. */
  tier: number
  /** Element the bundle belongs to, when element-scoped. */
  about?: string
}

/** Build the section, or `null` when the workspace has no readable documents. */
export function buildDocsContext(
  bundles: Record<string, DocsBundle | null>,
  ws: Workspace,
  view?: View | null,
  options: DocsContextOptions = {},
): DocsContext | null {
  const { maxChars, maxDocChars } = { ...DEFAULTS, ...options }
  const candidates = rankCandidates(bundles, ws, view)
  if (candidates.length === 0) return null

  const lines: string[] = []
  const conceptIds = new Set<string>()
  const titles = new Map<string, string>()
  let used = 0
  let included = 0
  for (const c of candidates) {
    const entry = renderCandidate(c, maxDocChars)
    if (used + entry.length > maxChars && included > 0) break
    lines.push(entry)
    used += entry.length
    included++
    const id = conceptId(c.concept)
    conceptIds.add(id)
    titles.set(id, c.concept.title)
  }

  const header = [
    `DOCUMENTATION (${included} of ${candidates.length} documents attached to this workspace through !docs / !adrs).`,
    'Each document starts with "=== <concept id> | <type> | <status> | <title>". Cite a document by',
    'putting its concept id, exactly as written, in `citations`; in prose refer to it by title.',
    'Treat accepted decisions as constraints the model is expected to honour.',
  ].join('\n')
  return { text: `${header}\n\n${lines.join('\n\n')}`, conceptIds, titles, included, omitted: candidates.length - included }
}

function rankCandidates(bundles: Record<string, DocsBundle | null>, ws: Workspace, view?: View | null): Candidate[] {
  const seen = new Set<string>()
  const out: Candidate[] = []
  const take = (kind: DocsKind, dir: string | undefined, tier: number, about?: string) => {
    if (!dir) return
    for (const concept of bundles[bundleKey(kind, dir)]?.concepts ?? []) {
      if (seen.has(concept.path)) continue
      seen.add(concept.path)
      // A superseded decision is history, not guidance: last, whatever its scope.
      const superseded = kind === 'adrs' && (concept.supersededBy.length > 0 || /^superseded/i.test(concept.status ?? ''))
      out.push({ concept, kind, tier: superseded ? 9 : tier, about })
    }
  }

  const inView = view ? new Set(view.elements.map((e) => e.id)) : null
  const elements = allElements(ws)
  // Tier 0: documents on the elements the user is looking at (every element
  // for a whole-model run). Tier 1/2: workspace decisions, then docs. Tier 3:
  // documents on elements outside the view — still relevant, lowest priority.
  for (const el of elements) {
    if (inView && !inView.has(el.id)) continue
    const scope = elementDocsScope(el)
    take('adrs', scope.adrs, 0, el.name)
    take('docs', scope.docs, 0, el.name)
  }
  const wsScope = workspaceDocsScope(ws)
  take('adrs', wsScope.adrs, 1)
  take('docs', wsScope.docs, 2)
  if (inView) {
    for (const el of elements) {
      if (inView.has(el.id)) continue
      const scope = elementDocsScope(el)
      take('adrs', scope.adrs, 3, el.name)
      take('docs', scope.docs, 3, el.name)
    }
  }
  // Stable: ties keep insertion (bundle) order.
  return out.map((c, i) => [c, i] as const).sort((a, b) => a[0].tier - b[0].tier || a[1] - b[1]).map(([c]) => c)
}

function allElements(ws: Workspace): ModelElement[] {
  const out: ModelElement[] = [...ws.model.people]
  for (const s of ws.model.softwareSystems) {
    out.push(s)
    for (const c of s.containers) {
      out.push(c)
      out.push(...c.components)
    }
  }
  return out
}

function renderCandidate(c: Candidate, maxDocChars: number): string {
  const { concept } = c
  const head = [conceptId(concept), concept.type, concept.status ?? '-', concept.title].join(' | ')
  const about = c.about ? ` | about: ${c.about}` : ''
  const body = clip(concept.body.trim(), maxDocChars)
  return `=== ${head}${about}\n${body}`
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.lastIndexOf('\n', max)
  return `${text.slice(0, cut > max / 2 ? cut : max).trimEnd()}\n…(truncated)`
}
