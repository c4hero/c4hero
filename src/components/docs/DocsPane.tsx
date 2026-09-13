import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowLeft, BookOpen, FilePlus2, Scale } from 'lucide-react'
import type { Workspace } from '@/types/model'
import type { DocConcept, DocsKind } from '@/lib/docs/bundle'
import { selectElementDocs, selectWorkspaceDocs, useDocsStore, type ScopedDocs } from '@/store/docs'
import { getCurrentDirHandle } from '@/lib/folderIO'
import { announce } from '@/lib/announce'
import Markdown from './Markdown'

const BTN: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
  background: 'transparent', color: 'var(--color-text-primary)', fontSize: 'var(--text-xs)', cursor: 'pointer',
}
const PRIMARY: CSSProperties = { ...BTN, background: 'var(--color-accent)', borderColor: 'var(--color-accent)', color: '#fff', fontWeight: 600 }
const INPUT: CSSProperties = {
  display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box', padding: '7px 10px',
  borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
  background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', font: 'inherit',
}

/**
 * The documentation and decisions attached to a scope — the workspace, or
 * one element — read from its `!docs` / `!adrs` bundles. Shared by the
 * inspector's Docs tab and the workspace documentation dialog: a list of
 * concepts, a reader for one, and a form to add a doc or an ADR.
 */
export interface DocsPaneProps {
  workspace: Workspace
  /** Omit for the workspace scope. */
  elementId?: string
}

export default function DocsPane({ workspace, elementId }: DocsPaneProps) {
  const bundles = useDocsStore((s) => s.bundles)
  const loaded = useDocsStore((s) => s.loaded)
  const create = useDocsStore((s) => s.create)
  const scoped: ScopedDocs = useMemo(
    () => (elementId ? selectElementDocs(bundles, workspace, elementId) : selectWorkspaceDocs(bundles, workspace)),
    [bundles, workspace, elementId],
  )
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [creating, setCreating] = useState<DocsKind | null>(null)
  const [busy, setBusy] = useState(false)

  // Selection follows the scope: switching element closes the reader.
  useEffect(() => { setOpenPath(null); setCreating(null) }, [elementId])

  const folderOpen = !!getCurrentDirHandle()
  const all = useMemo(() => [...scoped.docs, ...scoped.adrs], [scoped])
  const open = openPath ? all.find((c) => c.path === openPath) : undefined

  if (!folderOpen) {
    return (
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
        Documentation lives in files next to the workspace. Open this workspace from a folder to read and write it.
      </p>
    )
  }

  if (open) {
    return (
      <DocReader
        concept={open}
        siblings={all}
        onBack={() => setOpenPath(null)}
        onNavigate={(c) => setOpenPath(c.path)}
      />
    )
  }

  async function submit(kind: DocsKind, title: string, description: string) {
    setBusy(true)
    try {
      const path = await create(kind, { elementId }, { title, description: description || undefined })
      if (path) {
        announce(`Created ${path}`)
        setCreating(null)
        setOpenPath(path)
      } else {
        announce('Could not write the file')
      }
    } finally {
      setBusy(false)
    }
  }

  if (creating) {
    return <NewDocForm kind={creating} busy={busy} onCancel={() => setCreating(null)} onSubmit={(t, d) => void submit(creating, t, d)} />
  }

  const empty = all.length === 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {scoped.missing.map(({ kind, dir }) => (
        <p key={kind} role="note" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
          The DSL points <code>!{kind}</code> at <code>{dir}/</code>, which doesn't exist yet. Adding a {kind === 'adrs' ? 'decision' : 'doc'} creates it.
        </p>
      ))}
      {loaded && empty && scoped.missing.length === 0 && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
          {scoped.scope.docs || scoped.scope.adrs
            ? 'No documents in the linked folders yet.'
            : elementId
              ? 'No documentation is attached to this element. Add a doc or a decision record and c4hero links the folder from the DSL with a !docs / !adrs line.'
              : 'No documentation is attached to this workspace. Add a doc or a decision record and c4hero links the folder from the DSL.'}
        </p>
      )}
      <ConceptList heading="Documentation" icon={BookOpen} concepts={scoped.docs} onOpen={(c) => setOpenPath(c.path)} />
      <ConceptList heading="Decisions" icon={Scale} concepts={scoped.adrs} onOpen={(c) => setOpenPath(c.path)} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="hover-subtle" onClick={() => setCreating('docs')} style={BTN}>
          <FilePlus2 size={12} /> New doc
        </button>
        <button type="button" className="hover-subtle" onClick={() => setCreating('adrs')} style={BTN}>
          <Scale size={12} /> New decision
        </button>
      </div>
    </div>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────

function ConceptList({ heading, icon: Icon, concepts, onOpen }: {
  heading: string
  icon: typeof BookOpen
  concepts: DocConcept[]
  onOpen: (c: DocConcept) => void
}) {
  if (concepts.length === 0) return null
  return (
    <section aria-label={heading}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: 6 }}>
        <Icon size={12} /> {heading} <span style={{ fontWeight: 400 }}>({concepts.length})</span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {concepts.map((c) => {
          const superseded = c.supersededBy.length > 0 || /^superseded/i.test(c.status ?? '')
          return (
            <li key={c.path}>
              <button
                type="button"
                onClick={() => onOpen(c)}
                style={{
                  width: '100%', textAlign: 'left', display: 'flex', alignItems: 'baseline', gap: 8,
                  padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid transparent',
                  background: 'transparent', color: 'var(--color-text-primary)', cursor: 'pointer',
                  opacity: superseded ? 0.6 : 1,
                }}
                className="c4-docs-row"
              >
                {c.number !== undefined && <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>{c.number}.</span>}
                <span style={{ flex: 1, fontSize: 'var(--text-sm)', textDecoration: superseded ? 'line-through' : undefined }}>{c.title}</span>
                {c.status && <StatusChip status={c.status} />}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function StatusChip({ status }: { status: string }) {
  const s = status.toLowerCase()
  const color = s.startsWith('accept') ? 'var(--color-status-live)'
    : s.startsWith('propos') ? 'var(--color-status-planned)'
      : s.startsWith('supersed') || s.startsWith('deprecat') || s.startsWith('reject') ? 'var(--color-status-deprecated)'
        : 'var(--color-text-muted)'
  return (
    <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color, whiteSpace: 'nowrap' }}>
      {status}
    </span>
  )
}

function DocReader({ concept, siblings, onBack, onNavigate }: {
  concept: DocConcept
  siblings: DocConcept[]
  onBack: () => void
  onNavigate: (c: DocConcept) => void
}) {
  const byFile = new Map(siblings.map((c) => [c.file.toLowerCase(), c]))
  const resolve = (href: string): DocConcept | undefined => {
    const clean = href.replace(/[?#].*$/, '')
    return byFile.get(clean.slice(clean.lastIndexOf('/') + 1).toLowerCase())
  }
  const links = (label: string, files: string[]) => {
    if (files.length === 0) return null
    return (
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
        {label}{' '}
        {files.map((f, i) => {
          const target = byFile.get(f.toLowerCase())
          return (
            <span key={f}>
              {i > 0 && ', '}
              {target
                ? <button type="button" className="c4-docs-link" onClick={() => onNavigate(target)} style={{ background: 'none', border: 0, padding: 0, color: 'var(--color-accent)', cursor: 'pointer', font: 'inherit' }}>{target.title}</button>
                : <code>{f}</code>}
            </span>
          )
        })}
      </div>
    )
  }
  return (
    <article aria-label={concept.title} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" className="btn-icon !min-h-7 !min-w-7 !p-1" onClick={onBack} aria-label="Back to the list" title="Back">
          <ArrowLeft size={14} />
        </button>
        <code style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{concept.path}</code>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
        <span>{concept.type}</span>
        {concept.status && <StatusChip status={concept.status} />}
        {concept.timestamp && <span>{concept.timestamp.slice(0, 10)}</span>}
        {concept.tags.length > 0 && <span>{concept.tags.join(', ')}</span>}
      </div>
      {links('Supersedes', concept.supersedes)}
      {links('Superseded by', concept.supersededBy)}
      <Markdown
        text={concept.body}
        onRelativeLink={(href) => {
          const target = resolve(href)
          if (!target) return false
          onNavigate(target)
          return true
        }}
      />
    </article>
  )
}

function NewDocForm({ kind, busy, onCancel, onSubmit }: {
  kind: DocsKind
  busy: boolean
  onCancel: () => void
  onSubmit: (title: string, description: string) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const label = kind === 'adrs' ? 'decision' : 'doc'
  return (
    <form
      aria-label={`New ${label}`}
      onSubmit={(e) => { e.preventDefault(); if (title.trim()) onSubmit(title.trim(), description.trim()) }}
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
        Title
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'adrs' ? 'e.g. Use Postgres for orders' : 'e.g. Overview'} style={INPUT} />
      </label>
      <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
        {kind === 'adrs' ? 'Context' : 'Summary'}
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...INPUT, resize: 'vertical' }} />
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="submit" style={{ ...PRIMARY, opacity: busy || !title.trim() ? 0.6 : 1 }} disabled={busy || !title.trim()}>{busy ? 'Writing…' : `Create ${label}`}</button>
        <button type="button" className="hover-subtle" style={BTN} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
        Written as a markdown file with OKF frontmatter{kind === 'adrs' ? ', numbered like adr-tools' : ''}. Edit it in any editor afterwards.
      </p>
    </form>
  )
}
