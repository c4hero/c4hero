// What's-new release notes: a curated, build-time announcement of user-visible
// changes. The pill/dialog UI (components/whatsnew) shows WHATS_NEW when its id
// differs from the one the user last dismissed.
//
// Authoring convention: bump this as part of the PR that ships a user-visible
// feature — new `id` (date-slug), fresh `items`, user-facing language. Leave it
// alone for fixes/chores nobody needs an announcement for. `null` keeps the
// whole feature dormant, which is also the "off switch" for forks that don't
// want release notes: no config, no code changes, just no content.

export interface WhatsNewItem {
  title: string
  body: string
}

export interface WhatsNewRelease {
  /** Stable identifier for this announcement, e.g. "2026-09-02-deployment-views".
   *  A changed id re-arms the pill for everyone; an unchanged id never re-nags. */
  id: string
  /** Human-readable release date, shown in the dialog. */
  date: string
  items: WhatsNewItem[]
  /** Optional "full release notes" link shown in the dialog footer — point it
   *  at the changelog section or announcement post for this release. */
  link?: { label: string; url: string }
}

export const WHATS_NEW: WhatsNewRelease | null = {
  id: '2026-08-deployment-dynamic-views',
  date: 'August 2026',
  items: [
    {
      title: 'Deployment views',
      body: 'Model deployment environments — nodes, infrastructure, and container/system instances — and see them rendered as nested boundaries on the canvas, with relationships drawn automatically between instances.',
    },
    {
      title: 'Dynamic views',
      body: 'Author ordered interaction steps over your model and see them numbered on the diagram, including repeated steps and responses.',
    },
    {
      title: 'Clearer scoped views',
      body: 'The deployment topology editor now shows the view’s scope, flags elements the scope hides, and links straight to the unscoped view.',
    },
  ],
  link: { label: 'Full release notes', url: 'https://github.com/c4hero/c4hero/blob/main/CHANGELOG.md' },
}

/** Build-time opt-in: the what's-new pill only ever shows on builds with
 *  VITE_WHATS_NEW=1 (or true). Default is OFF — self-hosted and fork builds
 *  show nothing even when release entries exist in the source; the hosted app
 *  turns it on via its deploy environment. */
export function whatsNewEnabled(): boolean {
  const v = import.meta.env.VITE_WHATS_NEW
  return v === '1' || v === 'true'
}

const STORAGE_KEY = 'c4hero.whatsNewDismissed'

/** The release the user hasn't seen yet, or null when there's nothing to show.
 *
 *  First-ever launch (no stored value) seeds the current id WITHOUT showing:
 *  to a brand-new user everything is new, so an announcement is noise. When
 *  localStorage is unavailable (private mode, embeds) this fails closed —
 *  better to never show than to nag on every launch. */
export function unseenRelease(release: WhatsNewRelease | null = WHATS_NEW): WhatsNewRelease | null {
  // Disabled builds bail before touching storage — no seeding, no reads, so
  // enabling the flag later still gets the clean first-launch behavior.
  if (!whatsNewEnabled()) return null
  if (!release || release.items.length === 0) return null
  try {
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (dismissed === null) {
      localStorage.setItem(STORAGE_KEY, release.id)
      return null
    }
    return dismissed === release.id ? null : release
  } catch {
    return null
  }
}

/** Mark a release as seen so it never shows again (until a new id ships). */
export function dismissRelease(release: WhatsNewRelease): void {
  try {
    localStorage.setItem(STORAGE_KEY, release.id)
  } catch {
    // No storage — the pill still hides for this session; next launch fails
    // closed in unseenRelease, so the user is never nagged repeatedly.
  }
}
