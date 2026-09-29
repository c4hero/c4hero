import type { DocumentSnapshot } from './protocol'

/** Serialize edits and save/history commands across the asynchronous bridge.
 * The next edit uses the revision acknowledged by the previous edit, never a
 * revision guessed from an optimistic local change. */
export function createDocumentSync(
  initial: DocumentSnapshot,
  revision: number,
  edit: (snapshot: DocumentSnapshot, revision: number) => Promise<number>,
) {
  let current = initial
  let tail: Promise<void> = Promise.resolve()
  let generation = 0
  let failed: unknown
  const equal = (a: DocumentSnapshot, b: DocumentSnapshot) => JSON.stringify(a) === JSON.stringify(b)
  return {
    push(snapshot: DocumentSnapshot): Promise<void> {
      const epoch = generation
      tail = tail.then(async () => {
        if (epoch !== generation || equal(snapshot, current)) return
        const acknowledged = await edit(snapshot, revision)
        if (epoch === generation) { revision = acknowledged; current = snapshot }
      }).catch((error: unknown) => { if (epoch === generation) { failed = error; throw error } })
      // Keep a failed edit from becoming an unhandled rejection while still
      // making flush/save fail instead of reporting a false success.
      void tail.catch(() => {})
      return tail
    },
    receive(snapshot: DocumentSnapshot, nextRevision: number) {
      generation++
      current = snapshot
      revision = nextRevision
      failed = undefined
      tail = tail.catch(() => {})
    },
    async flush() { await tail; if (failed) throw failed },
    dispose() { generation++ },
  }
}
