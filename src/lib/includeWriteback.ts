// Route a save across the files a workspace was assembled from (TEA-325 C-lite).
//
// The root document is serialized with `source: null` (its own content plus
// the preserved `!include` lines). Each writable included file gets a bare
// model fragment holding exactly the content it declared. Read-only files are
// never written; edits to their content are blocked in the store instead.

import type { Workspace } from '@/types/model'
import { serializeDSL } from '@/lib/dsl'

export interface PlannedWrite {
  /** Path relative to the root file. */
  path: string
  content: string
}

/** True when this workspace was stitched from more than one file. */
export function hasIncludedFiles(ws: Workspace): boolean {
  return (ws.includedFiles?.length ?? 0) > 0
}

/** Serialize the root document: everything when the workspace is a single
 *  file, root-owned content only when it has includes. */
export function serializeRoot(ws: Workspace): string {
  return hasIncludedFiles(ws) ? serializeDSL(ws, { source: null }) : serializeDSL(ws)
}

/** Fragments to write for every writable included file. */
export function planIncludedWrites(ws: Workspace): PlannedWrite[] {
  if (!hasIncludedFiles(ws)) return []
  return (ws.includedFiles ?? [])
    .filter((f) => f.writable)
    .map((f) => ({ path: f.path, content: serializeDSL(ws, { source: f.path }) }))
}

/** Is content from `sourcePath` locked against edits? Root content
 *  (`undefined`) never is. */
export function isReadOnlySource(ws: Workspace, sourcePath: string | undefined): boolean {
  if (!sourcePath) return false
  const f = ws.includedFiles?.find((x) => x.path === sourcePath)
  return f ? !f.writable : true
}
