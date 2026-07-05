import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check, Loader2, Sparkles, ArrowLeft, ArrowRight, Wand2, Star, ChevronDown,
  CornerDownRight, SquarePen, RotateCw, CheckCircle2, Stethoscope, Undo2, Layers,
  Box, Link2, Unlink, Type, ListChecks, X, type LucideIcon,
} from 'lucide-react'
import {
  missingInfoGaps, flattenElements, elementNameMap,
  type MissingGap, type ReviewFinding,
} from '@/lib/ai'
import type { Workspace } from '@/types/model'
import {
  stepState, stepMatchesFilter, queueFilterChips, bulkApplyTargets, bulkSkipTargets,
  type Step, type FixStep, type StepStatus, type QueueFilter, type QueueStepState,
} from './wizardSteps'
import { C, sectionLabel, wizSecBtn, describeBtn, describeIcon } from './aiTheme'
import { plural } from './aiHelpers'
import { CAT, KIND, SEV, findingOptions, type FindingChoice, type LedgerEntry } from './sweepModel'
import { Empty } from './aiPrimitives'

export function RevealLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="c4ai-ghost"
      style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 2px', border: 'none', background: 'transparent', color: C.accent, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
      <CornerDownRight size={13} /> Show in diagram
    </button>
  )
}

// ─── Home dashboard ─────────────────────────────────────────────────

export function HomeDashboard({
  workspace, completePct, scope, scopeIds, viewName, onScope, onImprove, onDescribe,
}: {
  workspace: Workspace | null
  completePct: number
  scope: 'view' | 'model'
  scopeIds: ReadonlySet<string> | undefined
  viewName: string | null
  onScope: (s: 'view' | 'model') => void
  onImprove: (s: 'view' | 'model') => void
  onDescribe: () => void
}) {
  const missingCount = useMemo(() => (workspace ? missingInfoGaps(workspace, scopeIds).length : 0), [workspace, scopeIds])
  const allClear = missingCount === 0
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false)
  const scopeContext = scope === 'view' ? (viewName ? `this view · ${viewName}` : 'this view') : 'whole model'

  if (!workspace) {
    return (
      <>
        <Empty>Open or create a workspace, then I can review it with you.</Empty>
        <button onClick={onDescribe} className="c4ai-card" style={describeBtn}>
          <span style={describeIcon}><SquarePen size={18} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.text }}>Describe a change</span>
            <span style={{ display: 'block', fontSize: 12, color: C.muted2, marginTop: 2 }}>Build or edit the model in plain English</span>
          </span>
          <ArrowRight size={16} color={C.muted3} style={{ flex: 'none' }} />
        </button>
      </>
    )
  }

  return (
    <>
      {/* Quick Fixes */}
      <div style={{ padding: '12px 14px', borderRadius: 13, border: `1px solid ${C.border}`, background: 'linear-gradient(165deg, #1a222e, #161b22)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: C.text2 }}><Wand2 size={14} color={C.accent} /> Quick Fixes</span>
            <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: C.muted3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scopeContext}</span>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none', fontSize: 22, fontWeight: 800, color: allClear ? '#facc15' : C.text, letterSpacing: '-.02em' }}>
            {allClear
              ? <><Star size={15} fill="#facc15" color="#facc15" /><span style={{ fontSize: 15 }}>All clear</span></>
              : <>{missingCount}<span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>ready</span></>}
          </span>
        </div>
        <div style={{ marginTop: 8, height: 7, borderRadius: 999, background: C.ink, overflow: 'hidden', border: '1px solid rgba(88,166,255,0.1)' }}>
          <div style={{ height: '100%', width: `${completePct}%`, background: 'linear-gradient(90deg,#58a6ff,#7dd3fc)', borderRadius: 999, transition: 'width .45s cubic-bezier(0.16,1,0.3,1)' }} />
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: C.muted2, lineHeight: 1.4 }}>
          {allClear
            ? <>All instant checks pass — Improve runs a deeper review and a few questions.</>
            : <><span style={{ color: C.text, fontWeight: 700 }}>{plural(missingCount, 'quick fix', 'quick fixes')}</span> ready — Improve walks you through these, then a deeper review.</>}
        </div>
      </div>

      {/* The unified entry — scope lives INSIDE the button; the split caret swaps it. */}
      <div style={{ position: 'relative', marginTop: 12 }}>
        <div style={{ display: 'flex', height: 50, borderRadius: 13, overflow: 'hidden', boxShadow: '0 8px 22px rgba(79,151,240,0.28)' }}>
          <button onClick={() => onImprove(scope)} className="c4ai-pri"
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, border: 'none', background: C.accent, color: C.ink, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            <Wand2 size={17} /> Improve {scope === 'view' ? 'this view' : 'the whole model'}
          </button>
          <div style={{ width: 1, background: 'rgba(13,17,23,0.25)' }} />
          <button onClick={() => setScopeMenuOpen((o) => !o)} aria-label="Change scope" aria-haspopup="menu" aria-expanded={scopeMenuOpen}
            style={{ width: 46, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: C.accent, color: C.ink, cursor: 'pointer' }}>
            <ChevronDown size={18} style={{ transform: scopeMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} />
          </button>
        </div>
        {scopeMenuOpen && (
          <>
            <div onClick={() => setScopeMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
            <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 10, minWidth: 200, borderRadius: 11, border: `1px solid ${C.borderStrong}`, background: '#1a222e', boxShadow: '0 14px 32px rgba(0,0,0,0.55)', padding: 5, animation: 'c4ai-fade .14s ease' }}>
              {(['view', 'model'] as const).map((sc) => (
                <button key={sc} role="menuitemradio" aria-checked={scope === sc} onClick={() => { onScope(sc); setScopeMenuOpen(false) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', padding: '9px 11px', borderRadius: 8, border: 'none', background: scope === sc ? 'rgba(88,166,255,0.12)' : 'transparent', color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {scope === sc ? <Check size={14} color={C.accent} /> : <span style={{ width: 14, flex: 'none' }} />}
                  {sc === 'view' ? 'This view' : 'Whole model'}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div style={{ marginTop: 7, display: 'flex', alignItems: 'flex-start', gap: 7, padding: '0 2px', fontSize: 11.5, color: C.muted2, lineHeight: 1.45 }}>
        <CornerDownRight size={13} style={{ flex: 'none', marginTop: 1 }} />
        <span>Fixes what it can, reviews the rest, and asks you only when it can’t work it out.</span>
      </div>

      {/* Other ways in — different inputs, kept separate. */}
      <div style={sectionLabel}>Or start from</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <button onClick={onDescribe} className="c4ai-card" style={describeBtn}>
          <span style={describeIcon}><Sparkles size={19} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.text }}>Describe a change</span>
            <span style={{ display: 'block', fontSize: 12, color: C.muted2, marginTop: 2 }}>Build or edit the model in plain English</span>
          </span>
          <ArrowRight size={16} color={C.muted3} style={{ flex: 'none' }} />
        </button>
      </div>
    </>
  )
}

// ─── Wizard step ────────────────────────────────────────────────────

export function WizardStep({
  step, idx, total, draft, draftLoading, applied, onDraft, onRewrite, onReveal, onBack, onApply, onSkip, onRevert,
  choice, onChoice, applyBusy, onOverview, bulkReady,
}: {
  step: Step; idx: number; total: number
  draft: string; draftLoading: boolean; applied: boolean
  onDraft: (v: string) => void; onRewrite: () => void; onReveal?: () => void
  onBack?: () => void
  onApply: () => void; onSkip: () => void; onRevert: () => void
  choice?: FindingChoice; onChoice: (c: FindingChoice) => void; applyBusy: boolean
  onOverview: () => void
  /** Drafted fixes a bulk apply would land right now — powers the shortcut row. */
  bulkReady: number
}) {
  const cm = CAT[step.cat]
  const CatIcon = cm.icon
  const pct = total > 0 ? Math.round((idx / total) * 100) : 0

  return (
    <div>
      {/* progress + chip */}
      <div style={{ height: 6, borderRadius: 999, background: C.card, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#58a6ff,#7dd3fc)', borderRadius: 999, transition: 'width .35s' }} />
      </div>
      <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999, background: cm.bg, color: cm.color }}><CatIcon size={12} /> {cm.label}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {onBack && (
            <button onClick={onBack} className="c4ai-ghost" aria-label="Previous question" title="Previous question"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, border: 'none', background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
              <ArrowLeft size={13} /> Back
            </button>
          )}
          <button onClick={onOverview} className="c4ai-ghost" aria-label={`All steps — step ${Math.min(idx + 1, total)} of ${total}`} title="All steps"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', color: C.muted2, fontSize: 12, fontWeight: 500, cursor: 'pointer', padding: '2px 3px', borderRadius: 6 }}>
            <ListChecks size={13} /> Step {Math.min(idx + 1, total)} of {total}
          </button>
        </span>
      </div>

      {step.type === 'fix'
        ? <FixCard key={step.key} gap={step.gap} draft={draft} draftLoading={draftLoading} applied={applied} onDraft={onDraft} onRewrite={onRewrite} onReveal={onReveal} onApply={onApply} onSkip={onSkip} onRevert={onRevert} />
        : <FindingCardStep key={step.key} finding={step.finding} applied={applied} onReveal={onReveal} onApply={onApply} onSkip={onSkip} onRevert={onRevert} choice={choice} onChoice={onChoice} applyBusy={applyBusy} />}

      {/* Shortcut out of one-at-a-time: with several drafted fixes waiting,
          offer the queue overview's bulk apply (it opens for review first —
          nothing is applied from here). */}
      {step.type === 'fix' && bulkReady > 1 && (
        <button onClick={onOverview} className="c4ai-ghost"
          style={{ marginTop: 10, width: '100%', height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 9, border: `1px dashed ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
          <Wand2 size={13} /> Apply all {bulkReady} suggested…
        </button>
      )}
    </div>
  )
}

function FixCard({ gap, draft, draftLoading, applied, onDraft, onRewrite, onReveal, onApply, onSkip, onRevert }: {
  gap: MissingGap; draft: string; draftLoading: boolean; applied: boolean
  onDraft: (v: string) => void; onRewrite: () => void | Promise<void>; onReveal?: () => void; onApply: () => void; onSkip: () => void; onRevert: () => void
}) {
  const k = KIND[gap.kind]
  const [regen, setRegen] = useState(false)
  // Hold the spinner until the actual rewrite call settles (onRewrite returns the
  // async rewriteDraft promise), not a fixed timer.
  function rewrite() { setRegen(true); Promise.resolve(onRewrite()).finally(() => setRegen(false)) }

  return (
    <div style={{ marginTop: 18, animation: 'c4ai-next .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <div style={{ minWidth: 0 }}>
        <div title={gap.label} style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: '-.01em', lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>{gap.label}</div>
        <div style={{ fontSize: 13, color: C.muted2, marginTop: 2 }}>{k.prompt}</div>
      </div>
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted3 }}>
        <Sparkles size={13} color={C.accent} /> Suggested {k.label}
        {(draftLoading || regen)
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto', letterSpacing: 0, textTransform: 'none', fontWeight: 500, color: C.muted2 }}><Loader2 size={12} className="animate-spin" /> Drafting…</span>
          : <button onClick={rewrite} aria-label="Rewrite suggestion" title="Rewrite suggestion" className="c4ai-ghost" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', border: 'none', background: 'transparent', color: C.muted2, cursor: 'pointer', padding: 2 }}><RotateCw size={13} /></button>}
      </div>
      <textarea value={draft} onChange={(e) => onDraft(e.target.value)}
        placeholder={draftLoading ? 'Drafting a suggestion…' : `Type a ${k.label}…`}
        style={{ width: '100%', marginTop: 9, resize: 'vertical', minHeight: gap.kind === 'desc' ? 150 : gap.kind === 'rel' ? 128 : 64, padding: '13px 15px', borderRadius: 12, border: `1px solid ${C.borderStrong}`, background: C.card, color: C.text, fontSize: 14, lineHeight: 1.55, fontFamily: 'inherit' }} />
      {onReveal && <div><RevealLink onClick={onReveal} /></div>}
      <div style={{ marginTop: 16, display: 'flex', gap: 9 }}>
        {applied
          ? <button onClick={onRevert} className="c4ai-ghost" style={{ ...wizSecBtn, flex: 'none', minWidth: 92, height: 46, color: C.dangerText }}>Revert</button>
          : <button onClick={onSkip} className="c4ai-ghost" style={{ ...wizSecBtn, flex: 'none', minWidth: 92, height: 46 }}>Skip</button>}
        <button onClick={onApply} disabled={!draft.trim()} className="c4ai-pri"
          style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, border: 'none', background: applied ? C.green : C.accent, color: C.ink, fontSize: 14.5, fontWeight: 700, cursor: 'pointer', opacity: draft.trim() ? 1 : 0.55 }}>
          <Check size={16} /> {applied ? 'Applied · update' : 'Apply'}
        </button>
      </div>
    </div>
  )
}

function FindingCardStep({ finding, applied, onReveal, onApply, onSkip, onRevert, choice, onChoice, applyBusy }: {
  finding: ReviewFinding; applied: boolean; onReveal?: () => void
  onApply: () => void; onSkip: () => void; onRevert: () => void
  choice?: FindingChoice; onChoice: (c: FindingChoice) => void; applyBusy: boolean
}) {
  const sev = SEV[finding.severity]
  const opts = findingOptions(finding)
  const actionable = opts.length > 0
  const sel = choice ?? { idx: 0, other: '' }
  const otherEmpty = sel.idx === -1 && !sel.other.trim()
  const pick = (idx: number) => onChoice({ idx, other: sel.other })
  return (
    <div style={{ marginTop: 18, animation: 'c4ai-next .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: '-.01em' }}>{finding.title}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: sev.color, marginTop: 3 }}>{sev.label} severity · {finding.category}</div>
      </div>
      <div style={{ marginTop: 16, fontSize: 14, color: C.text2, lineHeight: 1.55 }}>{finding.detail}</div>

      {actionable ? (
        <div style={{ marginTop: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted3 }}>Suggested fix{opts.length > 1 ? ' — pick one' : ''}</span>
          <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {opts.map((o, i) => (
              <FixOptionRow key={i} label={o.label} selected={sel.idx === i} disabled={applied} onSelect={() => pick(i)} />
            ))}
            <FixOptionRow label="Other — describe the fix yourself" selected={sel.idx === -1} disabled={applied} onSelect={() => onChoice({ idx: -1, other: sel.other })} />
            {sel.idx === -1 && (
              <textarea value={sel.other} onChange={(e) => onChoice({ idx: -1, other: e.target.value })} disabled={applied}
                placeholder="e.g. Make ATM an external software system and connect it to the Web App"
                style={{ width: '100%', resize: 'vertical', minHeight: 80, padding: '11px 13px', borderRadius: 10, border: `1px solid ${C.borderStrong}`, background: C.card, color: C.text, fontSize: 13.5, lineHeight: 1.5, fontFamily: 'inherit' }} />
            )}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14, padding: '13px 15px', borderRadius: 12, background: 'rgba(88,166,255,0.07)', border: '1px solid rgba(88,166,255,0.2)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>Suggested fix</span>
          <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5, marginTop: 4 }}>{finding.suggestion}</div>
        </div>
      )}

      {onReveal && <div><RevealLink onClick={onReveal} /></div>}
      <div style={{ marginTop: 16, display: 'flex', gap: 9 }}>
        {applied
          ? <button onClick={onRevert} className="c4ai-ghost" style={{ ...wizSecBtn, flex: actionable ? 'none' : 1, minWidth: 92, height: 46, color: C.dangerText }}>Revert</button>
          : <button onClick={onSkip} className="c4ai-ghost" style={{ ...wizSecBtn, flex: actionable ? 'none' : 1, minWidth: 92, height: 46 }}>Skip</button>}
        {actionable && (
          <button onClick={onApply} disabled={applyBusy || (!applied && otherEmpty)} className="c4ai-pri"
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, border: 'none', background: applied ? C.green : C.accent, color: C.ink, fontSize: 14.5, fontWeight: 700, cursor: applyBusy || (!applied && otherEmpty) ? 'default' : 'pointer', opacity: applyBusy || (!applied && otherEmpty) ? 0.55 : 1 }}>
            {applyBusy ? <><Loader2 size={16} className="animate-spin" /> Applying…</> : <><Check size={16} /> {applied ? 'Applied · update' : 'Apply fix'}</>}
          </button>
        )}
      </div>
    </div>
  )
}

/** A single radio-style choice row in a finding's fix picker. */
function FixOptionRow({ label, selected, disabled, onSelect }: { label: string; selected: boolean; disabled: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect} disabled={disabled} role="radio" aria-checked={selected}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
        background: selected ? 'rgba(88,166,255,0.1)' : C.card, border: `1px solid ${selected ? C.borderStrong : C.border}`, color: selected ? C.text : C.text2, fontSize: 13, fontWeight: selected ? 600 : 500, opacity: disabled && !selected ? 0.6 : 1 }}>
      <span style={{ width: 16, height: 16, flex: 'none', borderRadius: '50%', border: `2px solid ${selected ? C.accent : C.muted3}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {selected && <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.accent }} />}
      </span>
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>{label}</span>
    </button>
  )
}

// ─── Queue overview ─────────────────────────────────────────────────

// The wizard's all-steps screen: every queued step with its kind and status,
// filter chips (per gap kind / finding severity), jump-to-step, and the bulk
// actions — "Apply all suggested" over the drafted missing-info fixes (with
// per-item opt-out via the checkboxes) and "Skip shown". Findings are never
// bulk-applied; they keep the one-at-a-time stepper. Exported for tests.
export function QueueOverview({
  queue, curIdx, decisions, appliedKeys, drafts, draftsLoading, reviewLoading,
  optOut, onToggleOptOut, onJump, onBulkApply, onBulkSkip, onClose, onStopReview,
}: {
  queue: Step[]; curIdx: number
  decisions: Record<string, StepStatus>; appliedKeys: ReadonlySet<string>
  drafts: Record<string, string>; draftsLoading: boolean; reviewLoading: boolean
  optOut: Record<string, boolean>
  onToggleOptOut: (key: string) => void
  onJump: (idx: number) => void
  onBulkApply: (steps: FixStep[]) => void
  onBulkSkip: (steps: Step[]) => void
  onClose: () => void
  onStopReview?: () => void
}) {
  const [filter, setFilter] = useState<QueueFilter>('all')
  const chips = useMemo(() => queueFilterChips(queue), [queue])
  const shown = queue.map((step, idx) => ({ step, idx })).filter(({ step }) => stepMatchesFilter(step, filter))
  const applyTargets = bulkApplyTargets(queue, filter, decisions, appliedKeys, drafts, optOut)
  const skipTargets = bulkSkipTargets(queue, filter, decisions, appliedKeys)
  const doneCount = queue.filter((s) => stepState(s, decisions, appliedKeys) !== 'pending').length
  const pendingFixShown = shown.some(({ step }) => step.type === 'fix' && stepState(step, decisions, appliedKeys) === 'pending')
  const pendingFindingShown = shown.some(({ step }) => step.type === 'finding' && stepState(step, decisions, appliedKeys) === 'pending')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onClose} className="c4ai-ghost" aria-label="Back to the current step"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, border: 'none', background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
          <ArrowLeft size={13} /> {doneCount === queue.length ? 'Continue' : 'Back'}
        </button>
        <span style={{ fontSize: 12, color: C.muted2 }}>{doneCount} of {queue.length} done</span>
      </div>

      <div style={{ marginTop: 12, fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: '-.01em' }}>All steps</div>
      {(reviewLoading || draftsLoading) && (
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.muted2 }}>
          <Loader2 size={12} className="animate-spin" color={C.accent} />
          <span>{reviewLoading ? 'Deep review running — its findings will appear here.' : 'Drafting suggestions…'}</span>
          {reviewLoading && onStopReview && (
            <button onClick={onStopReview} className="c4ai-ghost" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: C.accent, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: '0 2px' }}><X size={11} /> Stop</button>
          )}
        </div>
      )}

      {/* filters */}
      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {chips.map((c) => (
          <button key={c.id} onClick={() => setFilter(c.id)} aria-pressed={filter === c.id}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              background: filter === c.id ? 'rgba(88,166,255,0.14)' : 'transparent',
              border: `1px solid ${filter === c.id ? C.borderStrong : C.border}`,
              color: filter === c.id ? C.text : C.muted2 }}>
            {c.label} <span style={{ fontWeight: 500, opacity: 0.75 }}>{c.count}</span>
          </button>
        ))}
      </div>

      {/* the queue */}
      <div data-scroll style={{ marginTop: 12, maxHeight: 252, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 2 }}>
        {shown.map(({ step, idx }) => (
          <QueueRow key={step.key} step={step} current={idx === curIdx}
            state={stepState(step, decisions, appliedKeys)}
            draft={(drafts[step.key] ?? '').trim()} draftsLoading={draftsLoading}
            optedOut={!!optOut[step.key]}
            onToggle={() => onToggleOptOut(step.key)} onJump={() => onJump(idx)} />
        ))}
      </div>

      {/* bulk actions */}
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pendingFixShown && (
          <button onClick={() => onBulkApply(applyTargets)} disabled={!applyTargets.length} className="c4ai-pri"
            style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, border: 'none', background: C.accent, color: C.ink, fontSize: 14.5, fontWeight: 700, cursor: applyTargets.length ? 'pointer' : 'default', opacity: applyTargets.length ? 1 : 0.55 }}>
            <Wand2 size={16} /> Apply {applyTargets.length} suggested
          </button>
        )}
        {skipTargets.length > 0 && (
          <button onClick={() => onBulkSkip(skipTargets)} className="c4ai-ghost" style={{ ...wizSecBtn, flex: 'none', height: 38 }}>
            Skip {skipTargets.length} shown
          </button>
        )}
        {pendingFindingShown && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '0 2px', fontSize: 11.5, color: C.muted2, lineHeight: 1.45 }}>
            <Stethoscope size={12} color={C.warn} style={{ flex: 'none', marginTop: 1 }} />
            <span>Review findings aren’t bulk-applied — open one to pick its fix.</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** One row in the queue overview. The checkbox (drafted, pending fixes only)
 *  is a sibling of the row button — nested interactive elements are invalid —
 *  and toggles that fix in or out of "Apply all suggested". */
function QueueRow({ step, current, state, draft, draftsLoading, optedOut, onToggle, onJump }: {
  step: Step; current: boolean; state: QueueStepState
  draft: string; draftsLoading: boolean
  optedOut: boolean; onToggle: () => void; onJump: () => void
}) {
  // Keep the current step visible when the (scrolling) list first opens.
  const rowRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => { if (current) rowRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [current])

  const isFix = step.type === 'fix'
  const label = isFix ? step.gap.label : step.finding.title
  const sub = isFix
    ? (draft || (draftsLoading ? 'Drafting a suggestion…' : `No ${KIND[step.gap.kind].label} yet — open to write one`))
    : `${SEV[step.finding.severity].label} severity · ${step.finding.category}`
  const showCheckbox = isFix && state === 'pending' && !!draft
  const ticked = showCheckbox && !optedOut
  const KindIcon = isFix ? KIND[step.gap.kind].icon : null

  return (
    <div ref={rowRef} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      {/* fix rows keep the checkbox gutter even without one, so their labels align */}
      {isFix && (showCheckbox ? (
        <button onClick={onToggle} role="checkbox" aria-checked={ticked} aria-label={`Include "${label}" in bulk apply`}
          style={{ width: 17, height: 17, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, cursor: 'pointer', padding: 0, background: ticked ? C.accent : 'transparent', border: `1px solid ${ticked ? C.accent : C.borderStrong}`, color: C.ink }}>
          {ticked && <Check size={12} strokeWidth={3} />}
        </button>
      ) : (
        <span style={{ width: 17, flex: 'none' }} />
      ))}
      <button onClick={onJump} className="c4ai-card" aria-current={current ? 'step' : undefined}
        style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '8px 10px', borderRadius: 10, cursor: 'pointer', background: C.card, border: `1px solid ${current ? C.borderStrong : C.border}`, opacity: state === 'skipped' ? 0.55 : 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {KindIcon
            ? <KindIcon size={12} color={CAT.missing.color} style={{ flex: 'none' }} />
            : step.type === 'finding' && <span style={{ width: 8, height: 8, flex: 'none', borderRadius: '50%', background: SEV[step.finding.severity].color }} />}
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          {state === 'applied' && <CheckCircle2 size={13} color={C.green} style={{ flex: 'none' }} aria-label="Applied" />}
          {state === 'skipped' && <span style={{ flex: 'none', fontSize: 10, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: C.muted3 }}>Skipped</span>}
        </span>
        <span style={{ display: 'block', marginTop: 2, paddingLeft: 19, fontSize: 11.5, color: C.muted2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>
      </button>
    </div>
  )
}

// ─── Review (batch) screen ──────────────────────────────────────────

// Compact "applied so far" bar shown under each wizard step once changes start
// landing. Reflects live model health and jumps to the summary/revert ledger.
export function AppliedBar({ n, pct, onReview }: { n: number; pct: number; onReview: () => void }) {
  return (
    <button onClick={onReview}
      style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 12px', borderRadius: 11, border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.06)', color: C.text2, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
      <CheckCircle2 size={15} color={C.green} style={{ flex: 'none' }} />
      <span style={{ flex: 1, textAlign: 'left' }}>{plural(n, 'change', 'changes')} applied · health {pct}%</span>
      <span style={{ color: C.accent }}>Review</span>
    </button>
  )
}

// End-of-flow summary for the apply-as-you-go guided sweep. Changes are already
// live in the model; this is the revert ledger — undo any single one, or all.
export function SweepSummary({ completePct, ledger, onRevert, onRevertAll, onBack, onDone }: {
  completePct: number; ledger: LedgerEntry[]
  onRevert: (key: string) => void; onRevertAll: () => void
  onBack?: () => void; onDone: () => void
}) {
  const n = ledger.length
  return (
    <div>
      {onBack && (
        <button onClick={onBack} className="c4ai-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginBottom: 12, border: 'none', background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
          <ArrowLeft size={13} /> Back to questions
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 11, background: n > 0 ? 'rgba(34,197,94,0.14)' : 'rgba(88,166,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: n > 0 ? C.green : C.accent, animation: 'c4ai-pop .5s cubic-bezier(.34,1.56,.64,1) both' }}>{n > 0 ? <CheckCircle2 size={20} /> : <Layers size={20} />}</span>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: '-.01em' }}>{n > 0 ? `${plural(n, 'change', 'changes')} applied` : 'No changes applied'}</div>
          <div style={{ fontSize: 12.5, color: C.muted2, marginTop: 1 }}>Model health is now <span style={{ color: '#7dd3fc', fontWeight: 600 }}>{completePct}%</span></div>
        </div>
      </div>

      {n > 0 ? (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ledger.map((e, i) => {
            const cm = CAT[e.cat]
            return (
              <div key={e.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 12px', borderRadius: 11, border: `1px solid ${C.border}`, background: C.card, animation: 'c4ai-stagger .4s cubic-bezier(0.16,1,0.3,1) both', animationDelay: `${0.06 + i * 0.05}s` }}>
                <span style={{ flex: 'none', marginTop: 1, fontSize: 9, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 5, background: cm.bg, color: cm.color }}>{cm.label}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text }}>{e.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#9aa3ad', lineHeight: 1.45, marginTop: 2 }}>{e.detail}</span>
                </span>
                <button onClick={() => onRevert(e.key)} aria-label="Revert this change" className="c4ai-ghost" style={{ flex: 'none', height: 24, padding: '0 8px', display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 7, border: 'none', background: 'transparent', color: C.muted3, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}><Undo2 size={13} /> Revert</button>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ marginTop: 16, padding: 18, borderRadius: 12, border: '1px dashed rgba(88,166,255,0.2)', background: C.card, textAlign: 'center', fontSize: 12.5, color: C.muted2, lineHeight: 1.5 }}>
          Nothing applied this run. Step back to revisit a question, or head back to the dashboard.
        </div>
      )}

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <button onClick={onDone} className="c4ai-pri"
          style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 13, border: 'none', background: C.accent, color: C.ink, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          <Check size={16} /> Done
        </button>
        {n > 0 && <button onClick={onRevertAll} className="c4ai-ghost" style={{ width: '100%', height: 40, borderRadius: 11, border: `1px solid ${C.border}`, background: 'transparent', color: C.dangerText, fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>Undo all changes</button>}
      </div>
    </div>
  )
}

// While the architecture review runs (one AI call, no streamed progress), walk a
// live checklist of the model's *real* elements, relationships and the quality
// aspects being audited — each ticks green as the "beam" passes it. Grounds the
// wait in what's actually being looked at, then settles on "Synthesizing…".
// `scopeIds` (when given) limits the checklist to the in-view targets so the
// animation matches the scoped review — not a misleading whole-model sweep.
export function ReviewScanning({ workspace, scopeIds, scopeLabel, onStop }: { workspace: Workspace; scopeIds?: ReadonlySet<string>; scopeLabel?: string | null; onStop?: () => void }) {
  const items = useMemo(() => {
    const out: { label: string; icon: LucideIcon }[] = []
    const els = flattenElements(workspace).filter((e) => !scopeIds || scopeIds.has(e.id))
    for (const e of els) out.push({ label: e.name?.trim() || '(unnamed element)', icon: Box })
    const names = elementNameMap(workspace)
    const rels = (workspace.model.relationships ?? []).filter((r) => !scopeIds || scopeIds.has(r.id))
    for (const r of rels.slice(0, 8)) {
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
  const ROW = 36, VISIBLE = 5, RING = 58
  const circ = 2 * Math.PI * RING
  const offset = -(idx - 2) * ROW // glide so the current item stays centered

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '8px 0 4px' }}>
      {/* progress ring + sonar pulse around the deep-review (stethoscope) motif */}
      <div style={{ position: 'relative', width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ position: 'absolute', width: 104, height: 104, borderRadius: '50%', border: '1px solid rgba(88,166,255,0.4)', animation: 'c4ai-ringpulse 2.4s ease-out infinite' }} />
        <span style={{ position: 'absolute', width: 104, height: 104, borderRadius: '50%', border: '1px solid rgba(88,166,255,0.4)', animation: 'c4ai-ringpulse 2.4s ease-out infinite 1.2s' }} />
        <svg viewBox="0 0 140 140" width="140" height="140" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
          <circle cx="70" cy="70" r={RING} fill="none" stroke="rgba(88,166,255,0.12)" strokeWidth="4" />
          <circle cx="70" cy="70" r={RING} fill="none" stroke="#58a6ff" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)}
            style={{ transition: 'stroke-dashoffset .55s cubic-bezier(0.16,1,0.3,1)', filter: 'drop-shadow(0 0 5px rgba(88,166,255,0.5))' }} />
        </svg>
        <span style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(88,166,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent, animation: 'c4ai-float 4s ease-in-out infinite' }}>
          <Stethoscope size={26} />
        </span>
      </div>
      <div style={{ marginTop: 10, fontSize: 13.5, fontWeight: 700, color: C.text }}>
        {done ? 'Synthesizing findings…' : `Reviewing ${scopeLabel || workspace.name || 'your model'}…`}
      </div>
      <div style={{ marginTop: 4, fontSize: 11.5, color: C.muted }}>
        {done ? 'Cross-checking everything once more' : `Evaluating ${Math.min(idx + 1, total)} of ${total}`}
      </div>
      {/* smooth filmstrip — the whole list glides, edges fade via a mask */}
      <div style={{ width: '100%', height: ROW * VISIBLE, marginTop: 12, overflow: 'hidden',
        WebkitMaskImage: 'linear-gradient(180deg, transparent, #000 20%, #000 80%, transparent)',
        maskImage: 'linear-gradient(180deg, transparent, #000 20%, #000 80%, transparent)' }}>
        <div style={{ transform: `translateY(${offset}px)`, transition: 'transform .5s cubic-bezier(0.16,1,0.3,1)', display: 'flex', flexDirection: 'column' }}>
          {items.map((it, i) => {
            const isDone = i < idx
            const isCurrent = i === idx && !done
            const Icon = it.icon
            const dist = Math.abs(i - idx)
            const op = isCurrent ? 1 : isDone ? Math.max(0.32, 0.7 - dist * 0.12) : Math.max(0.18, 0.42 - dist * 0.09)
            return (
              <div key={i} style={{ height: ROW, display: 'flex', alignItems: 'center', gap: 9, padding: '0 11px', borderRadius: 9,
                background: isCurrent ? 'rgba(88,166,255,0.1)' : 'transparent',
                border: `1px solid ${isCurrent ? 'rgba(88,166,255,0.22)' : 'transparent'}`,
                opacity: op, transition: 'opacity .45s ease, background .45s ease, border-color .45s ease' }}>
                <span style={{ width: 20, height: 20, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isDone ? C.green : isCurrent ? C.accent : C.muted3 }}>
                  {isDone ? <Check size={14} /> : isCurrent ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
                </span>
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 12.5, color: isCurrent ? C.text : C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
              </div>
            )
          })}
        </div>
      </div>
      {onStop && (
        <button onClick={onStop} className="c4ai-ghost"
          style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          <X size={13} /> Stop review
        </button>
      )}
    </div>
  )
}
