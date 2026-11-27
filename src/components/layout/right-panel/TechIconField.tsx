import { useMemo, useState } from 'react'
import { ChevronDown, CircleDashed, Search } from 'lucide-react'
import TechIcon from '@/components/shared/TechIcon'
import { useTechIconCatalog } from '@/lib/techIcons/loader'
import {
  TECH_ICON_NONE, TECH_ICON_PROPERTY, TECH_ICON_SLUGS, isTechIconSlug, matchTechIcon, techIconColor, techIconSearchText,
  type TechIconSlug,
} from '@/lib/techIcons/registry'

// The inspector panel is always drawn on the dark chrome surface.
const PANEL_SURFACE = '#1c2128'
const MUTED = 'var(--color-text-secondary)'

/**
 * Picks the technology icon a node shows (TEA-381). Auto follows the
 * technology field; a pinned icon or None is saved as `c4hero.icon`.
 * `onChange(undefined)` returns the element to auto-detect.
 */
export default function TechIconField({ properties, technology, onChange }: {
  properties: Record<string, string>
  technology?: string
  onChange: (icon: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const catalog = useTechIconCatalog(true)
  const pinnedRaw = properties[TECH_ICON_PROPERTY]?.trim().toLowerCase()
  const mode: 'auto' | 'none' | 'pinned' = pinnedRaw === TECH_ICON_NONE ? 'none' : isTechIconSlug(pinnedRaw) ? 'pinned' : 'auto'
  const pinned = mode === 'pinned' ? pinnedRaw as TechIconSlug : undefined
  const detected = matchTechIcon(technology)
  const shown = mode === 'none' ? undefined : pinned ?? detected

  const title = (slug: TechIconSlug) => catalog?.[slug].title ?? slug
  const summary = mode === 'none'
    ? 'None'
    : mode === 'pinned' ? title(pinned!)
      : detected ? `Auto · ${title(detected)}` : 'Auto · no match'

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TECH_ICON_SLUGS
    return TECH_ICON_SLUGS.filter((slug) => `${techIconSearchText(slug)} ${(catalog?.[slug].title ?? '').toLowerCase()}`.includes(q))
  }, [query, catalog])

  const choose = (icon: string | undefined) => {
    onChange(icon)
    setOpen(false)
    setQuery('')
  }

  const preview = (slug: TechIconSlug | undefined, size: number) => {
    const data = slug && catalog?.[slug]
    return data ? <TechIcon icon={data} size={size} color={techIconColor(data.hex, PANEL_SURFACE, MUTED)} /> : null
  }

  const modeButton = (label: string, value: 'auto' | 'none') => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => choose(value === 'none' ? TECH_ICON_NONE : undefined)}
      className="rounded-md border px-2 py-1 text-[11px] font-medium transition-colors"
      style={{
        flex: 1,
        background: mode === value ? 'var(--color-accent-active)' : 'var(--color-surface-2)',
        borderColor: mode === value ? 'var(--color-accent)' : 'var(--color-border)',
        color: mode === value ? 'var(--color-accent)' : 'var(--color-text-muted)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <div data-testid="tech-icon-field">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Icon: ${summary}`}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
        style={{
          background: open ? 'var(--color-surface-3)' : 'var(--color-surface-2)',
          borderColor: open ? 'var(--color-accent)' : 'var(--color-border)',
          color: 'var(--color-text-primary)',
          cursor: 'pointer',
        }}
      >
        <span style={{ width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {preview(shown, 16) ?? <CircleDashed size={14} aria-hidden="true" style={{ color: 'var(--color-text-subtle)' }} />}
        </span>
        <span className="flex-1 truncate text-left" style={{ color: mode === 'pinned' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{summary}</span>
        <ChevronDown size={14} aria-hidden="true" style={{ color: 'var(--color-text-muted)', transform: open ? 'rotate(180deg)' : undefined }} />
      </button>

      {open && (
        <div className="mt-1.5 rounded-lg border p-2" style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)' }}>
          <div className="mb-2 flex gap-1">
            {modeButton(detected ? `Auto (${title(detected)})` : 'Auto', 'auto')}
            {modeButton('None', 'none')}
          </div>
          <div className="mb-2 flex items-center gap-1.5 rounded-md border px-2 transition-colors focus-within:!border-[var(--color-accent)]" style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}>
            <Search size={12} aria-hidden="true" style={{ color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setQuery('') }
                if (e.key === 'Enter' && matches.length > 0) { e.preventDefault(); choose(matches[0]) }
              }}
              placeholder="Search icons"
              aria-label="Search icons"
              className="w-full bg-transparent py-1.5 text-xs"
              // The wrapper's border carries focus, as in AddElementPanel's filter.
              style={{ color: 'var(--color-text-primary)', border: 'none', outline: 'none' }}
            />
          </div>
          {!catalog ? (
            <p className="py-3 text-center text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Loading icons…</p>
          ) : matches.length === 0 ? (
            <p className="py-3 text-center text-[11px]" style={{ color: 'var(--color-text-muted)' }}>No icon for “{query.trim()}”</p>
          ) : (
            <div role="list" aria-label="Icons" className="grid gap-1 overflow-y-auto" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', maxHeight: 176 }}>
              {matches.map((slug) => (
                <button
                  key={slug}
                  type="button"
                  role="listitem"
                  title={catalog[slug].title}
                  aria-label={catalog[slug].title}
                  aria-pressed={pinned === slug}
                  onClick={() => choose(slug)}
                  className="flex items-center justify-center rounded-md border transition-colors"
                  style={{
                    height: 32,
                    background: pinned === slug ? 'var(--color-accent-active)' : 'var(--color-surface-2)',
                    borderColor: pinned === slug ? 'var(--color-accent)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  {preview(slug, 16)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
