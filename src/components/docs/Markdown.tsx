import { Fragment, useMemo, type ReactNode } from 'react'
import { normalizeSafeExternalUrl } from '@/lib/safeUrl'
import { parseBlocks, type Block } from '@/lib/docs/markdown'

/**
 * A small markdown renderer for documentation and ADRs. Hand-rolled, like the
 * DSL parser: the docs c4hero reads are prose with headings, lists, links,
 * code and the odd table, and a full CommonMark engine would be the largest
 * dependency in the app for a feature most sessions never open. Output is
 * React elements — never HTML strings — so nothing in a file can inject
 * markup, and external links go through the same URL guard as element URLs.
 *
 * Supported: ATX headings, paragraphs, `-`/`*`/`+` and numbered lists (nested
 * by indentation), fenced and indented code, blockquotes, thematic breaks,
 * pipe tables, and inline code / bold / italic / links / images (as alt text).
 */

export interface MarkdownProps {
  text: string
  /** Called for a link whose target is a relative path (another file in the
   *  bundle). Return true when handled; otherwise it renders as plain text. */
  onRelativeLink?: (href: string) => boolean
}

export default function Markdown({ text, onRelativeLink }: MarkdownProps) {
  const blocks = useMemo(() => parseBlocks(text.split(/\r?\n/)), [text])
  return <div className="c4-md">{blocks.map((b, i) => <Fragment key={i}>{renderBlock(b, onRelativeLink)}</Fragment>)}</div>
}

function renderBlock(block: Block, onRelativeLink?: MarkdownProps['onRelativeLink']): ReactNode {
  switch (block.kind) {
    case 'heading': {
      const Tag = `h${Math.min(block.level, 6)}` as 'h1'
      return <Tag>{renderInline(block.text, onRelativeLink)}</Tag>
    }
    case 'paragraph':
      return <p>{renderInline(block.text, onRelativeLink)}</p>
    case 'code':
      return <pre><code data-lang={block.lang}>{block.text}</code></pre>
    case 'quote':
      return <blockquote>{block.blocks.map((b, i) => <Fragment key={i}>{renderBlock(b, onRelativeLink)}</Fragment>)}</blockquote>
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag>
          {block.items.map((item, i) => (
            <li key={i}>
              {item.map((b, j) => b.kind === 'paragraph'
                ? <Fragment key={j}>{renderInline(b.text, onRelativeLink)}</Fragment>
                : <Fragment key={j}>{renderBlock(b, onRelativeLink)}</Fragment>)}
            </li>
          ))}
        </Tag>
      )
    }
    case 'table':
      return (
        <div className="c4-md-table">
          <table>
            <thead><tr>{block.header.map((h, i) => <th key={i}>{renderInline(h, onRelativeLink)}</th>)}</tr></thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>{block.header.map((_, j) => <td key={j}>{renderInline(row[j] ?? '', onRelativeLink)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'hr':
      return <hr />
  }
}

// ─── Inline ──────────────────────────────────────────────────────────

// Underscore emphasis only at word boundaries, as in CommonMark: prose about
// `snake_case_names` or `my__var__name` must not sprout <em>s mid-word.
const INLINE = /(`+)([\s\S]*?[^`])\1(?!`)|!\[([^\]]*)\]\(([^)]*)\)|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*([^*]+)\*\*|(?<![A-Za-z0-9_])__([^_]+)__(?![A-Za-z0-9_])|\*([^*\s][^*]*?)\*|(?<![A-Za-z0-9_])_([^_\s][^_]*?)_(?![A-Za-z0-9_])|<(https?:\/\/[^>\s]+)>/g

function renderInline(text: string, onRelativeLink?: MarkdownProps['onRelativeLink']): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    last = m.index! + m[0].length
    if (m[2] !== undefined) out.push(<code key={key++}>{m[2].trim()}</code>)
    else if (m[3] !== undefined) out.push(<em key={key++}>{m[3] || 'image'}</em>)
    else if (m[5] !== undefined) out.push(<Fragment key={key++}>{renderLink(m[5], m[6], onRelativeLink)}</Fragment>)
    else if (m[7] !== undefined) out.push(<strong key={key++}>{renderInline(m[7], onRelativeLink)}</strong>)
    else if (m[8] !== undefined) out.push(<strong key={key++}>{renderInline(m[8], onRelativeLink)}</strong>)
    else if (m[9] !== undefined) out.push(<em key={key++}>{renderInline(m[9], onRelativeLink)}</em>)
    else if (m[10] !== undefined) out.push(<em key={key++}>{renderInline(m[10], onRelativeLink)}</em>)
    else if (m[11] !== undefined) out.push(<Fragment key={key++}>{renderLink(m[11], m[11], onRelativeLink)}</Fragment>)
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function renderLink(label: string, href: string, onRelativeLink?: MarkdownProps['onRelativeLink']): ReactNode {
  const external = normalizeSafeExternalUrl(href)
  if (external) {
    return <a href={external} target="_blank" rel="noopener noreferrer">{renderInline(label)}</a>
  }
  // Relative link into the bundle: let the host navigate. The browser never
  // follows it — an unhandled target would leave the app for a bogus route.
  if (!/^[a-z]+:/i.test(href) && onRelativeLink) {
    return (
      <a
        href={href}
        onClick={(e) => { e.preventDefault(); onRelativeLink(href) }}
      >
        {renderInline(label)}
      </a>
    )
  }
  return renderInline(label)
}
