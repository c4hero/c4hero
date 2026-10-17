// Tells the disk watcher which file contents c4hero wrote itself.
//
// Autosave and manual save both record the hash of what they put on disk;
// the watcher treats a read matching a recorded hash as "ours" and only moves
// its baseline. Without this every autosave would look like an external edit.
//
// The DSL and the sidecar are written as two separate files, so a poll can
// observe the new DSL next to the still-old sidecar (or vice versa). Hashes
// are therefore tracked per file: a snapshot is ours when each part is either
// an unobserved successful write or unchanged from what the watcher last saw.

import { hashContent, type SnapshotHashes } from '@/lib/fileWatch'

export type SaveDestination =
  | { kind: 'file'; handle: FileSystemFileHandle }
  | { kind: 'folder'; handle: FileSystemDirectoryHandle; filename: string }

/** Captured before asynchronous work, so a late completion cannot add a
 *  self-write expectation to a different watch target. */
export interface SelfWriteToken {
  readonly generation: number
  readonly destination?: SaveDestination
}

let generation = 0
let writeRevision = 0
let watchedDestination: SaveDestination | null = null
const activeWrites = new Set<{ token: SelfWriteToken }>()

const selfDsl: string[] = []
const selfSidecar: string[] = []
/** Snapshots the user chose to keep their in-memory version over ("Keep mine"). */
const suppressed = new Set<string>()

function remember(list: string[], hash: string) {
  // A completed write supersedes every earlier write to this file, even if
  // polling never observed it. Retaining those hashes could hide an external
  // restore of the older content.
  list.length = 0
  list.push(hash)
}

function sameDestination(a: SaveDestination, b: SaveDestination): boolean {
  return a.kind === b.kind && a.handle === b.handle
    && (a.kind !== 'folder' || (b.kind === 'folder' && a.filename === b.filename))
}

export function captureSelfWrite(destination?: SaveDestination): SelfWriteToken {
  return { generation, destination }
}

export function withSelfWriteDestination(token: SelfWriteToken, destination: SaveDestination): SelfWriteToken {
  return { generation: token.generation, destination }
}

function canRecord(token?: SelfWriteToken): boolean {
  return !token || (token.generation === generation && (!watchedDestination
    || (!!token.destination && sameDestination(token.destination, watchedDestination))))
}

/** Defer watcher observations while a scoped write may expose its bytes but
 *  has not yet resolved close(). No hash is trusted until the write succeeds. */
export function beginSelfWrite(token: SelfWriteToken): () => void {
  if (!canRecord(token)) return () => {}
  const active = { token }
  activeWrites.add(active)
  writeRevision++
  return () => { activeWrites.delete(active) }
}

export function isSelfWritePending(): boolean {
  for (const active of activeWrites) if (canRecord(active.token)) return true
  return false
}

/** Watcher reads spanning even an entire start/close cycle are stale. */
export function getSelfWriteRevision(): number {
  return writeRevision
}

function consumeThrough(list: string[], hash: string): void {
  const index = list.indexOf(hash)
  if (index !== -1) list.splice(0, index + 1)
}

function invalidateExpectations(): void {
  generation++
  writeRevision++
  selfDsl.length = 0
  selfSidecar.length = 0
  suppressed.clear()
  activeWrites.clear()
}

/** Call right after writing DSL text to disk (the low-level writers do). */
export function recordSelfDslWrite(dsl: string, token?: SelfWriteToken): void {
  if (!canRecord(token)) return
  remember(selfDsl, hashContent(dsl))
}

/** Call right after writing sidecar JSON to disk (the low-level writers do). */
export function recordSelfSidecarWrite(json: string, token?: SelfWriteToken): void {
  if (!canRecord(token)) return
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
  const explicitlySuppressed = suppressed.has(key)
  const dslOk = selfDsl.includes(hashes.dsl) || (previous !== null && previous.dsl === hashes.dsl)
  const sidecarOk = selfSidecar.includes(hashes.sidecar) || (previous !== null && previous.sidecar === hashes.sidecar)
  if (!explicitlySuppressed && !(dslOk && sidecarOk)) {
    // A genuine external change ends the old write history, including tokens
    // captured by operations which are still waiting in the write queue.
    invalidateExpectations()
    return false
  }
  // Expectations acknowledge the latest successful bytes once; they are not
  // a history of content the user may never return to.
  consumeThrough(selfDsl, hashes.dsl)
  consumeThrough(selfSidecar, hashes.sidecar)
  suppressed.delete(key)
  return true
}

/** "Keep mine": stop prompting about this exact on-disk state. The next
 *  autosave overwrites it anyway. */
export function suppressSnapshot(hashes: SnapshotHashes): void {
  suppressed.add(`${hashes.dsl}|${hashes.sidecar}`)
}

/** Test/reset hook — also called when the watched file changes identity. */
export function resetSaveCoordinator(destination: SaveDestination | null = null): void {
  invalidateExpectations()
  watchedDestination = destination
}

/** A newly linked file can start being watched while its first save is in
 *  progress. Adopt matching scoped tokens instead of invalidating that save.
 *  A replacement for an existing target still gets a fresh generation. */
export function startWatchingDestination(destination: SaveDestination | null): void {
  if (watchedDestination !== null) {
    resetSaveCoordinator(destination)
    return
  }
  selfDsl.length = 0
  selfSidecar.length = 0
  suppressed.clear()
  watchedDestination = destination
  writeRevision++
}
