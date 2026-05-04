import { useState, useMemo, useEffect, useRef } from 'react'
import { useWorkspaceStore, buildElementMap, getAllViews } from '@/store/workspace'
import type { ModelElement, View, Container, Component } from '@/types/model'
import { Search, X, LayoutGrid } from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import { TYPE_ICONS, TYPE_COLORS } from '@/lib/elementMeta'

const TYPE_FILTERS = [
  { type: 'person', label: 'Person' },
  { type: 'softwareSystem', label: 'System' },
  { type: 'container', label: 'Container' },
  { type: 'component', label: 'Component' },
] as const

type SearchResult =
  | { kind: 'element'; element: ModelElement }
  | { kind: 'view'; view: View }

export default function SearchDialog() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const setSearchOpen = useWorkspaceStore((s) => s.setSearchOpen)
  const selectElements = useWorkspaceStore((s) => s.selectElements)
  const setActiveView = useWorkspaceStore((s) => s.setActiveView)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const elementMap = useMemo(() => workspace ? buildElementMap(workspace) : new Map(), [workspace])

  // Collect all unique custom tags
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const [, el] of elementMap) {
      for (const tag of el.tags) {
        if (!['Person', 'Software System', 'Container', 'Component', 'Element', 'Relationship'].includes(tag)) {
          tags.add(tag)
        }
      }
    }
    return Array.from(tags).sort()
  }, [elementMap])

  const results = useMemo<SearchResult[]>(() => {
    if (!workspace) return []
    const q = query.toLowerCase().trim()
    const out: SearchResult[] = []

    // Search elements
    for (const [, element] of elementMap) {
      // Type filter
      if (typeFilter && element.type !== typeFilter) continue
      // Tag filter
      if (tagFilter && !element.tags.includes(tagFilter)) continue

      const tech = (element as Container | Component).technology
      if (q) {
        if (
          !element.name.toLowerCase().includes(q) &&
          !element.description?.toLowerCase().includes(q) &&
          !element.type.toLowerCase().includes(q) &&
          !(tech?.toLowerCase().includes(q))
        ) continue
      }

      out.push({ kind: 'element', element })
    }

    // Search views (only if no type/tag filter)
    if (!typeFilter && !tagFilter) {
      for (const view of getAllViews(workspace)) {
        const title = view.title ?? view.key
        if (!q || title.toLowerCase().includes(q) || view.type.toLowerCase().includes(q)) {
          out.push({ kind: 'view', view })
        }
      }
    }

    return out.slice(0, 20)
  }, [workspace, elementMap, query, typeFilter, tagFilter])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSelectedIndex(0) }, [query, typeFilter, tagFilter])

  function handleSelect(result: SearchResult) {
    if (result.kind === 'element') {
      selectElements([result.element.id])
    } else {
      setActiveView(result.view.key)
    }
    setSearchOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => results.length === 0 ? 0 : Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => results.length === 0 ? 0 : Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault()
      handleSelect(results[selectedIndex])
    } else if (e.key === 'Escape') {
      setSearchOpen(false)
    }
  }

  const toggleTypeFilter = (type: string) => {
    setTypeFilter(prev => prev === type ? null : type)
  }

  const toggleTagFilter = (tag: string) => {
    setTagFilter(prev => prev === tag ? null : tag)
  }

  const resultsListId = 'search-results-list'

  return (
    <DialogShell
      onClose={() => setSearchOpen(false)}
      ariaLabel="Search"
      className="w-full max-w-lg rounded-xl border shadow-2xl"
      style={{
        background: 'var(--color-surface-1)',
        borderColor: 'var(--color-border)',
      }}
    >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
          <Search size={16} style={{ color: 'var(--color-text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search elements, views, technology..."
            aria-label="Search elements and views"
            aria-controls={resultsListId}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--color-text-primary)' }}
          />
          <button
            onClick={() => setSearchOpen(false)}
            className="btn-icon !min-h-6 !min-w-6 !p-1"
            aria-label="Close search"
          >
            <X size={14} />
          </button>
        </div>

        {/* Type filter pills */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
          {TYPE_FILTERS.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => toggleTypeFilter(type)}
              aria-pressed={typeFilter === type}
              className="rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-all"
              style={{
                background: typeFilter === type ? TYPE_COLORS[type] : 'var(--color-surface-3)',
                color: typeFilter === type ? '#fff' : 'var(--color-text-muted)',
                border: `1px solid ${typeFilter === type ? TYPE_COLORS[type] : 'var(--color-border)'}`,
              }}
            >
              {label}
            </button>
          ))}
          {allTags.length > 0 && (
            <>
              <span className="text-[10px]" style={{ color: 'var(--color-border)' }}>|</span>
              {allTags.slice(0, 4).map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTagFilter(tag)}
                  aria-pressed={tagFilter === tag}
                  className="rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-all"
                  style={{
                    background: tagFilter === tag ? 'var(--color-accent)' : 'var(--color-surface-3)',
                    color: tagFilter === tag ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
                    border: `1px solid ${tagFilter === tag ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  }}
                >
                  {tag}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Results */}
        <div id={resultsListId} className="max-h-[300px] overflow-y-auto p-2">
          {results.length === 0 && (
            <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {query.trim() || typeFilter || tagFilter ? 'No results found' : 'Type to search across all elements and views'}
            </div>
          )}
          {results.map((result, i) => (
            <button
              id={`search-result-${i}`}
              key={result.kind === 'element' ? result.element.id : result.view.key}
              type="button"
              aria-current={i === selectedIndex ? 'true' : undefined}
              onClick={() => handleSelect(result)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors"
              style={{
                background: i === selectedIndex ? 'var(--color-surface-3)' : 'transparent',
                color: 'var(--color-text-primary)',
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              {result.kind === 'element' ? (
                <>
                  <span style={{ color: TYPE_COLORS[result.element.type] }}>
                    {TYPE_ICONS[result.element.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{result.element.name}</div>
                    {result.element.description && (
                      <div className="truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {result.element.description}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] uppercase" style={{ color: TYPE_COLORS[result.element.type] }}>
                    {result.element.type === 'softwareSystem' ? 'System' : result.element.type}
                  </span>
                </>
              ) : (
                <>
                  <span style={{ color: 'var(--color-accent)' }}>
                    <LayoutGrid size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{result.view.title ?? result.view.key}</div>
                    {result.view.description && (
                      <div className="truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {result.view.description}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>
                    view
                  </span>
                </>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-4 border-t px-4 py-2"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            <kbd className="rounded border px-1 py-0.5" style={{ borderColor: 'var(--color-border)' }}>↑↓</kbd> Navigate
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            <kbd className="rounded border px-1 py-0.5" style={{ borderColor: 'var(--color-border)' }}>↵</kbd> Select
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            <kbd className="rounded border px-1 py-0.5" style={{ borderColor: 'var(--color-border)' }}>Esc</kbd> Close
          </span>
        </div>
    </DialogShell>
  )
}
