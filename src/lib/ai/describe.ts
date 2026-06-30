import type { Workspace } from '@/types/model'
import type { DescribeResult, DescribePatch } from './types'
import {
  elementsMissingDescription, relationshipsMissingDescription, elementNameMap,
} from './context'

// Apply AI-generated descriptions surgically: only to ids that still exist and
// still lack a description, so re-running never clobbers human edits. Decoupled
// from the store via the DescribeActions interface for testability.

export interface DescribeActions {
  updateElement: (id: string, patch: { description?: string }) => void
  updateRelationship: (id: string, patch: { description?: string }) => void
}

export interface DescribePreviewItem {
  id: string
  /** Element or relationship display label. */
  label: string
  description: string
}

export interface DescribePreview {
  elements: DescribePreviewItem[]
  relationships: DescribePreviewItem[]
}

/** Number of elements + relationships currently lacking a description. */
export function countMissingDescriptions(ws: Workspace): number {
  return elementsMissingDescription(ws).length + relationshipsMissingDescription(ws).length
}

function filterApplicable(
  patches: DescribePatch[],
  missingIds: ReadonlySet<string>,
): DescribePatch[] {
  const seen = new Set<string>()
  return patches.filter((p) => {
    const desc = p.description?.trim()
    if (!desc || !missingIds.has(p.id) || seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
}

/** Build a labeled preview of the patches that would actually apply. */
export function buildDescribePreview(result: DescribeResult, ws: Workspace): DescribePreview {
  const names = elementNameMap(ws)
  const missingEl = new Set(elementsMissingDescription(ws).map((e) => e.id))
  const missingRel = new Set(relationshipsMissingDescription(ws).map((r) => r.id))
  const relLabel = (id: string) => {
    const r = ws.model.relationships.find((x) => x.id === id)
    if (!r) return id
    return `${names.get(r.sourceId) ?? r.sourceId} → ${names.get(r.destinationId) ?? r.destinationId}`
  }

  return {
    elements: filterApplicable(result.elements ?? [], missingEl).map((p) => ({
      id: p.id, label: names.get(p.id) ?? p.id, description: p.description.trim(),
    })),
    relationships: filterApplicable(result.relationships ?? [], missingRel).map((p) => ({
      id: p.id, label: relLabel(p.id), description: p.description.trim(),
    })),
  }
}

/** Apply a previously-built preview. Returns how many descriptions were set. */
export function applyDescribePreview(preview: DescribePreview, actions: DescribeActions): number {
  let count = 0
  for (const item of preview.elements) {
    actions.updateElement(item.id, { description: item.description })
    count++
  }
  for (const item of preview.relationships) {
    actions.updateRelationship(item.id, { description: item.description })
    count++
  }
  return count
}
