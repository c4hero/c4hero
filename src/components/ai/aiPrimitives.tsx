import type { ReactNode } from 'react'
import { Loader2, Sparkles, AlertCircle, RotateCw, CheckCircle2, Undo2 } from 'lucide-react'
import type { Workspace } from '@/types/model'
import { C, blurb, liStyle } from './aiTheme'
import { plural, type AppliedInfo } from './aiHelpers'
import { MicButton } from './dictation'

// Shared presentational primitives used across every feature body — the panel's
// small design-system: text field, run button, error/notice lines, the
// post-apply summary card, and the Card/Actions/PlanList/Empty layout atoms.

export function Field({ value, onChange, placeholder, rows, grow, onSubmit }: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number; grow?: boolean; onSubmit?: () => void }) {
  return (
    <div style={{ position: 'relative', display: 'flex', ...(grow ? { flex: 1, minHeight: 130 } : {}) }}>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={grow ? undefined : (rows ?? 3)}
        onKeyDown={(e) => { if (onSubmit && (e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSubmit() } }}
        style={{ width: '100%', resize: grow ? 'none' : 'vertical', height: grow ? '100%' : undefined, minHeight: grow ? undefined : 60, padding: '11px 42px 11px 13px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit' }} />
      <MicButton value={value} onChange={onChange} style={{ position: 'absolute', top: 8, right: 8, color: C.muted2 }} />
    </div>
  )
}

export function RunButton({ label, loading, disabled, onClick }: { label: string; loading: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button className="c4ai-pri" onClick={onClick} disabled={loading || disabled}
      style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start', height: 36, padding: '0 16px', borderRadius: 10, border: 'none', background: C.accent, color: C.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (loading || disabled) ? 0.55 : 1 }}>
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
      {loading ? 'Thinking…' : label}
    </button>
  )
}

export function ErrorLine({ error, onRetry }: { error: string | null; onRetry?: () => void }) {
  if (!error) return null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 10, fontSize: 12, color: C.dangerText }}>
      <AlertCircle size={13} style={{ flex: 'none', marginTop: 1 }} />
      <span style={{ flex: 1, minWidth: 0 }}>{error}</span>
      {onRetry && (
        <button onClick={onRetry} className="c4ai-ghost"
          style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: C.accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '0 2px' }}>
          <RotateCw size={12} /> Retry
        </button>
      )}
    </div>
  )
}

/** Warning-toned sibling of ErrorLine, for partial results (skipped operations). */
export function Notice({ text }: { text: string | null }) {
  if (!text) return null
  return <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 10, fontSize: 12, color: C.warnText }}><AlertCircle size={13} style={{ flex: 'none', marginTop: 1 }} /> {text}</div>
}

/** Post-apply summary card: what landed, what was skipped and why, and a
 *  one-shot Undo offered only while nothing else has touched the model since. */
export function AppliedSummary({ info, liveWs, onUndo }: {
  info: AppliedInfo; liveWs: Workspace | null; onUndo: () => void
}) {
  const canUndo = info.undoTarget !== null && info.undoTarget === liveWs
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <CheckCircle2 size={16} color={C.green} style={{ flex: 'none' }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: C.text }}>{plural(info.appliedCount, 'change', 'changes')} applied</span>
        {canUndo && (
          <button onClick={onUndo} className="c4ai-ghost"
            style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, height: 26, padding: '0 9px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Undo2 size={13} /> Undo
          </button>
        )}
      </div>
      <Notice text={info.skipText} />
    </Card>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 16, padding: 16, borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, animation: 'c4ai-fade .25s ease' }}>{children}</div>
}
export function Actions({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 15, display: 'flex', gap: 8 }}>{children}</div>
}
export function PlanList({ lines }: { lines: string[] }) {
  if (lines.length === 0) return <div style={{ ...blurb, margin: '8px 0 0' }}>No changes proposed.</div>
  return <ul style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>{lines.map((l, i) => <li key={i} style={liStyle}>{l}</li>)}</ul>
}
export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ ...blurb, padding: '8px 0' }}>{children}</div>
}
