// Dev/E2E-only stand-in for a file on disk.
//
// Playwright cannot drive the File System Access API, so `main.tsx` exposes
// `window.__testFileSource` (DEV builds only) which installs an in-memory
// source here. `useDiskWatch` watches it exactly as it would a real handle.

import type { WatchedSnapshot } from '@/lib/fileWatch'

export interface TestFileSource {
  filename: string
  read: () => Promise<WatchedSnapshot | null>
}

let source: TestFileSource | null = null
const listeners = new Set<() => void>()

export function getTestFileSource(): TestFileSource | null {
  return source
}

export function setTestFileSource(next: TestFileSource | null): void {
  source = next
  for (const cb of listeners) cb()
}

/** Re-render hook: fires when the source is installed or removed. */
export function subscribeTestFileSource(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
