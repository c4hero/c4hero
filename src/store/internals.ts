import { isDraft, original } from 'immer'
import { customAlphabet } from 'nanoid'
import type { Workspace } from '@/types/model'
import type { WorkspaceState } from './workspace-types'
import { MAX_UNDO } from './workspace-types'

// ─── ID generation ───────────────────────────────────────────────────

// IDs must be valid Structurizr DSL identifiers from the moment they are created
// so they survive a serialize → parse roundtrip without any sanitization:
//   - No hyphens: the serializer maps `-` → `_`, changing the ID.
//   - No leading digits: the serializer prepends `e` to digit-prefixed IDs,
//     changing them (e.g. `0abc1234` → var name `e0abc1234` → new ID `e0abc1234`).
// Using only letters guarantees IDs are always valid as-is.
export const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 8)

// ─── Undo snapshot helpers ───────────────────────────────────────────

/** Resolve the pre-mutation workspace reference suitable for the undo stack.
 *  Inside an Immer producer, original(draft) returns the pre-produce ref —
 *  immutable, structurally shared with the next state. Outside a producer
 *  (e.g. test setState shortcuts), s.workspace is already a stable snapshot. */
export function undoSnapshot(s: WorkspaceState): Workspace | null {
  if (!s.workspace) return null
  return isDraft(s.workspace) ? (original(s.workspace) as Workspace) : s.workspace
}

/** Append the pre-produce workspace snapshot to undoStack and clear redoStack
 *  in place. Safe to call before OR after mutations — original() always
 *  returns the pre-produce ref, so position within the producer doesn't
 *  matter. */
export function pushUndoSnapshot(s: WorkspaceState): void {
  const snapshot = undoSnapshot(s)
  if (!snapshot) return
  s.undoStack.push(snapshot)
  // Trim to MAX_UNDO entries from the front (oldest first).
  if (s.undoStack.length > MAX_UNDO) s.undoStack.splice(0, s.undoStack.length - MAX_UNDO)
  s.redoStack.length = 0
}
