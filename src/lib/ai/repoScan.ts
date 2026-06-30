import type { RepoFile, RepoSnapshot, RepoProposal, EditOp } from './types'
import { editOpRank } from './operations'

// Read a local repository through the File System Access API and reduce it to a
// compact, architecture-revealing snapshot: the file tree plus the contents of
// high-signal manifest/config files. The pure helpers (filtering, bundling,
// truncation) are unit-tested; the traversal needs a real directory handle.

const IGNORED_DIRS: ReadonlySet<string> = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', 'vendor', 'coverage',
  'bin', 'obj', '__pycache__', 'venv', 'tmp', 'temp', 'public',
])

/** Directories not worth walking for architecture inference. Skips dotdirs
 *  (.git, .next, .venv, .cache, …) and known build/dependency folders. */
export function isIgnoredDir(name: string): boolean {
  return name.startsWith('.') || IGNORED_DIRS.has(name.toLowerCase())
}

// Manifest / build / config / doc files that strongly reveal architecture.
const KEY_FILE_RE = /^(package\.json|pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|go\.mod|requirements\.txt|pyproject\.toml|cargo\.toml|composer\.json|gemfile|[^/]*\.csproj|docker-compose([.-][\w.-]*)?\.ya?ml|dockerfile|application\.ya?ml|application\.properties|serverless\.ya?ml|[^/]*\.tf|readme(\.md)?|chart\.ya?ml|values\.ya?ml)$/i

/** True for files whose contents are worth sending to the model. */
export function isKeyFile(name: string): boolean {
  return KEY_FILE_RE.test(name)
}

const REDACTED = '<redacted>'
const SECRET_KEY_PART = [
  'api[-_]?key',
  'access[-_]?key',
  'auth[-_]?token',
  'bearer',
  'client[-_]?secret',
  'connection[-_]?string',
  'credential',
  'database[-_]?url',
  'db[-_]?url',
  'dsn',
  'jdbc[-_]?url',
  'mongo(?:db)?[-_]?(?:uri|url)',
  'pass(?:word|wd)?',
  'private[-_]?key',
  'refresh[-_]?token',
  'redis[-_]?url',
  'secret',
  'token',
].join('|')

const SECRET_KEY_RE = new RegExp(`(?:^|[._-])(?:${SECRET_KEY_PART})(?:$|[._-])`, 'i')
// Match `key = value` / `key: value` anywhere on a line, not just line-leading —
// inline and minified secrets (`{ "password": "x" }`, `mode=dev;password=y`) have
// a non-key token before the key, so an `^`-anchored pattern missed them and let
// the credential through. `lead` is the delimiter before the key (start-of-line,
// whitespace, `{`, `,`, or `;`). The unquoted value runs to the next PAIR
// separator (`;` `,` `}` `]` `)` newline) — it keeps spaces so a multi-word or
// unterminated-quote secret is redacted whole, but stops at `;`/`,`/`}` so a
// non-secret key can't swallow a following secret pair on the same line.
const ASSIGNMENT_RE = /(^|[\s{,;])((?:export[ \t]+)?["']?)([\w.-]+)(["']?[ \t]*[:=][ \t]*)("(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'|[^{};,\])\r\n]*)/gim
const PRIVATE_KEY_BLOCK_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|(?![\s\S]))/g
const ASSIGNED_PRIVATE_KEY_BLOCK_RE = /^([ \t-]*(?:export[ \t]+)?["']?[\w.-]*private[-_]?key[\w.-]*["']?[ \t]*[:=][ \t]*)-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|(?![\s\S]))/gim

function redactAssignmentValue(prefix: string, rawValue: string): string {
  const leading = rawValue.match(/^\s*/)?.[0] ?? ''
  const trimmed = rawValue.trim()
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return `${prefix}${rawValue}`

  const comma = trimmed.endsWith(',') ? ',' : ''
  const quote = trimmed[0] === '"' || trimmed[0] === '\'' ? trimmed[0] : ''
  return `${prefix}${leading}${quote}${REDACTED}${quote}${comma}`
}

/** Strip secret-looking values from config excerpts before they leave the
 *  browser. Keeps the keys and surrounding architecture hints, but removes
 *  credentials, tokens, private keys, and URL passwords. */
export function redactSensitiveContent(content: string): string {
  return content
    .replace(ASSIGNED_PRIVATE_KEY_BLOCK_RE, (_m, prefix: string) => `${prefix}${REDACTED}`)
    .replace(PRIVATE_KEY_BLOCK_RE, `-----BEGIN PRIVATE KEY-----\n${REDACTED}\n-----END PRIVATE KEY-----`)
    .replace(ASSIGNMENT_RE, (match, lead: string, start: string, key: string, sep: string, rawValue: string) => (
      SECRET_KEY_RE.test(key) ? `${lead}${redactAssignmentValue(`${start}${key}${sep}`, rawValue)}` : match
    ))
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^@\s/]+)@/gi, `$1$2:${REDACTED}@`)
    .replace(/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, REDACTED)
    .replace(/\bAIza[0-9A-Za-z_-]{35}\b/g, REDACTED)
    .replace(/\bgh[pousr]_[0-9A-Za-z_]{36,}\b/g, REDACTED)
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, REDACTED)
}

export interface ReadRepoOptions {
  maxFiles?: number
  maxFileBytes?: number
  maxTreePaths?: number
  /** Skip files larger than this on disk (bytes). */
  maxRawFileBytes?: number
}

interface DirHandleLike {
  name: string
  entries(): AsyncIterableIterator<[string, { kind: string; getFile?: () => Promise<File> }]>
}

/** Progress callback payload while walking a repo. `keyFile` is set only on the
 *  tick where a high-signal file was just collected. */
export interface ScanProgress {
  files: number
  keyFiles: number
  keyFile?: string
}

/** Walk a directory handle into a RepoSnapshot. The result is deterministic for
 *  a given repo: paths and key files are collected fully (within generous walk
 *  bounds), sorted, and only then capped — so the same repo always yields the
 *  same snapshot regardless of filesystem iteration order. `onProgress` fires as
 *  files are discovered and read. */
export async function readRepoFiles(
  dir: FileSystemDirectoryHandle,
  opts: ReadRepoOptions = {},
  onProgress?: (p: ScanProgress) => void,
): Promise<RepoSnapshot> {
  const maxFiles = opts.maxFiles ?? 40
  const maxFileBytes = opts.maxFileBytes ?? 16_000
  const maxTreePaths = opts.maxTreePaths ?? 800
  const maxRawFileBytes = opts.maxRawFileBytes ?? 512_000
  // Generous walk-collection bounds so the sort+cap below sees the whole repo in
  // the common case (caps only bite on very large repos).
  const walkPathLimit = 20_000
  const walkKeyLimit = 400

  const allPaths: string[] = []
  const keyHandles: { path: string; getFile: () => Promise<File> }[] = []
  let walked = 0

  async function walk(handle: DirHandleLike, prefix: string, depth: number): Promise<void> {
    if (depth > 8 || allPaths.length >= walkPathLimit) return
    for await (const [name, entry] of handle.entries()) {
      if (allPaths.length >= walkPathLimit) return
      if (entry.kind === 'directory') {
        if (isIgnoredDir(name)) continue
        await walk(entry as unknown as DirHandleLike, `${prefix}${name}/`, depth + 1)
      } else {
        const path = `${prefix}${name}`
        allPaths.push(path)
        walked++
        if (isKeyFile(name) && entry.getFile && keyHandles.length < walkKeyLimit) {
          keyHandles.push({ path, getFile: entry.getFile.bind(entry) })
        }
        if (walked % 40 === 0) onProgress?.({ files: walked, keyFiles: keyHandles.length })
      }
    }
  }

  await walk(dir as unknown as DirHandleLike, '', 0)

  // Deterministic ordering, then cap.
  allPaths.sort()
  keyHandles.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const tree = allPaths.slice(0, maxTreePaths)

  const files: RepoFile[] = []
  for (const { path, getFile } of keyHandles) {
    if (files.length >= maxFiles) break
    try {
      const file = await getFile()
      if (file.size <= maxRawFileBytes) {
        files.push({ path, content: redactSensitiveContent(await file.text()).slice(0, maxFileBytes) })
        onProgress?.({ files: walked, keyFiles: files.length, keyFile: path })
      }
    } catch {
      // unreadable file — skip
    }
  }

  return { repoName: dir.name, tree, files }
}

/** Assemble a snapshot into a single text bundle within a character budget. */
export function buildRepoBundle(snapshot: RepoSnapshot, maxChars = 24_000): string {
  const lines: string[] = [`REPOSITORY: ${snapshot.repoName}`, '', 'FILE TREE (paths):']
  for (const p of snapshot.tree) lines.push(`  ${p}`)
  lines.push('', 'KEY FILES:')
  let out = lines.join('\n')

  for (const f of snapshot.files) {
    const block = `\n\n=== ${f.path} ===\n${redactSensitiveContent(f.content)}`
    if (out.length + block.length > maxChars) {
      out += `\n\n(${snapshot.files.length} key files found; remaining omitted to fit the budget)`
      break
    }
    out += block
  }
  return out.slice(0, maxChars)
}

/** Whether the browser supports picking a local folder. */
export function canScanRepo(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

// A stable identity for a proposal so passes can be deduped/merged. Adds key on
// type+name(+parent); relationships on their endpoints; updates on id+fields.
function proposalKey(p: RepoProposal): string {
  const op = p.op
  const lc = (s?: string) => (s ?? '').trim().toLowerCase()
  switch (op.op) {
    case 'addPerson':
    case 'addSoftwareSystem': return `${op.op}|${lc(op.name)}`
    case 'addContainer':
    case 'addComponent': return `${op.op}|${lc(op.parent)}|${lc(op.name)}`
    case 'addRelationship': return `rel|${lc(op.source)}|${lc(op.destination)}`
    case 'updateElement':
    case 'updateRelationship': {
      const fields = Object.keys(op).filter((k) => k !== 'op' && k !== 'id').sort().join(',')
      return `${op.op}|${lc(op.id)}|${fields}`
    }
    case 'deleteElement': return `del|${lc(op.id)}`
    default: return JSON.stringify(op)
  }
}

/** Prefix one scan pass's temporary refs — and the in-pass parent/endpoint refs
 *  that point at them — so they can't collide with another pass's identically
 *  numbered refs. Each pass numbers refs independently ("s1", "c1", …); without
 *  this, two passes' "s1" map to the same applyEditPlan refMap entry and
 *  mis-parent containers onto whichever system registered last. Tokens that
 *  aren't a ref defined in THIS pass (real ids, plain names) are left untouched.
 *  mergeRepoProposals then canonicalizes these namespaced refs as it dedupes, so
 *  a child whose parent is a duplicate still resolves to the surviving twin —
 *  and a parent ref always points at the freshly-created element, never at a
 *  pre-existing same-named one (which by-name resolution would have mis-hit). */
export function namespacePassRefs(proposals: RepoProposal[], prefix: string): RepoProposal[] {
  const defined = new Set<string>()
  for (const { op } of proposals) {
    if ('ref' in op && op.ref) defined.add(op.ref)
  }
  if (!defined.size) return proposals
  const ns = (t: string): string => (defined.has(t) ? `${prefix}${t}` : t)
  return proposals.map((p) => {
    const op = { ...p.op }
    if ('ref' in op && op.ref) op.ref = `${prefix}${op.ref}`
    if (op.op === 'addContainer' || op.op === 'addComponent') op.parent = ns(op.parent)
    else if (op.op === 'addRelationship') { op.source = ns(op.source); op.destination = ns(op.destination) }
    return { ...p, op }
  })
}

// Rewrite an op's parent/endpoint ref tokens through the canonical-ref map, so a
// child whose parent (or a relationship whose endpoint) was deduped away points
// at the surviving twin instead. Returns the same op object when nothing changes.
function remapOpRefs(op: EditOp, canonical: Map<string, string>): EditOp {
  if (!canonical.size) return op
  const map = (t: string): string => canonical.get(t) ?? t
  if (op.op === 'addContainer' || op.op === 'addComponent') return { ...op, parent: map(op.parent) }
  if (op.op === 'addRelationship') return { ...op, source: map(op.source), destination: map(op.destination) }
  return op
}

/** Merge proposals from one or more scan passes into a deduped, deterministically
 *  ordered set — the union, so multiple passes converge on a stable, complete
 *  result rather than whatever a single (sampled) pass happened to return.
 *  Processed (and emitted) parents-before-children so applyEditPlan can resolve
 *  every parent, and so a creator op is deduped before its children: when one is
 *  dropped as a duplicate its ref is aliased to the kept twin and children are
 *  rewritten onto it. */
export function mergeRepoProposals(proposals: RepoProposal[]): RepoProposal[] {
  // Deterministic processing order: rank, then a stable key — independent of the
  // input order, so the merge is order-independent. Handling parents (rank 0/1)
  // before children means `canonical` is populated before a child's parent ref
  // is remapped and keyed.
  const ordered = [...proposals].sort((a, b) => {
    const r = editOpRank(a.op) - editOpRank(b.op)
    if (r !== 0) return r
    const ka = proposalKey(a), kb = proposalKey(b)
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
  const canonical = new Map<string, string>() // deduped ref → kept ref
  const byKey = new Map<string, RepoProposal>()
  for (const p of ordered) {
    const op = remapOpRefs(p.op, canonical)
    const remapped = op === p.op ? p : { ...p, op }
    const k = proposalKey(remapped)
    const kept = byKey.get(k)
    if (kept) {
      // Duplicate: alias this op's ref to the kept twin so its children resolve.
      if ('ref' in op && op.ref && 'ref' in kept.op && kept.op.ref) canonical.set(op.ref, kept.op.ref)
      continue
    }
    byKey.set(k, remapped)
  }
  return [...byKey.values()]
}
