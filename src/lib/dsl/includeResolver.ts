// Resolve `!include <relative path>` directives by splicing the included file's
// text into the document (TEA-325 phase B).
//
// Pure: file access is an injected `read`, so this runs the same in unit tests
// and against a File System Access directory handle. The parser stays
// synchronous and single-document; this runs *before* it.
//
// Shape of the output: every `!include` line is KEPT (phase A preserves it as
// a directive, so a save still writes the line) and the included content is
// inserted directly after it. A source map records which flattened lines came
// from which file so parse errors and element provenance point at real files.

export interface ResolveIncludesOptions {
  /** Read a file by path relative to the root file. `null` = does not exist. */
  read: (path: string) => Promise<string | null>
  /** Max nesting depth of includes. */
  maxDepth?: number
  /** Max number of distinct files. */
  maxFiles?: number
  /** Max total bytes across all files. */
  maxTotalBytes?: number
}

export interface SourceSegment {
  /** File path (`''` = the root document). */
  path: string
  /** First flattened line (1-based, inclusive). */
  start: number
  /** Number of lines. */
  count: number
  /** Line in `path` that `start` corresponds to (1-based). */
  sourceStart: number
}

export interface ResolveError {
  message: string
  /** File the offending `!include` line is in (`''` = root). */
  path: string
  line: number
}

export interface ResolveIncludesResult {
  /** The flattened document. */
  content: string
  /** Every included file, in first-inclusion order (root excluded). */
  files: string[]
  /** For each included file: the block scope it was included into. */
  scopes: Map<string, 'workspace' | 'model' | 'views' | 'element'>
  segments: SourceSegment[]
  errors: ResolveError[]
  /** `!include` lines left in place because they point at something out of
   *  scope (URLs, absolute paths, `..` escapes, directories). */
  unresolved: { path: string; line: number; raw: string }[]
}

export const DEFAULT_MAX_DEPTH = 10
export const DEFAULT_MAX_FILES = 50
export const DEFAULT_MAX_TOTAL_BYTES = 10 * 1024 * 1024

const INCLUDE_LINE = /^(\s*)!include\s+(.+?)\s*$/

/** Normalise a relative path: forward slashes, no `.` segments; `null` when it
 *  is absolute, a URL, or escapes the root through `..`. */
export function normalizeIncludePath(fromDir: string, target: string): string | null {
  let t = target.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) t = t.slice(1, -1)
  if (/^[a-z]+:\/\//i.test(t)) return null
  if (t.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(t)) return null
  const parts = (fromDir ? `${fromDir}/${t}` : t).split(/[\\/]+/)
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (out.length === 0) return null
      out.pop()
      continue
    }
    out.push(part)
  }
  return out.join('/')
}

function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

/** Track which block an `!include` sits in by counting braces on the lines
 *  before it. Good enough for the well-formed files Structurizr accepts. */
function scopeAt(lines: string[], upto: number): 'workspace' | 'model' | 'views' | 'element' {
  const stack: string[] = []
  const opener = /^\s*(?:[A-Za-z_][\w.]*\s*=\s*)?([A-Za-z!][\w]*)\b[^{]*\{\s*$/
  for (let i = 0; i < upto; i++) {
    const line = lines[i]
    const stripped = stripStringsAndComments(line)
    const opens = (stripped.match(/\{/g) ?? []).length
    const closes = (stripped.match(/\}/g) ?? []).length
    if (opens > closes) {
      const m = stripped.match(opener)
      stack.push((m?.[1] ?? '?').toLowerCase())
    } else if (closes > opens) {
      for (let n = closes - opens; n > 0; n--) stack.pop()
    }
  }
  const top = stack[stack.length - 1]
  if (top === 'workspace' || stack.length === 0) return 'workspace'
  if (top === 'model') return 'model'
  if (top === 'views') return 'views'
  return 'element'
}

function stripStringsAndComments(line: string): string {
  let out = ''
  let inStr = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inStr) {
      if (ch === '\\') { i++; continue }
      if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === '/' && line[i + 1] === '/') break
    if (ch === '#') break
    out += ch
  }
  return out
}

export interface ResolveIncludesSyncOptions {
  /** Text of every file that has been read so far, by normalised path. */
  files: Map<string, string>
  /** Paths already known not to exist. */
  missing?: Set<string>
  maxDepth?: number
  maxFiles?: number
  maxTotalBytes?: number
}

export interface ResolveIncludesSyncResult extends ResolveIncludesResult {
  /** Paths referenced by an `!include` that are in neither `files` nor
   *  `missing`. Read them and call again. Empty when resolution is complete. */
  needed: string[]
}

/** Async entry point: reads files through `opts.read` until the sync core has
 *  everything it needs (bounded by `maxFiles`). */
export async function resolveIncludes(root: string, opts: ResolveIncludesOptions): Promise<ResolveIncludesResult> {
  const files = new Map<string, string>()
  const missing = new Set<string>()
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES
  for (;;) {
    const r = resolveIncludesSync(root, { files, missing, maxDepth: opts.maxDepth, maxFiles, maxTotalBytes: opts.maxTotalBytes })
    if (r.needed.length === 0 || files.size + missing.size > maxFiles + 1) {
      const { needed: _n, ...rest } = r
      void _n
      return rest
    }
    for (const path of r.needed) {
      let text: string | null
      try { text = await opts.read(path) } catch { text = null }
      if (text === null) missing.add(path)
      else files.set(path, text)
    }
  }
}

/** Synchronous core: resolves against files already in memory. The code pane
 *  uses this to re-stitch a document from the texts captured at load time,
 *  so a pane edit parses exactly like a fresh open. */
export function resolveIncludesSync(root: string, opts: ResolveIncludesSyncOptions): ResolveIncludesSyncResult {
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES
  const maxTotalBytes = opts.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES
  const known = opts.files
  const missing = opts.missing ?? new Set<string>()
  const needed: string[] = []

  const out: string[] = []
  const segments: SourceSegment[] = []
  const errors: ResolveError[] = []
  const unresolved: ResolveIncludesResult['unresolved'] = []
  const files: string[] = []
  const scopes = new Map<string, 'workspace' | 'model' | 'views' | 'element'>()
  let totalBytes = root.length
  let budgetBlown = false

  /** `undefined` = not read yet (recorded in `needed`); `null` = known missing. */
  function lookup(path: string): string | null | undefined {
    if (known.has(path)) return known.get(path)!
    if (missing.has(path)) return null
    if (!needed.includes(path)) needed.push(path)
    return undefined
  }

  function emitFile(path: string, text: string, depth: number, chain: string[]): void {
    const lines = text.split('\n')
    // Drop a trailing empty line produced by a terminating newline so we don't
    // inject blank lines between spliced files.
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
    let segStart = out.length + 1
    let segSourceStart = 1

    const flush = (uptoExclusive: number) => {
      const count = out.length + 1 - segStart
      if (count > 0) segments.push({ path, start: segStart, count, sourceStart: segSourceStart })
      segStart = out.length + 1
      segSourceStart = uptoExclusive + 1
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const m = line.match(INCLUDE_LINE)
      out.push(line)
      if (!m || budgetBlown) continue

      const rawTarget = m[2]
      const target = normalizeIncludePath(dirOf(path), rawTarget)
      if (target === null) {
        unresolved.push({ path, line: i + 1, raw: line.trim() })
        continue
      }
      if (chain.includes(target) || target === '' ) {
        errors.push({
          message: `!include cycle: ${[...chain, target].filter(Boolean).join(' -> ') || target} includes itself`,
          path, line: i + 1,
        })
        continue
      }
      if (depth + 1 > maxDepth) {
        errors.push({ message: `!include nesting deeper than ${maxDepth} (${target})`, path, line: i + 1 })
        continue
      }
      const included = lookup(target)
      if (included === undefined) continue // not read yet — caller will supply it
      if (included === null) {
        errors.push({ message: `!include ${rawTarget.trim()}: file not found`, path, line: i + 1 })
        continue
      }
      if (!files.includes(target)) {
        if (files.length + 1 > maxFiles) {
          errors.push({ message: `!include: more than ${maxFiles} files`, path, line: i + 1 })
          budgetBlown = true
          continue
        }
        totalBytes += included.length
        if (totalBytes > maxTotalBytes) {
          errors.push({ message: `!include: total size exceeds ${Math.round(maxTotalBytes / 1024 / 1024)} MB`, path, line: i + 1 })
          budgetBlown = true
          continue
        }
        files.push(target)
        scopes.set(target, scopeAt(out, out.length - 1))
      }
      // Close this file's segment at the include line, splice, reopen after.
      flush(i + 1)
      emitFile(target, included, depth + 1, [...chain, target])
      segStart = out.length + 1
      segSourceStart = i + 2
    }
    flush(lines.length)
  }

  emitFile('', root, 0, [''])
  return { content: out.join('\n') + (root.endsWith('\n') ? '\n' : ''), files, scopes, segments, errors, unresolved, needed }
}

/** Map a line of the flattened document back to its file and line. */
export function locateLine(segments: SourceSegment[], flatLine: number): { path: string; line: number } {
  for (const seg of segments) {
    if (flatLine >= seg.start && flatLine < seg.start + seg.count) {
      return { path: seg.path, line: seg.sourceStart + (flatLine - seg.start) }
    }
  }
  return { path: '', line: flatLine }
}
