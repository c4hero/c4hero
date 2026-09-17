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
  /** Retrieve cited evidence first, within the same budget; ignore unknown ids. */
  preferredConceptIds?: readonly string[]
}

const DEFAULTS: Required<DocsContextOptions> = { maxChars: 12000, maxDocChars: 2000, preferredConceptIds: [] }

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
  const { maxChars, maxDocChars, preferredConceptIds } = { ...DEFAULTS, ...options }
  const preferred = new Set(preferredConceptIds)
  // Stable sort preserves normal scope/status ranking within each group.
  // Superseded citations remain labelled as history by renderCandidate.
  const candidates = rankCandidates(bundles, ws, view).sort((a, b) =>
    Number(preferred.has(conceptId(b.concept))) - Number(preferred.has(conceptId(a.concept))))
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
      const superseded = isSuperseded(concept, kind)
      out.push({ concept, kind, tier: superseded ? 9 : tier, about })
    }
  }

  const inView = view ? new Set(view.elements.map((e) => e.id)) : null
  // Container/component views draw their scope as a boundary, not an element.
  // Its decisions still govern the view and must survive before workspace docs.
  if (view?.softwareSystemId) inView?.add(view.softwareSystemId)
  if (view?.containerId) inView?.add(view.containerId)
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

function isSuperseded(concept: DocConcept, kind: DocsKind): boolean {
  return kind === 'adrs' && (concept.supersededBy.length > 0 || /^superseded/i.test(concept.status ?? ''))
}

function renderCandidate(c: Candidate, maxDocChars: number): string {
  const { concept } = c
  const status = isSuperseded(concept, c.kind) ? 'Superseded' : concept.status ?? '-'
  const head = [conceptId(concept), concept.type, status, concept.title].join(' | ')
  const about = c.about ? ` | about: ${c.about}` : ''
  // Frontmatter is absent from the body, so retain its decision links explicitly.
  const links: string[] = []
  if (concept.supersedes.length) links.push(`Supersedes (files in this bundle): ${concept.supersedes.join(', ')}`)
  if (concept.supersededBy.length) links.push(`Superseded by (files in this bundle): ${concept.supersededBy.join(', ')}`)
  const body = clip(concept.body.trim(), maxDocChars)
  return [`=== ${head}${about}`, ...links, body].join('\n')
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.lastIndexOf('\n', max)
  return `${text.slice(0, cut > max / 2 ? cut : max).trimEnd()}\n…(truncated)`
}
