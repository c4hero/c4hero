/** Announce a message to screen readers via the live region */
export function announce(message: string) {
  const el = document.getElementById('c4hero-live')
  if (el) {
    el.textContent = ''
    // Force a DOM change so assistive tech picks up the new message
    requestAnimationFrame(() => { el.textContent = message })
  }
}
