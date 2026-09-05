// What's-new release notes: a curated, build-time announcement of user-visible
// changes. The pill/dialog UI (components/whatsnew) shows WHATS_NEW when its id
// differs from the one the user last dismissed.
//
// Authoring convention: bump this once per release, in the release PR — new
// `id` (date-slug), fresh `items`, user-facing language — curated across
// everything that shipped rather than accreted one bullet per feature PR.
// Per-PR changelog entries in CHANGELOG.md are what feed it. Leave it alone for
// fixes/chores nobody needs an announcement for. `null` keeps the whole feature
// dormant, which is also the "off switch" for forks that don't want release
// notes: no config, no code changes, just no content.

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
  id: '2026-09-code-pane-impact-export',
  date: 'September 2026',
  items: [
    {
      title: 'Live DSL code pane',
      body: 'Open the workspace as Structurizr DSL beside the canvas and edit either one — changes flow both ways. Your layout survives the round trip, and a document that does not parse simply never applies.',
    },
    {
      title: 'See what breaks before you delete',
      body: 'Ask what happens if an element is removed and get the exact blast radius: what goes with it, which relationships lose an end, what depended on it, and which views disappear. Counted from your model, not estimated.',
    },
    {
      title: 'Export one interactive HTML file',
      body: 'Every view, rendered and wrapped in a small read-only viewer with tabs, zoom, drill-through and search. No dependencies and no network calls, so it opens from disk or a wiki years later.',
    },
    {
      title: 'Readable element IDs',
      body: 'Elements now take a readable id derived from their name instead of a random string, and you can edit it. Exported DSL reads like something a person wrote.',
    },
  ],
  link: { label: 'Full release notes', url: 'https://c4hero.com/changelog' },
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

/** Every app storage key starts with "c4hero" (c4hero_crash_recovery,
 *  c4hero_recent_files, c4hero.viewport.*, …), so any such key that isn't ours
 *  proves the browser used the app before this feature existed. Without this
 *  check, existing users are indistinguishable from brand-new ones and the
 *  FIRST announcement after the feature ships would reach nobody. */
function hasPriorAppState(): boolean {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key !== STORAGE_KEY && key.startsWith('c4hero')) return true
  }
  return false
}

/** The release the user hasn't seen yet, or null when there's nothing to show.
 *
 *  No stored value + no other app state = a brand-new user: seed the current
 *  id WITHOUT showing (everything is new to them, an announcement is noise).
 *  No stored value + existing app state = a returning user from before the
 *  feature shipped: show the release. When localStorage is unavailable
 *  (private mode, embeds) this fails closed — better to never show than to
 *  nag on every launch. */
export function unseenRelease(release: WhatsNewRelease | null = WHATS_NEW): WhatsNewRelease | null {
  // Disabled builds bail before touching storage — no seeding, no reads, so
  // enabling the flag later still gets the clean first-launch behavior.
  if (!whatsNewEnabled()) return null
  if (!release || release.items.length === 0) return null
  try {
    const dismissed = localStorage.getItem(STORAGE_KEY)
    if (dismissed === null) {
      if (hasPriorAppState()) return release
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
