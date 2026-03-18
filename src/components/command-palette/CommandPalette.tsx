import { useState, useMemo, useEffect, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useWorkspaceStore } from '@/store/workspace'
import { getCommands, CATEGORY_ORDER, CATEGORY_LABELS, type Command } from '@/lib/commands'
import { Command as CommandIcon } from 'lucide-react'

export default function CommandPalette() {
  const setCommandPaletteOpen = useWorkspaceStore((s) => s.setCommandPaletteOpen)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  let reactFlow: ReturnType<typeof useReactFlow> | null = null
  try {
    reactFlow = useReactFlow()
  } catch {
    // Not inside ReactFlowProvider
  }

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const allCommands = useMemo(() => getCommands(reactFlow), [reactFlow])

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return allCommands.filter((cmd) => {
      if (cmd.when && !cmd.when()) return false
      if (!q) return true
      if (cmd.label.toLowerCase().includes(q)) return true
      if (cmd.keywords?.some((kw) => kw.includes(q))) return true
      return false
    })
  }, [allCommands, query])

  const grouped = useMemo(() => {
    const groups: { category: Command['category']; label: string; commands: Command[] }[] = []
    for (const cat of CATEGORY_ORDER) {
      const cmds = filtered.filter((c) => c.category === cat)
      if (cmds.length > 0) {
        groups.push({ category: cat, label: CATEGORY_LABELS[cat], commands: cmds })
      }
    }
    return groups
  }, [filtered])

  const flatList = useMemo(() => grouped.flatMap((g) => g.commands), [grouped])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    const el = resultsRef.current?.querySelector('[data-selected="true"]')
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  function close() {
    setCommandPaletteOpen(false)
  }

  function executeCommand(cmd: Command) {
    close()
    cmd.execute()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && flatList[selectedIndex]) {
      e.preventDefault()
      executeCommand(flatList[selectedIndex])
    } else if (e.key === 'Escape') {
      close()
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 48, background: 'rgba(11,18,25,0.45)' }}
        onClick={close}
        aria-hidden="true"
      />

      {/* Shade panel — no position:fixed, no top/left/transform; inherits pill column width */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{
          zIndex: 49,
          background: 'rgba(13,17,23,0.97)',
          borderTop: 'none',
          border: '1px solid var(--color-border)',
          borderRadius: '0 0 14px 14px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.65)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          overflow: 'hidden',
          pointerEvents: 'auto',
          animation: 'slideDownFromBar 0.18s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <CommandIcon size={16} style={{ color: 'var(--color-text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--color-text-primary)' }}
          />

        </div>

        {/* Results */}
        <div ref={resultsRef} className="max-h-[340px] overflow-y-auto p-2">
          {flatList.length === 0 && (
            <div
              className="px-3 py-6 text-center text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              No matching commands
            </div>
          )}
          {grouped.map((group) => (
            <div key={group.category}>
              <div
                className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {group.label}
              </div>
              {group.commands.map((cmd) => {
                const idx = flatList.indexOf(cmd)
                const isSelected = idx === selectedIndex
                return (
                  <button
                    key={cmd.id}
                    data-selected={isSelected}
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors"
                    style={{
                      background: isSelected ? 'var(--color-surface-3)' : 'transparent',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    <cmd.icon
                      size={15}
                      style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}
                    />
                    <span className="flex-1 truncate">{cmd.label}</span>
                    {cmd.shortcut && <Shortcut shortcut={cmd.shortcut} />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-4 border-t px-4 py-2"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            <kbd
              className="rounded border px-1 py-0.5"
              style={{ borderColor: 'var(--color-border)' }}
            >
              ↑↓
            </kbd>{' '}
            Navigate
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            <kbd
              className="rounded border px-1 py-0.5"
              style={{ borderColor: 'var(--color-border)' }}
            >
              ↵
            </kbd>{' '}
            Execute
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            <kbd
              className="rounded border px-1 py-0.5"
              style={{ borderColor: 'var(--color-border)' }}
            >
              Esc
            </kbd>{' '}
            Close
          </span>
        </div>
      </div>
    </>
  )
}

function Shortcut({ shortcut }: { shortcut: string }) {
  return (
    <span
      className="ml-auto flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        borderColor: 'var(--color-border)',
        color: 'var(--color-text-muted)',
        background: 'var(--color-surface-2)',
        flexShrink: 0,
      }}
    >
      {shortcut}
    </span>
  )
}
