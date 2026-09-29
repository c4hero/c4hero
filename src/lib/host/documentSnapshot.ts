import type { Workspace } from '@/types/model'
import { serializeRoot, planIncludedWrites } from '@/lib/includeWriteback'
import { extractSidecar, serializeSidecar } from '@/lib/sidecar'
import type { DocumentSnapshot } from './protocol'

function project(workspace: Workspace): DocumentSnapshot {
  return {
    content: serializeRoot(workspace),
    sidecarJson: serializeSidecar(extractSidecar(workspace) ?? { version: 1, views: {} }),
    includes: Object.fromEntries(planIncludedWrites(workspace).map(({ path, content }) => [path, content])),
  }
}

/** Preserve source bytes for parts of the workspace the user has not edited.
 * In particular, a layout drag must not canonicalize the DSL. */
export function createSnapshotProjector(workspace: Workspace, source: DocumentSnapshot) {
  const baseline = project(workspace)
  return (current: Workspace): DocumentSnapshot => {
    const projected = project(current)
    return {
      content: projected.content === baseline.content ? source.content : projected.content,
      sidecarJson: projected.sidecarJson === baseline.sidecarJson ? source.sidecarJson : projected.sidecarJson,
      includes: Object.fromEntries(Object.entries(projected.includes).map(([path, text]) => [
        path, text === baseline.includes[path] ? source.includes[path] ?? text : text,
      ])),
    }
  }
}
