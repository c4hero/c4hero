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

export const WHATS_NEW: WhatsNewRelease | null = null

const STORAGE_KEY = 'c4hero.whatsNewDismissed'

/** The release the user hasn't seen yet, or null when there's nothing to show.
 *
 *  First-ever launch (no stored value) seeds the current id WITHOUT showing:
 *  to a brand-new user everything is new, so an announcement is noise. When
 *  localStorage is unavailable (private mode, embeds) this fails closed —
 *  better to never show than to nag on every launch. */
export function unseenRelease(release: WhatsNewRelease | null = WHATS_NEW): WhatsNewRelease | null {
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
