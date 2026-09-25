import type { ElementStatus, BuiltInElementStatus, Workspace } from '@/types/model'
import { forEachElementHelper } from '@/store/workspace-helpers'

// Single source of truth for the element-status vocabulary.
//
// Status is c4hero's own lifecycle axis — neither the C4 model nor Structurizr
// has one — so it travels through the DSL as a vendor-namespaced element
// property, `"c4hero.status" "Live"`. The four built-ins below cover the common
// "does this exist yet?" arc, but they are not the only lifecycle positions a
// team needs: "proposed, not yet committed" is a real one they cannot express.
// So the vocabulary is open. It is the union of three ordered sources:
//
//   1. the built-ins, always present and always first;
//   2. statuses the user declared in canvas settings;
//   3. statuses actually present in the loaded workspace.
//
// (3) is what keeps the feature lossless for files c4hero did not write: a
// `"c4hero.status" "Beyond MVP"` written by hand, or by an older c4hero that
// left it as a plain property, lights up as a first-class status on load.

export const BUILT_IN_ELEMENT_STATUSES: readonly BuiltInElementStatus[] = [
  'Live', 'Planned', 'Deprecated', 'Removed',
]

const BUILT_IN_SET: ReadonlySet<string> = new Set<string>(BUILT_IN_ELEMENT_STATUSES)

/** Longest accepted status value. Bounds untrusted DSL, sidecar and model
 *  output the same way the AI sanitizer caps every other free-text field. */
export const MAX_STATUS_LENGTH = 60

export function isBuiltInElementStatus(v: string): v is BuiltInElementStatus {
  return BUILT_IN_SET.has(v)
}

/** True for any value usable as a status: a non-blank, single-line, bounded
 *  string. The open counterpart of the old closed-enum guard. */
export function isElementStatusValue(v: unknown): v is ElementStatus {
  return typeof v === 'string'
    && v.trim().length > 0
    && v.length <= MAX_STATUS_LENGTH
    && !/[\r\n]/.test(v)
}

/** Trim to the canonical spelling, or undefined when unusable. Callers that
 *  accept a status from outside the app run it through this, so " Live " and
 *  "Live" never coexist as two entries in the vocabulary. */
export function normalizeElementStatus(v: unknown): ElementStatus | undefined {
  if (typeof v !== 'string') return undefined
  const trimmed = v.trim()
  return isElementStatusValue(trimmed) ? trimmed : undefined
}

// ─── Colour ─────────────────────────────────────────────────────────

/** Built-ins keep their themeable CSS custom properties. A custom status has
 *  no custom property to read, so its hue is derived from its own name: stable
 *  across reloads and machines, and distinct enough to tell two apart without
 *  asking the user to pick a colour before they can use the status. */
export function statusColor(status: ElementStatus): string {
  if (isBuiltInElementStatus(status)) {
    return `var(--color-status-${status.toLowerCase()})`
  }
  // FNV-1a over the name, folded onto the colour wheel.
  let hash = 0x811c9dc5
  for (let i = 0; i < status.length; i++) {
    hash ^= status.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 65% 58%)`
}

// ─── Vocabulary ─────────────────────────────────────────────────────

/** Parse the user's declared extras. Accepts a comma- or newline-separated
 *  list so the settings field can be a single text input. Built-ins and
 *  duplicates are dropped — they are already in the vocabulary. */
export function parseCustomStatuses(raw: string): ElementStatus[] {
  const seen = new Set<string>(BUILT_IN_ELEMENT_STATUSES)
  const out: ElementStatus[] = []
  for (const part of raw.split(/[,\n]/)) {
    const status = normalizeElementStatus(part)
    if (status === undefined || seen.has(status)) continue
    seen.add(status)
    out.push(status)
  }
  return out
}

/** Statuses carried by elements in this workspace, in first-seen order. */
export function statusesInWorkspace(workspace: Workspace | null | undefined): ElementStatus[] {
  if (!workspace) return []
  const seen = new Set<string>()
  const out: ElementStatus[] = []
  forEachElementHelper(workspace, (el) => {
    const status = el.status
    if (status === undefined || seen.has(status)) return
    seen.add(status)
    out.push(status)
  })
  return out
}

/** The full ordered vocabulary: built-ins, then declared extras, then
 *  anything else the workspace turned out to be using. */
export function elementStatusVocabulary(
  customStatuses: readonly ElementStatus[],
  workspace?: Workspace | null,
): ElementStatus[] {
  const seen = new Set<string>()
  const out: ElementStatus[] = []
  for (const status of [...BUILT_IN_ELEMENT_STATUSES, ...customStatuses, ...statusesInWorkspace(workspace)]) {
    if (seen.has(status)) continue
    seen.add(status)
    out.push(status)
  }
  return out
}
