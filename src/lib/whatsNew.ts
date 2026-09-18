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
  id: '2026-09-docs-and-interop',
  date: 'September 2026',
  items: [
    {
      title: 'Documentation and decision records live in the model',
      body: 'c4hero now reads and writes the !docs and !adrs folders a Structurizr workspace points at. The inspector gains a Docs tab, elements with documentation get a badge on the canvas, and New doc / New decision write adr-tools-style markdown that other tools can read.',
    },
    {
      title: 'The AI assistant reads them too',
      body: 'Deep review, chat, the interview and the ADR drafter all see your docs and decisions. A model that no longer honours an accepted decision is a high-severity finding, and the interviewer stops asking what you have already written down. Still BYOK, still local.',
    },
    {
      title: 'Import from C4-PlantUML and Mermaid',
      body: 'Bring an existing diagram in from the two most common C4-as-code formats instead of retyping it. Multi-file workspaces work too: open a folder and !include is resolved across files, and saving no longer strips the directives.',
    },
    {
      title: 'Find out before the file leaves your machine',
      body: 'The code pane now says when saving will change one of your values, and when a model would be rejected by other Structurizr tools — a name that encodes to nothing, two views sharing a key, a tag that will be split in half. Warnings only: nothing is blocked or rewritten.',
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
