import { Fragment, memo, type ReactNode } from 'react'
import { parseBlocks } from './markdownBlocks'
import { C } from './aiTheme'

// Minimal, dependency-free markdown for AI answers. Covers what LLM prose
// actually emits — paragraphs, bullet/numbered lists, headings, `inline code`,
// **bold**, *italic* and ``` fences — and stays tolerant of the half-written
// syntax that streaming produces (unclosed markers render as literal text).
// Parsing is split from rendering so the block grammar is unit-testable.

const CODE_INLINE: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: '0.92em',
  background: 'rgba(110,118,129,0.22)', padding: '1px 4px', borderRadius: 4,
  color: C.text,
}

/** Inline formatting only: `code`, **bold**, *italic* / _italic_. */
export function MdInline({ text }: { text: string }) {
  return <>{renderInline(text)}</>
}

function renderInline(text: string): ReactNode {
  // Code first, so markers inside backticks stay literal.
  const parts = text.split(/(`[^`\n]+`)/g)
  return parts.map((part, i) => {
    if (i % 2 === 1) return <code key={i} style={CODE_INLINE}>{part.slice(1, -1)}</code>
    return <Fragment key={i}>{renderEmphasis(part)}</Fragment>
  })
}

function renderEmphasis(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g)
  return parts.map((p, i) => {
    if (i % 2 === 1) return <strong key={i} style={{ fontWeight: 700, color: C.text }}>{p.slice(2, -2)}</strong>
    const italics = p.split(/(\*(?!\s)[^*\n]+(?<!\s)\*|_(?!\s)[^_\n]+(?<!\s)_)/g)
    return <Fragment key={i}>{italics.map((q, j) => (j % 2 === 1 ? <em key={j}>{q.slice(1, -1)}</em> : q))}</Fragment>
  })
}

function Lines({ lines }: { lines: string[] }) {
  return <>{lines.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{renderInline(l)}</Fragment>)}</>
}

const CARET = <span style={{ animation: 'c4ai-node 1.1s ease-in-out infinite' }}> ▍</span>

/** Rendered markdown. `caret` appends the streaming caret inside the last
 *  block, so it trails the text instead of dropping to its own line. Memoized:
 *  streaming re-renders the whole thread per token, and without this every
 *  settled bubble would fully re-parse its markdown each time. */
export const Md = memo(function Md({ text, caret }: { text: string; caret?: boolean }) {
  const blocks = parseBlocks(text)
  if (!blocks.length) return caret ? CARET : null
  return (
    <>
      {blocks.map((b, i) => {
        const bottom = i === blocks.length - 1 ? 0 : 8
        const tail = i === blocks.length - 1 && caret ? CARET : null
        switch (b.t) {
          case 'h':
            return (
              <div key={i} style={{ margin: `${i === 0 ? 0 : 4}px 0 ${Math.max(bottom, i === blocks.length - 1 ? 0 : 6)}px`, fontSize: b.level <= 2 ? 13.5 : 13, fontWeight: 700, color: C.text }}>
                {renderInline(b.text)}{tail}
              </div>
            )
          case 'ul':
          case 'ol': {
            const Tag = b.t
            return (
              <Tag key={i} style={{ margin: `0 0 ${bottom}px`, paddingLeft: 19, listStyle: b.t === 'ul' ? 'disc' : 'decimal', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}{j === b.items.length - 1 ? tail : null}</li>
                ))}
              </Tag>
            )
          }
          case 'code':
            return (
              <Fragment key={i}>
                <pre data-scroll style={{ margin: `0 0 ${bottom}px`, padding: '9px 11px', borderRadius: 8, background: 'rgba(13,17,23,0.6)', border: `1px solid ${C.border}`, fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 11.5, lineHeight: 1.5, color: C.text2, overflowX: 'auto', whiteSpace: 'pre' }}>
                  {b.lines.join('\n')}
                </pre>
                {tail}
              </Fragment>
            )
          default:
            return (
              <div key={i} style={{ margin: `0 0 ${bottom}px`, wordBreak: 'break-word' }}>
                <Lines lines={b.lines} />{tail}
              </div>
            )
        }
      })}
    </>
  )
})
