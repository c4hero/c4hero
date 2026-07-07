import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, Box, Check, CheckCircle2, ChevronDown, Layers, Link2, Loader2,
  Stethoscope, TriangleAlert, Type, Unlink, Wand2, X, type LucideIcon,
} from 'lucide-react'
import { flattenElements, elementNameMap, findingOptions, type MissingGap, type ReviewFixOption } from '@/lib/ai'
import type { Workspace } from '@/types/model'
import { C } from './aiTheme'
import { plural } from './aiHelpers'
import { ErrorLine, Notice } from './aiPrimitives'
import { KIND, SEV, type FindingItem } from './sweepModel'
import { MdInline } from './markdown'

// ─── The Review tab: the completeness worklist ("the janitor") ───────
//
// A completeness ring up top, then a flat divider list — Quick wins (missing
// descriptions / technologies / untyped relationships, each with an AI-drafted
// value ready to apply) over Findings (advisory issues from the deep review).
// Single-open accordion; the open row is a full-bleed tint with a left accent
// bar, not a nested card. All state lives in AiPanel (the controller) so the
// worklist survives tab switches and close→reopen.

const EYEBROW: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: C.muted,
}

const ROW_HEADER: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
  border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
}

const APPLY_PILL: React.CSSProperties = {
  height: 32, padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: 7,
  borderRadius: 8, border: 'none', background: C.accent, color: C.ink,
  fontSize: 12, fontWeight: 700, cursor: 'pointer',
}

const TEXT_LINK: React.CSSProperties = {
  border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
}

function rowShell(open: boolean): React.CSSProperties {
  return {
    borderTop: '1px solid rgba(88,166,255,0.08)',
    background: open ? 'rgba(88,166,255,0.06)' : 'transparent',
    boxShadow: open ? `inset 2px 0 0 0 ${C.accent}` : 'none',
  }
}

export function ReviewBody({
  workspace, scopeIds,
  scope, onToggleScope,
  counts, thingsCount,
  gaps, drafts, draftsLoading,
  findings, reviewRan, reviewLoading, reviewError, onRunReview, onStopReview,
  openId, onToggleRow,
  onApplyGap, onApplyFinding, onSkip,
  applyAllCount, onApplyAll,
  appliedCount, canUndoLast, undoStale, onUndoLast,
  skipNotice, error,
}: {
  workspace: Workspace
  /** The active view's ids when scope is 'view' — grounds the scan checklist. */
  scopeIds?: ReadonlySet<string>
  scope: 'view' | 'model'
  onToggleScope: () => void
  counts: { filled: number; total: number; pct: number }
  thingsCount: number
  /** Active quick wins — in scope, not applied, not skipped. */
  gaps: MissingGap[]
  drafts: Record<string, string>
  draftsLoading: boolean
  /** Active findings for the current scope. */
  findings: FindingItem[]
  reviewRan: boolean
  reviewLoading: boolean
  reviewError: string | null
  onRunReview: () => void
  onStopReview: () => void
  openId: string | null
  onToggleRow: (key: string) => void
  onApplyGap: (gap: MissingGap) => void
  onApplyFinding: (item: FindingItem, opt: ReviewFixOption | null) => void
  onSkip: (key: string) => void
  applyAllCount: number
  onApplyAll: () => void
  appliedCount: number
  canUndoLast: boolean
  /** The model has changed outside the review since the last apply, so the
   *  replay-from-baseline undo would clobber that work — offer a hint, not the button. */
  undoStale: boolean
  onUndoLast: () => void
  skipNotice: string | null
  error: string | null
}) {
  const allClear = thingsCount === 0 && !reviewLoading
  const ringCirc = 2 * Math.PI * 23
  // Name the count by what's actually pending — "3 quick wins to fix" reads
  // better than a generic "3 things to improve" when that's all there is. And
  // an empty list only means "nothing" once the deep review has also run;
  // before that it's just "no quick wins".
  const headline = thingsCount === 0 ? (reviewRan ? 'Nothing to improve' : 'No quick wins left')
    : findings.length === 0 ? `${thingsCount} quick ${thingsCount === 1 ? 'win' : 'wins'} to fix`
    : gaps.length === 0 ? `${thingsCount} ${thingsCount === 1 ? 'finding' : 'findings'} to review`
    : `${thingsCount} things to improve`

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* completeness header */}
      <div style={{ flex: 'none', padding: '15px 16px 2px', display: 'flex', alignItems: 'center', gap: 13 }}>
        <span style={{ position: 'relative', width: 56, height: 56, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 56 56" width="56" height="56" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden="true">
            <circle cx="28" cy="28" r="23" fill="none" stroke="rgba(88,166,255,0.14)" strokeWidth="5" />
            <circle cx="28" cy="28" r="23" fill="none" stroke={C.accent} strokeWidth="5" strokeLinecap="round"
              strokeDasharray={ringCirc} strokeDashoffset={ringCirc * (1 - counts.pct / 100)}
              style={{ transition: 'stroke-dashoffset .5s cubic-bezier(0.16,1,0.3,1)' }} />
          </svg>
          {/* 3-digit values ("100%") need a smaller face to sit inside the ring */}
          <span style={{ fontSize: counts.pct >= 100 ? 12 : 14, fontWeight: 800, letterSpacing: '-0.02em', color: C.text }}>{counts.pct}%</span>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: C.text }}>{headline}</span>
          <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: C.muted2 }}>{counts.filled} of {counts.total} fields complete</span>
        </span>
      </div>

      <div data-scroll style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {/* quick wins */}
        {gaps.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '13px 16px 8px' }}>
              <Wand2 size={12} color={C.accent} style={{ flex: 'none' }} />
              <span style={EYEBROW}>Quick wins</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.accent }}>{gaps.length}</span>
              <span style={{ flex: 1 }} />
              <ScopeToggle scope={scope} onToggle={onToggleScope} />
            </div>
            {gaps.map((gap) => (
              <QuickWinRow key={gap.key} gap={gap} draft={(drafts[gap.key] ?? '').trim()} draftsLoading={draftsLoading}
                open={openId === gap.key} onToggle={() => onToggleRow(gap.key)}
                onApply={() => onApplyGap(gap)} onSkip={() => onSkip(gap.key)} />
            ))}
          </>
        )}

        {/* findings — the section (and its header) disappears entirely when all
            clear; the caught-up block below owns the scope toggle and the
            deep-review CTA then. */}
        {!allClear && (findings.length > 0 || reviewLoading || !reviewRan || gaps.length === 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: gaps.length ? '16px 16px 8px' : '13px 16px 8px' }}>
            <TriangleAlert size={12} color="#fdba74" style={{ flex: 'none' }} />
            <span style={EYEBROW}>Findings</span>
            {findings.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: C.muted }}>{findings.length}</span>}
            <span style={{ flex: 1 }} />
            {gaps.length === 0 && <ScopeToggle scope={scope} onToggle={onToggleScope} />}
          </div>
        )}
        {findings.map((it) => (
          <FindingRow key={it.key} item={it} open={openId === it.key} onToggle={() => onToggleRow(it.key)}
            onApply={(opt) => onApplyFinding(it, opt)} onSkip={() => onSkip(it.key)} />
        ))}
        {reviewLoading ? (
          <ReviewScanning workspace={workspace} scopeIds={scopeIds}
            scopeLabel={scope === 'view' ? 'this view' : 'the whole model'}
            foundCount={findings.length} onStop={onStopReview} />
        ) : !reviewRan && !allClear ? (
          <div style={{ padding: '2px 16px 6px' }}>
            <DeepReviewCard onClick={onRunReview} />
          </div>
        ) : reviewRan && findings.length === 0 && !allClear ? (
          <div style={{ padding: '9px 16px 4px', borderTop: '1px solid rgba(88,166,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 12, color: C.muted2 }}>No findings in this scope.</span>
            <button onClick={onRunReview} className="c4ai-link" style={{ ...TEXT_LINK, color: C.accent }}>Re-run</button>
          </div>
        ) : null}
        {reviewError && !reviewLoading && (
          <div style={{ padding: '0 16px' }}>
            <ErrorLine error={`Deep review didn’t finish — ${reviewError}`} onRetry={onRunReview} />
          </div>
        )}

        {/* all caught up — owns the scope toggle and the deep-review CTA, so
            nothing else on the tab repeats them. */}
        {allClear && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 9, padding: '30px 16px 10px' }}>
            <span style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={22} color={C.green} />
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{reviewRan ? 'All caught up' : 'Quick wins done'}</span>
            <span style={{ fontSize: 12, color: C.muted2, maxWidth: 230, lineHeight: 1.5 }}>
              {!reviewRan
                ? 'Every instant fix is applied. A deep review may still surface orphans, naming or boundary issues.'
                : scope === 'view'
                  ? 'Nothing left in this view — switch scope to check the whole model.'
                  : 'Nothing left across the whole model. Ask the assistant anything.'}
            </span>
            <div style={{ marginTop: 3 }}>
              <ScopeToggle scope={scope} onToggle={onToggleScope} />
            </div>
            {!reviewRan && (
              <div style={{ width: '100%', marginTop: 14, textAlign: 'left' }}>
                <DeepReviewCard onClick={onRunReview} />
              </div>
            )}
          </div>
        )}
        <div style={{ height: 6 }} />
      </div>

      {/* footer */}
      {(applyAllCount > 0 || canUndoLast || skipNotice || error) && (
        <div style={{ flex: 'none', padding: '11px 16px 9px', borderTop: '1px solid rgba(88,166,255,0.1)', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {applyAllCount > 0 && (
            <button onClick={onApplyAll} className="c4ai-pri"
              style={{ height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 11, border: 'none', background: C.accent, color: C.ink, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 22px rgba(79,151,240,0.22)' }}>
              <Check size={15} /> Apply all {applyAllCount} quick wins
            </button>
          )}
          {canUndoLast && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 10, border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.06)', fontSize: 11.5, color: C.text2 }}>
              <CheckCircle2 size={13} color={C.green} style={{ flex: 'none' }} />
              <span style={{ flex: 1 }}>{plural(appliedCount, 'change', 'changes')} applied this session</span>
              {undoStale
                ? <span title="The diagram changed since — undo from the canvas (⌘Z) instead" style={{ color: C.muted3, fontSize: 11 }}>edited since</span>
                : <button onClick={onUndoLast} className="c4ai-link" style={{ ...TEXT_LINK, color: C.accent }}>Undo last</button>}
            </div>
          )}
          <Notice text={skipNotice} />
          <ErrorLine error={error} />
        </div>
      )}
    </div>
  )
}

// While the deep review runs (findings stream in above this block), walk a live
// checklist of the model's *real* elements, relationships and the quality
// aspects being audited — each ticks green as the "beam" passes it, then settles
// on "Synthesizing…". Grounds the wait in what's actually being looked at.
// `scopeIds` (when given) limits the checklist to the in-view targets so the
// animation matches the scoped review — not a misleading whole-model sweep.
function ReviewScanning({ workspace, scopeIds, scopeLabel, foundCount, onStop }: {
  workspace: Workspace
  scopeIds?: ReadonlySet<string>
  scopeLabel: string
  foundCount: number
  onStop: () => void
}) {
  const items = useMemo(() => {
    const out: { label: string; icon: LucideIcon }[] = []
    const els = flattenElements(workspace).filter((e) => !scopeIds || scopeIds.has(e.id))
    for (const e of els) out.push({ label: e.name?.trim() || '(unnamed element)', icon: Box })
    const names = elementNameMap(workspace)
    const rels = (workspace.model.relationships ?? []).filter((r) => !scopeIds || scopeIds.has(r.id))
    for (const r of rels.slice(0, 6)) {
      out.push({ label: `${names.get(r.sourceId) ?? '?'} → ${names.get(r.destinationId) ?? '?'}`, icon: Link2 })
    }
    out.push(
      { label: 'Orphaned elements', icon: Unlink },
      { label: 'Naming consistency', icon: Type },
      { label: 'Boundaries & scope', icon: Layers },
    )
    return out
  }, [workspace, scopeIds])

  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i < items.length ? i + 1 : i)), 520)
    return () => clearInterval(t)
  }, [items.length])

  const total = items.length
  const done = idx >= total
  const progress = total ? Math.min(idx, total) / total : 1
  const ROW = 30, VISIBLE = 4, RING = 34
  const circ = 2 * Math.PI * RING
  const offset = -(idx - 1) * ROW // glide so the current item stays near-centred

  return (
    <div style={{ borderTop: '1px solid rgba(88,166,255,0.08)', padding: '14px 16px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      {/* progress ring + sonar pulse around the deep-review (stethoscope) motif */}
      <div style={{ position: 'relative', width: 86, height: 86, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ position: 'absolute', width: 64, height: 64, borderRadius: '50%', border: '1px solid rgba(88,166,255,0.4)', animation: 'c4ai-ringpulse 2.4s ease-out infinite' }} />
        <span style={{ position: 'absolute', width: 64, height: 64, borderRadius: '50%', border: '1px solid rgba(88,166,255,0.4)', animation: 'c4ai-ringpulse 2.4s ease-out infinite 1.2s' }} />
        <svg viewBox="0 0 86 86" width="86" height="86" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden="true">
          <circle cx="43" cy="43" r={RING} fill="none" stroke="rgba(88,166,255,0.12)" strokeWidth="3.5" />
          <circle cx="43" cy="43" r={RING} fill="none" stroke={C.accent} strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)}
            style={{ transition: 'stroke-dashoffset .55s cubic-bezier(0.16,1,0.3,1)', filter: 'drop-shadow(0 0 5px rgba(88,166,255,0.5))' }} />
        </svg>
        <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(88,166,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent, animation: 'c4ai-float 4s ease-in-out infinite' }}>
          <Stethoscope size={17} />
        </span>
      </div>
      <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: C.text }}>
        {done ? 'Synthesizing findings…' : `Reviewing ${scopeLabel}…`}
      </div>
      <div style={{ marginTop: 2, fontSize: 11, color: C.muted }}>
        {foundCount > 0 ? `${plural(foundCount, 'finding', 'findings')} so far · ` : ''}
        {done ? 'cross-checking everything once more' : `looking at ${Math.min(idx + 1, total)} of ${total}`}
      </div>
      {/* smooth filmstrip — the whole checklist glides, edges fade via a mask */}
      <div style={{ width: '100%', height: ROW * VISIBLE, marginTop: 8, overflow: 'hidden',
        WebkitMaskImage: 'linear-gradient(180deg, transparent, #000 22%, #000 78%, transparent)',
        maskImage: 'linear-gradient(180deg, transparent, #000 22%, #000 78%, transparent)' }}>
        <div style={{ transform: `translateY(${offset}px)`, transition: 'transform .5s cubic-bezier(0.16,1,0.3,1)', display: 'flex', flexDirection: 'column' }}>
          {items.map((it, i) => {
            const isDone = i < idx
            const isCurrent = i === idx && !done
            const Icon = it.icon
            const dist = Math.abs(i - idx)
            const op = isCurrent ? 1 : isDone ? Math.max(0.32, 0.7 - dist * 0.12) : Math.max(0.18, 0.42 - dist * 0.09)
            return (
              <div key={i} style={{ height: ROW, display: 'flex', alignItems: 'center', gap: 9, padding: '0 10px', borderRadius: 8,
                background: isCurrent ? 'rgba(88,166,255,0.1)' : 'transparent',
                border: `1px solid ${isCurrent ? 'rgba(88,166,255,0.22)' : 'transparent'}`,
                opacity: op, transition: 'opacity .45s ease, background .45s ease, border-color .45s ease' }}>
                <span style={{ width: 18, height: 18, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isDone ? C.green : isCurrent ? C.accent : C.muted3 }}>
                  {isDone ? <Check size={13} /> : isCurrent ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
                </span>
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 12, color: isCurrent ? C.text : C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
              </div>
            )
          })}
        </div>
      </div>
      <button onClick={onStop} className="c4ai-ghost"
        style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 13px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
        <X size={12} /> Stop review
      </button>
    </div>
  )
}

/** The card-style CTA that kicks off the deep AI review — deliberately louder
 *  than a list row, since it's the one thing on this tab that costs a call. */
function DeepReviewCard({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="c4ai-card"
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', padding: '11px 12px', borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, cursor: 'pointer' }}>
      <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 9, background: 'rgba(249,115,22,0.1)', color: '#fdba74', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Stethoscope size={17} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text }}>Run a deep review</span>
        <span style={{ display: 'block', marginTop: 1, fontSize: 11.5, color: C.muted2 }}>Orphans, naming, boundaries — streamed as found</span>
      </span>
      <ArrowRight size={14} color={C.muted3} style={{ flex: 'none' }} />
    </button>
  )
}

/** View / Model segmented mini-toggle with a sliding thumb. */
function ScopeToggle({ scope, onToggle }: { scope: 'view' | 'model'; onToggle: () => void }) {
  return (
    <button onClick={onToggle} role="switch" aria-checked={scope === 'model'}
      aria-label={`Scope: ${scope === 'view' ? 'this view' : 'whole model'} — switch`}
      style={{ position: 'relative', display: 'flex', height: 24, padding: 2, borderRadius: 7, background: C.ink, border: `1px solid ${C.border}`, cursor: 'pointer' }}>
      <span aria-hidden="true" style={{ position: 'absolute', top: 2, left: scope === 'view' ? 2 : '50%', width: 'calc(50% - 2px)', height: 18, borderRadius: 5, background: 'rgba(88,166,255,0.16)', transition: 'left .25s cubic-bezier(0.16,1,0.3,1)' }} />
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, fontSize: 10.5, fontWeight: 700, color: scope === 'view' ? C.accent : C.muted }}>View</span>
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, fontSize: 10.5, fontWeight: 700, color: scope === 'model' ? C.accent : C.muted }}>Model</span>
    </button>
  )
}

function QuickWinRow({ gap, draft, draftsLoading, open, onToggle, onApply, onSkip }: {
  gap: MissingGap; draft: string; draftsLoading: boolean
  open: boolean; onToggle: () => void; onApply: () => void; onSkip: () => void
}) {
  const k = KIND[gap.kind]
  const KindIcon = k.icon
  return (
    <div className="c4ai-msg" style={rowShell(open)}>
      <button onClick={onToggle} aria-expanded={open} style={ROW_HEADER}>
        <KindIcon size={13} color={C.accent} style={{ flex: 'none' }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gap.label}</span>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.muted3, flex: 'none' }}>{k.label}</span>
        <ChevronDown size={14} color={C.muted3} style={{ flex: 'none', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {open && (
        <div style={{ padding: '0 16px 13px 39px' }}>
          {draft ? (
            <div style={{ borderLeft: '2px solid rgba(88,166,255,0.4)', padding: '2px 0 2px 11px', fontSize: 12.5, lineHeight: 1.55, color: C.text2, wordBreak: 'break-word' }}>{draft}</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.muted2 }}>
              {draftsLoading ? <><Loader2 size={12} className="animate-spin" color={C.accent} /> Drafting a suggestion…</> : <>No draft — fill it in the inspector, or skip.</>}
            </div>
          )}
          <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={onApply} disabled={!draft} className="c4ai-pri"
              style={{ ...APPLY_PILL, opacity: draft ? 1 : 0.5, cursor: draft ? 'pointer' : 'default' }}>
              <Check size={13} /> Apply
            </button>
            <button onClick={onSkip} className="c4ai-chip" style={{ ...TEXT_LINK, color: C.muted }}>Skip</button>
          </div>
        </div>
      )}
    </div>
  )
}

function FindingRow({ item, open, onToggle, onApply, onSkip }: {
  item: FindingItem; open: boolean; onToggle: () => void
  onApply: (opt: ReviewFixOption | null) => void; onSkip: () => void
}) {
  const f = item.finding
  const sev = SEV[f.severity]
  const opts = findingOptions(f)
  // Which fix a multi-option finding will apply — local, defaults to the first.
  const [optIdx, setOptIdx] = useState(0)
  const chosen = opts[Math.min(optIdx, opts.length - 1)] ?? null
  return (
    <div className="c4ai-msg" style={rowShell(open)}>
      <button onClick={onToggle} aria-expanded={open} style={ROW_HEADER}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: sev.color }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</span>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: sev.color, flex: 'none' }}>{sev.label}</span>
        <ChevronDown size={14} color={C.muted3} style={{ flex: 'none', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {open && (
        <div style={{ padding: '0 16px 13px 34px' }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: '#a9b3bd', wordBreak: 'break-word' }}><MdInline text={f.detail} /></div>
          {opts.length === 1 && (
            <div style={{ marginTop: 9, borderLeft: '2px solid rgba(88,166,255,0.4)', padding: '2px 0 2px 11px', fontSize: 12.5, lineHeight: 1.55, color: C.text2 }}><MdInline text={opts[0].label} /></div>
          )}
          {opts.length > 1 && (
            <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {opts.map((o, i) => (
                <button key={i} onClick={() => setOptIdx(i)} role="radio" aria-checked={optIdx === i}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 8, textAlign: 'left', padding: '4px 0', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                  <span style={{ width: 13, height: 13, flex: 'none', marginTop: 2, borderRadius: '50%', border: `2px solid ${optIdx === i ? C.accent : C.muted3}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {optIdx === i && <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.accent }} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.45, color: optIdx === i ? C.text : C.text2 }}>{o.label}</span>
                </button>
              ))}
            </div>
          )}
          {opts.length === 0 && f.suggestion && (
            <div style={{ marginTop: 9, fontSize: 12, lineHeight: 1.5, color: C.muted2 }}><MdInline text={f.suggestion} /></div>
          )}
          <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 16 }}>
            {opts.length > 0 ? (
              <button onClick={() => onApply(chosen)} className="c4ai-pri" style={APPLY_PILL}><Check size={13} /> Apply</button>
            ) : (
              <button onClick={() => onApply(null)} className="c4ai-link" style={{ ...TEXT_LINK, fontWeight: 700, color: C.accent }}>Mark done</button>
            )}
            <button onClick={onSkip} className="c4ai-chip" style={{ ...TEXT_LINK, color: C.muted }}>Dismiss</button>
          </div>
        </div>
      )}
    </div>
  )
}
