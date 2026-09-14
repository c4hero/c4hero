import { create } from 'zustand'
import type { ModelElement, Workspace } from '@/types/model'
import {
  allDocsDirs,
  appendToIndex,
  defaultDocsDir,
  dirTitle,
  docsDirectiveLine,
  elementDocsScope,
  nextAdrFilename,
  parseDocsBundle,
  renderNewAdr,
  renderNewDoc,
  slugify,
  uniqueDocFilename,
  workspaceDocsScope,
  type DocConcept,
  type DocsBundle,
  type DocsKind,
  type DocsScope,
  type NewDocInput,
} from '@/lib/docs/bundle'
import { getCurrentDirHandle, listFilesAt, readTextFileAt, writeTextFileAt } from '@/lib/folderIO'
import { findElementHelper } from '@/store/workspace-helpers'
import { useWorkspaceStore } from '@/store/workspace'
import { createLogger } from '@/lib/logger'

const log = createLogger('docs')

/**
 * The documentation attached to the open workspace through `!docs` / `!adrs`
 * directives, read from disk as OKF bundles. Lives beside the workspace store
 * rather than inside it: docs are files the DSL points at, not part of the
 * model, so they are never serialized, undone or diffed with it.
 *
 * Loading needs an open folder (File System Access API). Without one the
 * store is simply empty and the UI says why.
 */

export interface DocsState {
  /** Loaded bundles keyed by `kind:dir`. A key maps to `null` while its
   *  folder does not exist on disk. */
  bundles: Record<string, DocsBundle | null>
  /** True once a load has run for the current directive set. */
  loaded: boolean
  /** Re-read every bundle the workspace references. Safe to call often:
   *  no-op without an open folder. Only the latest call lands: a slower,
   *  earlier read (or one still in flight when the store is reset) is
   *  dropped rather than overwriting newer state. */
  load: (ws: Workspace) => Promise<void>
  /** Write a new doc or ADR into the scope's bundle, creating the folder,
   *  the index and — when the scope has no directive yet — the `!docs` /
   *  `!adrs` line in the DSL. Resolves with the new file's path, or `null`
   *  when nothing could be written (no folder open, or the write failed). */
  create: (kind: DocsKind, scope: { elementId?: string }, input: NewDocInput) => Promise<string | null>
  reset: () => void
}

export const bundleKey = (kind: DocsKind, dir: string): string => `${kind}:${dir}`

/** Identity of the most recent load / reset; a load whose ticket is stale by
 *  the time its reads finish discards its result. */
let loadTicket = 0

export const useDocsStore = create<DocsState>((set, get) => ({
  bundles: {},
  loaded: false,

  load: async (ws) => {
    const ticket = ++loadTicket
    const refs = allDocsDirs(ws)
    if (!getCurrentDirHandle() || refs.length === 0) {
      set({ bundles: {}, loaded: true })
      return
    }
    const bundles: Record<string, DocsBundle | null> = {}
    await Promise.all(refs.map(async ({ kind, dir }) => {
      try {
        const names = await listFilesAt(dir)
        if (names === null) {
          bundles[bundleKey(kind, dir)] = null
          return
        }
        const files = await Promise.all(
          names.filter((n) => n.toLowerCase().endsWith('.md')).map(async (name) => ({
            name,
            text: (await readTextFileAt(`${dir}/${name}`)) ?? '',
          })),
        )
        bundles[bundleKey(kind, dir)] = parseDocsBundle(kind, dir, files)
      } catch (err) {
        // A folder we cannot read shows as absent rather than breaking the
        // load for every other bundle.
        log.warn('docs bundle unreadable', { kind, dir, err })
        bundles[bundleKey(kind, dir)] = null
      }
    }))
    if (ticket !== loadTicket) return
    set({ bundles, loaded: true })
  },

  create: async (kind, scope, input) => {
    const wsStore = useWorkspaceStore.getState()
    const ws = wsStore.workspace
    if (!ws || !getCurrentDirHandle()) return null

    const element = scope.elementId ? findElementHelper(ws, scope.elementId) : undefined
    const existingScope: DocsScope = element ? elementDocsScope(element) : workspaceDocsScope(ws)
    let dir = existingScope[kind]
    const needsDirective = dir === undefined
    if (dir === undefined) dir = defaultDocsDir(kind, scope.elementId)

    // Reads can throw (permission revoked, an oversized index.md); the
    // callers only branch on the path, so a failure is a `null` like any
    // other failed write.
    let path: string
    try {
      const existing = (await listFilesAt(dir)) ?? []
      const file = kind === 'adrs'
        ? nextAdrFilename(existing, input.title)
        : uniqueDocFilename(existing, slugify(input.title))
      // The file's leading number, however many digits adr-tools reached.
      const number = kind === 'adrs' ? parseInt(file, 10) : 0
      const content = kind === 'adrs'
        ? renderNewAdr({ ...input, number, elementId: scope.elementId })
        : renderNewDoc({ ...input, elementId: scope.elementId })

      path = `${dir}/${file}`
      if (!(await writeTextFileAt(path, content))) return null

      // Keep the bundle's section index in step, as an OKF consumer expects.
      const indexPath = `${dir}/index.md`
      const index = appendToIndex(await readTextFileAt(indexPath), dirTitle(kind, dir), file, input.title, input.description)
      await writeTextFileAt(indexPath, index)
    } catch (err) {
      log.error('docs create failed', { kind, dir, err })
      return null
    }

    if (needsDirective) {
      const line = docsDirectiveLine(kind, dir)
      if (scope.elementId) wsStore.addElementDirective(scope.elementId, line)
      else wsStore.addWorkspaceDirective(line)
    }

    const current = useWorkspaceStore.getState().workspace
    if (current) await get().load(current)
    return path
  },

  reset: () => { loadTicket++; set({ bundles: {}, loaded: false }) },
}))

// ─── Selectors ───────────────────────────────────────────────────────

export interface ScopedDocs {
  scope: DocsScope
  docs: DocConcept[]
  adrs: DocConcept[]
  /** Folders the DSL names that do not exist on disk. */
  missing: Array<{ kind: DocsKind; dir: string }>
}

function collect(bundles: DocsState['bundles'], scope: DocsScope): ScopedDocs {
  const out: ScopedDocs = { scope, docs: [], adrs: [], missing: [] }
  for (const kind of ['docs', 'adrs'] as const) {
    const dir = scope[kind]
    if (!dir) continue
    const bundle = bundles[bundleKey(kind, dir)]
    if (bundle === null) out.missing.push({ kind, dir })
    else if (bundle) out[kind] = bundle.concepts
  }
  return out
}

export function selectWorkspaceDocs(bundles: DocsState['bundles'], ws: Workspace): ScopedDocs {
  return collect(bundles, workspaceDocsScope(ws))
}

export function selectElementDocs(bundles: DocsState['bundles'], ws: Workspace, elementId: string): ScopedDocs {
  const element = findElementHelper(ws, elementId)
  return collect(bundles, element ? elementDocsScope(element) : {})
}

/** Whether one element's own bundles hold at least one concept — what the
 *  canvas badges. A primitive, so nodes can subscribe to it directly. */
export function selectElementHasDocs(bundles: DocsState['bundles'], element: Pick<ModelElement, 'directives'>): boolean {
  const scope = elementDocsScope(element)
  return (['docs', 'adrs'] as const).some((kind) => {
    const dir = scope[kind]
    return !!dir && (bundles[bundleKey(kind, dir)]?.concepts.length ?? 0) > 0
  })
}
