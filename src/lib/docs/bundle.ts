import type { ModelElement, Workspace } from '@/types/model'
import { normalizeIncludePath } from '@/lib/dsl/includeResolver'
import { asList, firstString, parseFrontmatter, serializeFrontmatter } from './frontmatter'

/**
 * Structurizr's `!docs <dir>` and `!adrs <dir>` point at directories of
 * markdown. c4hero reads those directories as Open Knowledge Format bundles:
 * every `.md` file is a concept whose frontmatter (when present) carries
 * `type`, `title`, `description`, `tags`, `status`, … and whose body is the
 * document. Files without frontmatter — everything Structurizr users have
 * today, and adr-tools style ADRs — read just as well: the title comes from
 * the first heading, an ADR's status and supersedes links from its
 * `## Status` section. Writing always produces OKF-shaped files.
 *
 * Paths are relative to the workspace's root DSL file, which is the open
 * folder — the same convention `!include` uses.
 */

export type DocsKind = 'docs' | 'adrs'

export interface DocConcept {
  /** Path relative to the open folder, e.g. `docs/api/overview.md`. */
  path: string
  /** File name inside the bundle directory. */
  file: string
  /** OKF `type`; defaults to `Documentation` / `Decision` by bundle kind. */
  type: string
  title: string
  description?: string
  tags: string[]
  timestamp?: string
  /** ADRs: the decision's status (`Proposed`, `Accepted`, `Superseded`…). */
  status?: string
  /** ADRs: files (within the same bundle) this decision supersedes / is superseded by. */
  supersedes: string[]
  supersededBy: string[]
  /** Leading number from an adr-tools style file name (`0003-…`). */
  number?: number
  /** Markdown body with any frontmatter removed. */
  body: string
}

export interface DocsBundle {
  kind: DocsKind
  /** Directory relative to the open folder. */
  dir: string
  concepts: DocConcept[]
}

export interface DocsScope {
  docs?: string
  adrs?: string
}

/** Names the OKF spec reserves; never concepts. `catalog.md` is a common
 *  generated index in real bundles and is skipped the same way. */
const NON_CONCEPT_FILES = new Set(['index.md', 'log.md', 'catalog.md', 'readme.md'])

// ─── Directives → scopes ─────────────────────────────────────────────

const DIRECTIVE = /^!(docs|adrs)\s+(.+?)\s*$/i

/** Parse one `!docs …` / `!adrs …` line into its kind and folder path.
 *  `null` for any other directive, an absolute path, or one escaping the
 *  folder. */
export function parseDocsDirective(raw: string): { kind: DocsKind; dir: string } | null {
  const m = DIRECTIVE.exec(raw.trim())
  if (!m) return null
  const dir = normalizeIncludePath('', m[2])
  if (dir === null || dir === '') return null
  return { kind: m[1].toLowerCase() as DocsKind, dir }
}

function scopeOf(directives: ReadonlyArray<string> | undefined): DocsScope {
  const scope: DocsScope = {}
  for (const raw of directives ?? []) {
    const parsed = parseDocsDirective(raw)
    if (!parsed) continue
    // First one wins, as in Structurizr.
    if (scope[parsed.kind] === undefined) scope[parsed.kind] = parsed.dir
  }
  return scope
}

/** The workspace-level docs/adrs folders. */
export function workspaceDocsScope(ws: Workspace): DocsScope {
  return scopeOf(ws.directives?.filter((d) => d.scope === 'workspace').map((d) => d.raw))
}

/** The docs/adrs folders declared inside one element's block. */
export function elementDocsScope(element: Pick<ModelElement, 'directives'>): DocsScope {
  return scopeOf(element.directives)
}

/** Every element that declares a docs or adrs folder, with its scope. */
export function elementDocsScopes(ws: Workspace): Map<string, DocsScope> {
  const out = new Map<string, DocsScope>()
  const visit = (el: ModelElement) => {
    const scope = elementDocsScope(el)
    if (scope.docs || scope.adrs) out.set(el.id, scope)
  }
  for (const p of ws.model.people) visit(p)
  for (const s of ws.model.softwareSystems) {
    visit(s)
    for (const c of s.containers) {
      visit(c)
      for (const comp of c.components) visit(comp)
    }
  }
  return out
}

/** Every distinct folder the workspace references, workspace and element scope. */
export function allDocsDirs(ws: Workspace): Array<{ kind: DocsKind; dir: string }> {
  const seen = new Set<string>()
  const out: Array<{ kind: DocsKind; dir: string }> = []
  const add = (scope: DocsScope) => {
    for (const kind of ['docs', 'adrs'] as const) {
      const dir = scope[kind]
      if (!dir || seen.has(`${kind}:${dir}`)) continue
      seen.add(`${kind}:${dir}`)
      out.push({ kind, dir })
    }
  }
  add(workspaceDocsScope(ws))
  for (const scope of elementDocsScopes(ws).values()) add(scope)
  return out
}

// ─── Reading ─────────────────────────────────────────────────────────

export interface RawFile {
  name: string
  text: string
}

export function parseDocsBundle(kind: DocsKind, dir: string, files: ReadonlyArray<RawFile>): DocsBundle {
  const concepts = files
    .filter((f) => f.name.toLowerCase().endsWith('.md') && !NON_CONCEPT_FILES.has(f.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
    .map((f) => parseConcept(kind, dir, f))
  return { kind, dir, concepts }
}

const ADR_FILE = /^(\d+)[-_ ]?(.*)\.md$/i

export function parseConcept(kind: DocsKind, dir: string, file: RawFile): DocConcept {
  const { frontmatter: fm, body } = parseFrontmatter(file.text)
  const numberMatch = ADR_FILE.exec(file.name)
  const number = numberMatch ? Number(numberMatch[1]) : undefined
  const heading = firstHeading(body)
  const title = firstString(fm.title) || heading || titleFromFilename(numberMatch ? numberMatch[2] : file.name.replace(/\.md$/i, ''))

  const concept: DocConcept = {
    path: `${dir}/${file.name}`,
    file: file.name,
    type: firstString(fm.type) || (kind === 'adrs' ? 'Decision' : 'Documentation'),
    title,
    description: firstString(fm.description),
    tags: asList(fm.tags),
    timestamp: firstString(fm.timestamp),
    supersedes: asList(fm.supersedes).map(basename),
    supersededBy: asList(fm.superseded_by).map(basename),
    number,
    body,
  }
  if (kind === 'adrs' || fm.status !== undefined) {
    const status = parseStatusSection(body)
    concept.status = firstString(fm.status) || status.status
    if (concept.supersedes.length === 0) concept.supersedes = status.supersedes
    if (concept.supersededBy.length === 0) concept.supersededBy = status.supersededBy
  }
  return concept
}

/** The document's first `#` heading, minus any adr-tools number. */
export function firstHeading(body: string): string | undefined {
  const m = /^\s*#\s+(.+?)\s*#*\s*$/m.exec(body)
  return m ? stripAdrNumber(m[1].trim()) : undefined
}

/** adr-tools titles read `3. Use Postgres`; the number is metadata, not title. */
function stripAdrNumber(title: string): string {
  return title.replace(/^\d+\.\s+/, '')
}

function titleFromFilename(stem: string): string {
  const words = stem.replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Untitled'
}

function basename(path: string): string {
  const clean = path.trim().replace(/[?#].*$/, '')
  return clean.slice(clean.lastIndexOf('/') + 1)
}

/** ADR status the way adr-tools writes it — a `## Status` (or `**Status**`)
 *  section whose first line is the status and whose later lines link to the
 *  decisions it supersedes or was superseded by. */
export function parseStatusSection(body: string): { status?: string; supersedes: string[]; supersededBy: string[] } {
  const lines = body.split(/\r?\n/)
  const start = lines.findIndex((l) => /^\s*#{1,6}\s*status\s*#*\s*$/i.test(l) || /^\s*\*\*status\*\*/i.test(l))
  if (start === -1) return { supersedes: [], supersededBy: [] }

  const section: string[] = []
  // Inline form: `**Status** Accepted` / `**Status** (Proposed)` on the heading line itself.
  const inline = /^\s*\*\*status\*\*[:\s]*(.+)$/i.exec(lines[start])
  if (inline && inline[1].trim()) section.push(inline[1])
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*#{1,6}\s/.test(lines[i]) || /^\s*\*\*[A-Za-z ]+\*\*/.test(lines[i])) break
    section.push(lines[i])
  }

  const supersedes: string[] = []
  const supersededBy: string[] = []
  let status: string | undefined
  for (const line of section) {
    const text = line.trim()
    if (!text) continue
    const links = [...text.matchAll(/\]\(([^)]+)\)/g)].map((m) => basename(m[1]))
    if (/superseded\s+by/i.test(text)) {
      supersededBy.push(...links)
      status ??= 'Superseded'
    } else if (/^supersedes\b/i.test(text)) {
      supersedes.push(...links)
    } else if (status === undefined) {
      status = text.replace(/^\(|\)$/g, '').replace(/[*_`]/g, '').trim()
    }
  }
  return { status, supersedes, supersededBy }
}

// ─── Writing ─────────────────────────────────────────────────────────

export interface NewDocInput {
  title: string
  description?: string
  /** Markdown body. A skeleton is generated when omitted. */
  body?: string
  /** Element the doc is about, recorded in frontmatter for element-scope bundles. */
  elementId?: string
  /** Fixed clock for tests; defaults to now. */
  now?: Date
}

export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** A filename nobody in the bundle is using, never a reserved name. */
export function uniqueDocFilename(existing: ReadonlyArray<string>, stem: string): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()))
  let base = stem || 'untitled'
  if (NON_CONCEPT_FILES.has(`${base}.md`)) base = `${base}-doc`
  let candidate = `${base}.md`
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base}-${n}.md`
  return candidate
}

/** adr-tools numbering: one more than the highest existing number, four digits. */
export function nextAdrFilename(existing: ReadonlyArray<string>, title: string): string {
  let max = 0
  for (const name of existing) {
    const m = ADR_FILE.exec(name)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${String(max + 1).padStart(4, '0')}-${slugify(title) || 'decision'}.md`
}

export function renderNewDoc(input: NewDocInput): string {
  const fm = serializeFrontmatter({
    type: 'Documentation',
    title: input.title,
    description: input.description,
    element: input.elementId,
    timestamp: (input.now ?? new Date()).toISOString(),
  })
  const body = input.body?.trim() || `# ${input.title}\n\n${input.description ?? ''}`.trimEnd()
  return `${fm}\n\n${body}\n`
}

export function renderNewAdr(input: NewDocInput & { status?: string; number: number }): string {
  const fm = serializeFrontmatter({
    type: 'Decision',
    title: input.title,
    description: input.description,
    status: input.status ?? 'Proposed',
    element: input.elementId,
    timestamp: (input.now ?? new Date()).toISOString(),
  })
  const body = input.body?.trim() || [
    `# ${input.number}. ${input.title}`,
    '',
    '## Status',
    '',
    input.status ?? 'Proposed',
    '',
    '## Context',
    '',
    input.description ?? '',
    '',
    '## Decision',
    '',
    '',
    '## Consequences',
    '',
  ].join('\n').trimEnd()
  return `${fm}\n\n${body}\n`
}

/** Append a concept line to a section `index.md`, creating the file when the
 *  bundle has none. Index files carry no frontmatter (OKF reserves them). */
export function appendToIndex(existing: string | null, dirTitle: string, file: string, title: string, description?: string): string {
  // Backslash first, so an escape we add is never itself escaped.
  const safeTitle = title.replace(/[\\[\]]/g, '\\$&')
  const line = `- [${safeTitle}](${file})${description ? ` - ${description.replace(/\s*\n\s*/g, ' ')}` : ''}`
  if (existing === null || existing.trim() === '') return `# ${dirTitle}\n\n${line}\n`
  const trimmed = existing.replace(/\s+$/, '')
  return `${trimmed}\n${line}\n`
}

/** Human title for a bundle directory: `docs/api` → `Api`, `adrs` → `Adrs`. */
export function dirTitle(kind: DocsKind, dir: string): string {
  if (kind === 'adrs') return 'Architecture decision records'
  const last = dir.slice(dir.lastIndexOf('/') + 1)
  return titleFromFilename(last) || 'Documentation'
}

/** Default folder for a bundle that does not exist yet. Element bundles nest
 *  under the workspace folder by element id so several elements never share
 *  one directory. */
export function defaultDocsDir(kind: DocsKind, elementId?: string): string {
  const root = kind === 'docs' ? 'docs' : 'adrs'
  return elementId ? `${root}/${elementId}` : root
}

/** The DSL line that declares a bundle folder. */
export function docsDirectiveLine(kind: DocsKind, dir: string): string {
  return /[\s"\\]/.test(dir) ? `!${kind} "${dir.replace(/[\\"]/g, '\\$&')}"` : `!${kind} ${dir}`
}
