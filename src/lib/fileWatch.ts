// Watch the open workspace file for changes made outside c4hero.
//
// Pure and injectable: no File System Access types leak into the logic, so
// the state machine is unit-testable with a fake `read`. The hook that mounts
// it (`useDiskWatch`) supplies the real handle reads and the DOM wake events.
//
// Strategy: prefer `FileSystemObserver` where the caller can provide one;
// otherwise poll — but only while the tab is visible, plus an immediate check
// whenever the tab regains focus/visibility. A background tab must not spin.
//
// Change detection compares content hashes, never mtime alone: FSA writes bump
// mtime, so mtime-only would fire on every one of our own autosaves.

/** What a single read of the watched file(s) yields. `null` = file is gone. */
export interface WatchedSnapshot {
  content: string
  sidecarJson?: string
}

export interface SnapshotHashes {
  dsl: string
  sidecar: string
}

export interface FileWatcherOpts {
  read: () => Promise<WatchedSnapshot | null>
  /** Fired for a change that is not ours (see `isSelfWrite`). */
  onChange: (snapshot: WatchedSnapshot, hashes: SnapshotHashes) => void
  /** Fired once when the file stops being readable (deleted / moved). */
  onMissing?: () => void
  /** Return true when these hashes correspond to something c4hero wrote itself
   *  (or the user chose to keep their version over). Such reads only move the
   *  baseline; they never fire `onChange`. */
  isSelfWrite?: (hashes: SnapshotHashes, previous: SnapshotHashes) => boolean
  /** Poll cadence while visible. */
  intervalMs?: number
  /** Visibility probe — polling stops entirely while this is false. */
  isVisible?: () => boolean
  /** Subscribe to "the tab is back" events (visibilitychange, focus). The
   *  callback triggers an immediate check and restarts polling. Returns an
   *  unsubscribe. */
  subscribeWake?: (cb: () => void) => () => void
  /** Optional native observer hookup (FileSystemObserver). When it returns an
   *  unsubscribe, polling is skipped — wake checks still run as a safety net. */
  observe?: (cb: () => void) => (() => void) | null
}

/** Cheap, deterministic string hash (FNV-1a, 32-bit) — enough to tell "same
 *  bytes" from "different bytes" for change detection; not for security. */
export function hashContent(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${text.length}:${h.toString(16)}`
}

export function hashSnapshot(snapshot: WatchedSnapshot): SnapshotHashes {
  return { dsl: hashContent(snapshot.content), sidecar: hashContent(snapshot.sidecarJson ?? '') }
}

function sameHashes(a: SnapshotHashes, b: SnapshotHashes): boolean {
  return a.dsl === b.dsl && a.sidecar === b.sidecar
}

export function createFileWatcher(opts: FileWatcherOpts) {
  const intervalMs = opts.intervalMs ?? 2000
  const isVisible = opts.isVisible ?? (() => true)
  const isSelfWrite = opts.isSelfWrite ?? (() => false)

  let baseline: SnapshotHashes | null = null
  let started = false
  let disposed = false
  let checking = false
  let missingReported = false
  let timer: ReturnType<typeof setInterval> | null = null
  let unsubscribeWake: (() => void) | null = null
  let unsubscribeObserver: (() => void) | null = null

  function stopPolling() {
    if (timer) { clearInterval(timer); timer = null }
  }

  function startPolling() {
    if (disposed || timer || unsubscribeObserver) return
    if (!isVisible()) return
    timer = setInterval(() => { void check() }, intervalMs)
  }

  /** Read once and compare against the baseline. Safe to call at any time;
   *  overlapping calls collapse into one read. */
  async function check(): Promise<void> {
    if (disposed || checking) return
    checking = true
    try {
      const snapshot = await opts.read()
      if (disposed) return
      if (snapshot === null) {
        if (!missingReported) {
          missingReported = true
          opts.onMissing?.()
        }
        return
      }
      missingReported = false
      const hashes = hashSnapshot(snapshot)
      if (baseline === null) { baseline = hashes; return }
      if (sameHashes(baseline, hashes)) return
      const previous = baseline
      baseline = hashes
      if (isSelfWrite(hashes, previous)) return
      opts.onChange(snapshot, hashes)
    } catch {
      // A transient read failure (permission re-prompt, file mid-replace) is
      // not a change. Try again on the next tick.
    } finally {
      checking = false
    }
  }

  function onWake() {
    if (disposed) return
    if (isVisible()) {
      void check()
      startPolling()
    } else {
      stopPolling()
    }
  }

  return {
    /** Take the baseline from the current file contents and begin watching. */
    async start(): Promise<void> {
      if (started || disposed) return
      started = true
      await check() // seeds the baseline without firing
      if (disposed) return
      unsubscribeObserver = opts.observe?.(() => { void check() }) ?? null
      unsubscribeWake = opts.subscribeWake?.(onWake) ?? null
      startPolling()
    },

    /** Force a comparison now (e.g. after the user dismissed a conflict). */
    checkNow: () => check(),

    /** Accept the given hashes as the new baseline without firing. Used after
     *  a reload or a "keep mine" so the same contents don't re-prompt. */
    acceptBaseline(hashes: SnapshotHashes) {
      baseline = hashes
    },

    /** The hashes the watcher currently considers "what's on disk". */
    getBaseline: () => baseline,

    dispose() {
      disposed = true
      stopPolling()
      unsubscribeWake?.(); unsubscribeWake = null
      unsubscribeObserver?.(); unsubscribeObserver = null
    },
  }
}

export type FileWatcher = ReturnType<typeof createFileWatcher>
