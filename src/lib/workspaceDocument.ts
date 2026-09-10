import type { IncludedFile, Workspace } from '@/types/model'
import { parseDSL, type ParseError } from '@/lib/dsl'
import { applySidecar, parseSidecar } from '@/lib/sidecar'
import {
  locateLine, resolveIncludes, resolveIncludesSync,
  type ResolveIncludesOptions, type ResolveIncludesResult,
} from '@/lib/dsl/includeResolver'

export interface WorkspaceDocumentInput {
  content: string
  fallbackName?: string
  sidecarJson?: string
}

export interface WorkspaceDocumentResult {
  workspace: Workspace
  errors: ParseError[]
  warnings: ParseError[]
}

/** Parse one document (no include resolution). Synchronous and pure: the
 *  code pane, tests and single-file opens use this directly. */
export function parseWorkspaceDocument({
  content,
  fallbackName,
  sidecarJson,
}: WorkspaceDocumentInput): WorkspaceDocumentResult {
  const { workspace, errors, warnings } = parseDSL(content)
  if (!workspace.name && fallbackName) workspace.name = fallbackName

  const sidecar = sidecarJson ? parseSidecar(sidecarJson) : null
  if (sidecar) applySidecar(workspace, sidecar)

  return { workspace, errors, warnings }
}

export interface LoadWorkspaceDocumentInput extends WorkspaceDocumentInput {
  /** Read an `!include`d file by path relative to the root file; `null` when
   *  it does not exist. Omit to load without resolving includes. */
  readInclude?: ResolveIncludesOptions['read']
}

/** A file included from inside `model { }` that contains only plain model
 *  content can be written back as a fragment. Anything else (a `views`
 *  block, a `workspace` wrapper, its own `!` directives, an include inside an
 *  element) is shown read-only. */
function classifyIncluded(path: string, text: string, scope: string | undefined): IncludedFile {
  if (scope !== 'model') {
    return { path, writable: false, reason: scope === 'element' ? 'included inside an element block' : `included in the ${scope ?? 'workspace'} block`, text }
  }
  const code = text.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/.*$|#.*$/gm, '')
  if (/^\s*!/m.test(code)) return { path, writable: false, reason: 'contains its own ! directives', text }
  if (/^\s*(workspace|model|views|configuration)\b[^\n]*\{/m.test(code)) {
    return { path, writable: false, reason: 'not a plain model fragment', text }
  }
  return { path, writable: true, text }
}

/** Parse an already-resolved document and attach provenance, file
 *  classification, and file-relative error locations. Sync and pure. */
export function stitchWorkspaceDocument(
  input: WorkspaceDocumentInput,
  resolved: ResolveIncludesResult,
  texts: Map<string, string>,
): WorkspaceDocumentResult {
  const { workspace, errors: rawErrors, warnings: rawWarnings, declarationLines, viewLines } = parseDSL(resolved.content)
  if (!workspace.name && input.fallbackName) workspace.name = input.fallbackName

  // Provenance: map every declaration back to the file it was read from.
  const fileOf = (flatLine: number | undefined): string | undefined => {
    if (flatLine === undefined) return undefined
    const { path } = locateLine(resolved.segments, flatLine)
    return path || undefined
  }
  const tag = <T extends { id: string; sourcePath?: string }>(item: T) => {
    const p = fileOf(declarationLines.get(item.id))
    if (p) item.sourcePath = p
  }
  for (const person of workspace.model.people) tag(person)
  for (const sys of workspace.model.softwareSystems) {
    tag(sys)
    for (const c of sys.containers) { tag(c); for (const comp of c.components) tag(comp) }
  }
  for (const rel of workspace.model.relationships) tag(rel)
  for (const g of workspace.model.groups) tag(g)
  for (const env of workspace.model.deploymentEnvironments ?? []) tag(env)
  for (const [view, line] of viewLines) {
    const p = fileOf(line)
    if (p) view.sourcePath = p
  }

  workspace.includedFiles = resolved.files.map((path) => classifyIncluded(path, texts.get(path) ?? '', resolved.scopes.get(path)))

  // Errors from included files point at that file. Resolution errors
  // (missing file, cycle, caps) are real errors: the model is incomplete.
  const relocate = (e: ParseError): ParseError => {
    const { path, line } = locateLine(resolved.segments, e.line)
    return path ? { ...e, line, message: `${path}:${line}: ${e.message}` } : { ...e, line }
  }
  const errors: ParseError[] = [
    ...resolved.errors.map((e) => ({ message: e.path ? `${e.path}:${e.line}: ${e.message}` : e.message, line: e.line, column: 1 })),
    ...rawErrors.map(relocate),
  ]
  // The phase-A "preserved but not resolved" warning no longer applies to
  // includes that did resolve; keep it for the ones deliberately left alone.
  const warnings = rawWarnings
    .map(relocate)
    .filter((w) => {
      const m = w.message.match(/^(?:.*?: )?!include\s+(.+?) is preserved/)
      if (!m) return true
      const target = m[1].replace(/^["']|["']$/g, '')
      return !resolved.files.some((f) => f === target || f.endsWith('/' + target))
    })

  const sidecar = input.sidecarJson ? parseSidecar(input.sidecarJson) : null
  if (sidecar) applySidecar(workspace, sidecar)

  return { workspace, errors, warnings }
}

/** Parse a document loaded from a folder, resolving `!include` against
 *  `readInclude` first (TEA-325 phase B). Elements, relationships, groups,
 *  views and environments declared in an included file carry `sourcePath`;
 *  errors and warnings from included files are prefixed with `path:line:`. */
export async function loadWorkspaceDocument(input: LoadWorkspaceDocumentInput): Promise<WorkspaceDocumentResult> {
  if (!input.readInclude || !/^\s*!include\b/m.test(input.content)) {
    return parseWorkspaceDocument(input)
  }
  const texts = new Map<string, string>()
  const resolved = await resolveIncludes(input.content, {
    read: async (path) => {
      const text = await input.readInclude!(path)
      if (text !== null) texts.set(path, text)
      return text
    },
  })
  if (resolved.files.length === 0 && resolved.errors.length === 0) {
    // Only unresolvable includes (URLs etc.): plain parse keeps the warnings.
    return parseWorkspaceDocument(input)
  }
  return stitchWorkspaceDocument(input, resolved, texts)
}

/** Re-parse the root text of a multi-file workspace using the included
 *  texts captured when it was loaded, so a code-pane edit produces the same
 *  ids and provenance as a fresh open. An `!include` of a file that was not
 *  loaded is reported as an error rather than read from disk. */
export function restitchWorkspaceDocument(
  rootText: string,
  current: Workspace,
  fallbackName?: string,
): WorkspaceDocumentResult {
  const files = new Map<string, string>()
  for (const f of current.includedFiles ?? []) if (f.text !== undefined) files.set(f.path, f.text)
  const resolved = resolveIncludesSync(rootText, { files })
  const result = stitchWorkspaceDocument({ content: rootText, fallbackName }, resolved, files)
  for (const path of resolved.needed) {
    result.errors.push({ message: `!include ${path}: file was not loaded with this workspace — reopen it from the folder`, line: 1, column: 1 })
  }
  return result
}
