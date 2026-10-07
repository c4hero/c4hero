import type { Workspace } from '@/types/model'
import { serializeRoot, planIncludedWrites } from '@/lib/includeWriteback'
import { extractSidecar, parseSidecar, serializeSidecar } from '@/lib/sidecar'
import { forEachElementHelper } from '@/store/workspace-helpers'
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
  const legacy = source.sidecarJson ? parseSidecar(source.sidecarJson) : null
  // Old sidecars own status/owner/lineStyle until their DSL file is actually
  // rewritten. Preserving the DSL bytes while dropping that metadata from a
  // layout save would lose it on the next open.
  const retainLegacyMetadata = (current: Workspace, projected: DocumentSnapshot) => {
    if (!legacy?.elements && !legacy?.relationships) return projected.sidecarJson!
    const sidecar = JSON.parse(projected.sidecarJson!)
    const unchanged = (path?: string) => path
      ? projected.includes[path] === baseline.includes[path]
      : projected.content === baseline.content
    const elements = new Map<string, string | undefined>()
    forEachElementHelper(current, element => { elements.set(element.id, element.sourcePath) })
    const retainedElements = Object.fromEntries(Object.entries(legacy?.elements ?? {})
      .filter(([id]) => elements.has(id) && unchanged(elements.get(id))))
    const relationships = new Map(current.model.relationships.map(relationship => [relationship.id, relationship.sourcePath]))
    const retainedRelationships = Object.fromEntries(Object.entries(legacy?.relationships ?? {})
      .filter(([id]) => relationships.has(id) && unchanged(relationships.get(id))))
    if (Object.keys(retainedElements).length) sidecar.elements = retainedElements
    if (Object.keys(retainedRelationships).length) sidecar.relationships = retainedRelationships
    return serializeSidecar(sidecar)
  }
  const baselineSidecar = retainLegacyMetadata(workspace, baseline)
  return (current: Workspace): DocumentSnapshot => {
    const projected = project(current)
    const sidecarJson = retainLegacyMetadata(current, projected)
    return {
      content: projected.content === baseline.content ? source.content : projected.content,
      sidecarJson: sidecarJson === baselineSidecar ? source.sidecarJson : sidecarJson,
      includes: Object.fromEntries(Object.entries(projected.includes).map(([path, text]) => [
        path, text === baseline.includes[path] ? source.includes[path] ?? text : text,
      ])),
    }
  }
}
