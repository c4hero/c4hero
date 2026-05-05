/** Announce a message to screen readers via the live region */
export function announce(message: string) {
  if (typeof document === 'undefined') return
  const el = document.getElementById('c4hero-live')
  if (el) {
    el.textContent = ''
    // Force a DOM change so assistive tech picks up the new message
    const schedule = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: FrameRequestCallback) => globalThis.setTimeout(() => cb(globalThis.performance?.now() ?? Date.now()), 0)
    schedule(() => { el.textContent = message })
  }
}
