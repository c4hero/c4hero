// File System Access handles live outside React state. Subscribers need a
// new snapshot when a successful open or save links a different destination.
let revision = 0
const listeners = new Set<() => void>()

export function getHandleRevision(): number {
  return revision
}

export function subscribeHandleChanges(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function notifyHandleChanges(): void {
  revision++
  for (const listener of listeners) listener()
}
