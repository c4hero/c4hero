// Tells the disk watcher which file contents c4hero wrote itself.
//
// Autosave and manual save both record the hash of what they put on disk;
// the watcher treats a read matching a recorded hash as "ours" and only moves
// its baseline. Without this every autosave would look like an external edit.
//
// The DSL and the sidecar are written as two separate files, so a poll can
// observe the new DSL next to the still-old sidecar (or vice versa). Hashes
// are therefore tracked per file: a snapshot is ours when each part is either
// something we wrote recently or unchanged from what the watcher last saw.

import { hashContent, type SnapshotHashes } from '@/lib/fileWatch'

const MAX_REMEMBERED = 16

const selfDsl: string[] = []
const selfSidecar: string[] = []
/** Snapshots the user chose to keep their in-memory version over ("Keep mine"). */
const suppressed = new Set<string>()

function remember(list: string[], hash: string) {
  const idx = list.indexOf(hash)
  if (idx !== -1) list.splice(idx, 1)
  list.push(hash)
  if (list.length > MAX_REMEMBERED) list.shift()
}

/** Call right after writing DSL text to disk (the low-level writers do). */
export function recordSelfDslWrite(dsl: string): void {
  remember(selfDsl, hashContent(dsl))
}

/** Call right after writing sidecar JSON to disk (the low-level writers do). */
export function recordSelfSidecarWrite(json: string): void {
  remember(selfSidecar, hashContent(json))
}

/** Convenience for callers that write both at once. */
export function recordSelfWrite(dsl: string, sidecarJson?: string): void {
  recordSelfDslWrite(dsl)
  // A workspace with no sidecar leaves whatever sidecar is on disk untouched;
  // an empty-string hash matches "no sidecar file" on the read side.
  recordSelfSidecarWrite(sidecarJson ?? '')
}

/** Did c4hero itself produce this on-disk state? `previous` is the watcher's
 *  last baseline, so an unchanged half (DSL or sidecar) doesn't need to have
 *  been written by us to count. */
export function isSelfWrite(hashes: SnapshotHashes, previous: SnapshotHashes | null): boolean {
  const key = `${hashes.dsl}|${hashes.sidecar}`
  if (suppressed.has(key)) return true
  const dslOk = selfDsl.includes(hashes.dsl) || (previous !== null && previous.dsl === hashes.dsl)
  const sidecarOk = selfSidecar.includes(hashes.sidecar) || (previous !== null && previous.sidecar === hashes.sidecar)
  return dslOk && sidecarOk
}

/** "Keep mine": stop prompting about this exact on-disk state. The next
 *  autosave overwrites it anyway. */
export function suppressSnapshot(hashes: SnapshotHashes): void {
  suppressed.add(`${hashes.dsl}|${hashes.sidecar}`)
}

/** Test/reset hook — also called when the watched file changes identity. */
export function resetSaveCoordinator(): void {
  selfDsl.length = 0
  selfSidecar.length = 0
  suppressed.clear()
}
