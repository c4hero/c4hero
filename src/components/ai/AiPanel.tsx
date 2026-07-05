import { useEffect, useMemo, useRef, useState } from 'react'
import { clearAiSession, ensureSessionForWorkspace, usePersistentState } from './sessionCache'
import {
  X, Sparkles, ArrowLeft, Settings,
} from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import { useWorkspaceStore, getActiveView } from '@/store/workspace'
import { allViewsOf } from '@/store/workspace-helpers'
import { useAiSettingsStore, useAiProvider } from '@/store/ai-settings'
import type { Workspace } from '@/types/model'
import {
  aiErrorMessage,
  planEdit, autoDescribe, reviewArchitectureStream, suggestFieldValue,
  applyEditPlan, summarizeSkips, viewLabel,
  isActionable,
  missingInfoGaps, modelHealthPercent, gapToOp,
  type MissingGap,
  type AiProvider,
  type EditPlan, type EditOp, type AiFeatureId,
} from '@/lib/ai'
import {
  stepElementIds, stepRelationshipId,
  bulkApplyTargets, nextUndecidedIndex,
  type Step, type FixStep, type StepStatus,
} from './wizardSteps'
import {
  C, STYLE,
  headerRow, iconBtn,
} from './aiTheme'
import {
  plural, storeEditActions, applyPlanToStore, isAbortError,
} from './aiHelpers'
import {
  FEATURE_TO_VIEW, VIEW_TITLE, TECH_INSTRUCTION, findingOptions, viewScopeIds,
  type SweepView, type CatId, type FindingChoice, type LedgerEntry,
} from './sweepModel'
import {
  ErrorLine, Notice, Empty,
} from './aiPrimitives'
import { UsageCounterPill } from './UsageCounter'
import { AdrBody } from './AdrBody'
import { ComposeBody } from './ComposeBody'
import { InterviewBody } from './InterviewBody'
import { ByokWelcome, SettingsView } from './SettingsView'
import {
  HomeDashboard, WizardStep, QueueOverview, SweepSummary, ReviewScanning, AppliedBar,
} from './wizard'

export default function AiPanel({ onClose }: { onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const settings = useAiSettingsStore()
  const setStoreSettingsOpen = useWorkspaceStore((s) => s.setAiSettingsOpen)
  const storeFeature = useWorkspaceStore((s) => s.aiPanelFeature)
  const storeSettingsOpen = useWorkspaceStore((s) => s.aiSettingsOpen)

  const [settingsOpen, setSettingsOpen] = useState(false)

  const { provider, draftProvider, hasKey, model } = useAiProvider()

  function openSettings() { setSettingsOpen(true); setStoreSettingsOpen(false) }
  function closeSettings() { setSettingsOpen(false); setStoreSettingsOpen(false) }

  // View routing: no key → BYOK welcome; disabled or settings open → settings; else app.
  const mode: 'byok' | 'settings' | 'app' = !hasKey ? 'byok' : (settingsOpen || storeSettingsOpen || !settings.enabled) ? 'settings' : 'app'

  // Fixed placement: a compact card tucked against the tool rail and centred
  // vertically. The panel is intentionally not draggable, so any previously
  // persisted panelPos is ignored — the layout is always the same.

  const baseStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column',
    background: C.panel, border: `1px solid ${C.border}`,
    boxShadow: '0 16px 64px rgba(0,0,0,0.6)', overflow: 'hidden',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    width: `min(${PANEL_WIDTH}px, calc(100vw - 28px))`,
    borderRadius: 12,
    // Left edge tucked right up against the tool rail (which carries the
    // assistant's own launcher button) and vertically centred in the viewport,
    // sized to its content (capped) rather than spanning the full height — a
    // compact card, not a full-height rail. `top: 50%` + translateY centres it;
    // `bottom: auto` overrides DialogShell's docked full-height rail.
    maxHeight: `min(${MAX_PANEL_H}px, calc(100dvh - 96px))`,
    top: '50%',
    transform: 'translateY(-50%)',
    bottom: 'auto',
    height: 'auto',
    left: 64,
    right: 'auto',
  }

  return (
    <DialogShell
      onClose={onClose}
      ariaLabel="AI assistant"
      className="c4ai"
      position="docked"
      closeOnEscape={false}
      style={baseStyle}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <style>{STYLE}</style>

        {mode === 'byok' && <ByokWelcome onClose={onClose} />}
        {mode === 'settings' && <SettingsView onClose={onClose} onDone={hasKey ? closeSettings : undefined} />}
        {mode === 'app' && provider && (
          <AppView
            provider={provider} draftProvider={draftProvider ?? provider} workspace={workspace} model={model}
            feature={storeFeature} onOpenSettings={openSettings} onClose={onClose}
          />
        )}
      </div>
    </DialogShell>
  )
}

const PANEL_WIDTH = 300

/** Compact model name for the header pill (drops the vendor prefix), so it
 *  doesn't crowd the view title — e.g. "claude-haiku-4-5" → "haiku-4-5". */
function shortModel(m: string): string {
  return m.replace(/^(claude-|gemini-|models\/)/, '')
}
const MAX_PANEL_H = 560  // cap height so the panel stays a compact card, not a full-height rail

// ─── App (guided-sweep controller) ──────────────────────────────────
//
// One AI assistant, one guided flow. The Home dashboard funnels everything into
// a step-by-step wizard over a merged queue (instant missing-info fixes + AI
// review findings), a batch-review screen, and a commit. Interview and repo —
// inherently conversational / folder-driven — are reachable from the dashboard
// as their own focused flows (existing InterviewBody / RepoBody).

function AppView({
  provider, draftProvider, workspace, model, feature, onOpenSettings, onClose,
}: {
  provider: AiProvider
  /** Cheap-tier provider for mechanical drafts (auto-describe, tech, rewrite). */
  draftProvider: AiProvider
  workspace: Workspace | null
  model: string
  feature: AiFeatureId | null
  onOpenSettings: () => void
  onClose: () => void
}) {
  // Drop any cached flow from a different workspace before restoring below.
  // Key the resume cache on the diagram identity (collection/workspace), not the
  // workspace name (not unique) nor the full path (it includes the active view
  // key — `/collection/:c/:ws/:view` — so a view switch would wrongly clear the
  // in-progress flow). Take the first three path segments only.
  ensureSessionForWorkspace(typeof window !== 'undefined' ? window.location.pathname.split('/').slice(0, 4).join('/') : null)
  const [view, setView] = usePersistentState<SweepView>('sweep.view', feature ? FEATURE_TO_VIEW[feature] : 'home')

  // Sweep state — persisted across close→reopen so an in-progress wizard resumes.
  const [queue, setQueue] = usePersistentState<Step[]>('sweep.queue', [])
  const [curIdx, setCurIdx] = usePersistentState('sweep.curIdx', 0)
  const [decisions, setDecisions] = usePersistentState<Record<string, StepStatus>>('sweep.decisions', {})
  const [drafts, setDrafts] = usePersistentState<Record<string, string>>('sweep.drafts', {})
  // Which fix a review finding will apply: an index into its options, or -1 for a
  // free-text "Other" the user writes. Persisted so a revisited step keeps the pick.
  const [findingChoice, setFindingChoice] = usePersistentState<Record<string, FindingChoice>>('sweep.findingChoice', {})
  // Apply-as-you-go ledger (chronological): each approved step is applied to the
  // model immediately and recorded here so it can be reverted individually or all
  // at once. `baseline` is the model snapshot before the sweep's first apply —
  // revert replays the kept entries' ops on top of it.
  const [ledger, setLedger] = usePersistentState<LedgerEntry[]>('sweep.ledger', [])
  const [baseline, setBaseline] = usePersistentState<Workspace | null>('sweep.baseline', null)
  // Unified "Improve my model" flow: missing fixes + review findings, then an
  // interview tail. `improveScope` grounds review/interview on the active view or
  // the whole model; `interviewOn` arms the tail; `ivApplied` marks it consumed.
  const [improveScope, setImproveScope] = usePersistentState<'view' | 'model'>('sweep.scope', 'view')
  const [interviewOn, setInterviewOn] = usePersistentState('sweep.interview', false)
  const [ivApplied, setIvApplied] = usePersistentState('sweep.ivApplied', false)
  // Queue overview: the all-steps screen with filters, jump-to-step and the
  // bulk actions. `bulkOptOut` holds fixes the user unticked from "Apply all
  // suggested" — an opt-out set, so newly drafted fixes default to included.
  const [overviewOpen, setOverviewOpen] = usePersistentState('sweep.overview', false)
  const [bulkOptOut, setBulkOptOut] = usePersistentState<Record<string, boolean>>('sweep.bulkOptOut', {})
  // Model pill starts minimal (just the status dot + gear) and expands to reveal
  // the model name on hover/focus so the header stays uncluttered.
  const [modelHover, setModelHover] = useState(false)
  // Transient (in-flight) flags — not worth persisting.
  const [draftsLoading, setDraftsLoading] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  // Deep-review failure is kept apart from `error`: without an explicit retry
  // the Improve flow would quietly continue as quick-fixes-only. The ref
  // remembers the scope the failed review ran with, so Retry re-runs the same one.
  const [reviewError, setReviewError] = useState<string | null>(null)
  const reviewScopeRef = useRef<'view' | 'model'>('view')
  // Monotonic key source for streamed findings — unique even across a retry that
  // re-streams after a partial run.
  const findingKeyRef = useRef(0)
  // Aborts the in-flight streamed review when the user hits Stop.
  const reviewAbortRef = useRef<AbortController | null>(null)
  // True while a finding's free-text "Other" fix is being turned into operations.
  const [applyBusy, setApplyBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One-line warning when the latest apply/replay skipped some operations —
  // applyEditPlan drops invalid ops rather than failing, and silently dropping
  // them reads as success.
  const [skipNotice, setSkipNotice] = useState<string | null>(null)

  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const activeView = workspace && activeViewKey ? getActiveView(workspace, activeViewKey) : undefined
  // The element + relationship ids the active view shows — the scope set for
  // "this view". `undefined` means whole-model (the 'model' scope).
  const scopeIds = useMemo(
    () => (improveScope === 'view' ? viewScopeIds(activeView) : undefined),
    [improveScope, activeView],
  )

  // Build the missing-info steps, optionally limited to a view's ids.
  function missingSteps(ws: Workspace, ids?: ReadonlySet<string>): FixStep[] {
    return missingInfoGaps(ws, ids).map((gap) => ({ type: 'fix', key: gap.key, cat: 'missing', gap }))
  }

  // Lazily draft suggested values for the missing-info gaps (descriptions via
  // auto-describe; technologies via a targeted edit). Never overwrites a value
  // the user has already typed or one already drafted.
  async function loadMissingDrafts(ws: Workspace, gaps: MissingGap[]) {
    const needDesc = gaps.some((g) => g.kind === 'desc' || g.kind === 'rel')
    const needTech = gaps.some((g) => g.kind === 'tech')
    if (!needDesc && !needTech) return
    setDraftsLoading(true)
    try {
      const tasks: Promise<void>[] = []
      // Mechanical drafts run on the cheap tier (TEA-48) — the selected model is
      // reserved for the deep review and interview.
      if (needDesc) tasks.push(autoDescribe(draftProvider, ws).then((r) => {
        setDrafts((d) => {
          const n = { ...d }
          for (const p of r.elements) { const k = `desc:${p.id}`; if (n[k] === undefined && p.description?.trim()) n[k] = p.description.trim() }
          for (const p of r.relationships) { const k = `rel:${p.id}`; if (n[k] === undefined && p.description?.trim()) n[k] = p.description.trim() }
          return n
        })
      }))
      if (needTech) tasks.push(planEdit(draftProvider, ws, TECH_INSTRUCTION).then((plan) => {
        setDrafts((d) => {
          const n = { ...d }
          for (const op of plan.operations) if (op.op === 'updateElement' && op.technology?.trim()) { const k = `tech:${op.id}`; if (n[k] === undefined) n[k] = op.technology.trim() }
          return n
        })
      }))
      const settled = await Promise.allSettled(tasks)
      // Drafting failures were previously swallowed — the user just saw empty
      // suggestion boxes with no explanation. Surface the first one; each
      // step's Rewrite button is the (targeted, cheap) retry.
      const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failed) setError(aiErrorMessage(failed.reason))
    } finally {
      setDraftsLoading(false)
    }
  }

  // Run the architecture review and append its findings to the live queue. Scope
  // 'view' grounds the review on the active view; 'model' reviews the whole model.
  async function loadReview(ws: Workspace, scope: 'view' | 'model' = 'view') {
    reviewScopeRef.current = scope
    // Drop findings from a prior (possibly partial) run so a retry re-streams clean.
    setQueue((q) => q.filter((s) => s.type !== 'finding'))
    reviewAbortRef.current?.abort()
    const ac = new AbortController()
    reviewAbortRef.current = ac
    setReviewLoading(true); setReviewError(null)
    try {
      // Stream findings into the queue as each one parses — the wizard leaves the
      // scanning screen and lets the user triage the first finding while the rest
      // are still generating (the model emits them high-severity first).
      await reviewArchitectureStream(provider, ws, scope === 'view' ? (activeView ?? null) : null, (finding) => {
        setQueue((q) => [...q, { type: 'finding', key: `f:${findingKeyRef.current++}`, cat: 'review', finding }])
      }, ac.signal)
    } catch (err) {
      // A user Stop surfaces as an AbortError — not a failure.
      if (!ac.signal.aborted && !isAbortError(err)) setReviewError(aiErrorMessage(err))
    } finally {
      if (reviewAbortRef.current === ac) { reviewAbortRef.current = null; setReviewLoading(false) }
    }
  }
  // Stop the streamed review; findings already surfaced stay in the queue.
  function cancelReview() { reviewAbortRef.current?.abort(); reviewAbortRef.current = null; setReviewLoading(false) }
  function retryReview() {
    const ws = useWorkspaceStore.getState().workspace
    if (ws && !reviewLoading) loadReview(ws, reviewScopeRef.current)
  }

  function resetSweep() { setQueue([]); setCurIdx(0); setDecisions({}); setDrafts({}); setFindingChoice({}); setLedger([]); setBaseline(null); setInterviewOn(false); setIvApplied(false); setOverviewOpen(false); setBulkOptOut({}); setError(null); setSkipNotice(null); setReviewError(null) }

  function startSweep(cats: CatId[]) {
    if (!workspace) return
    resetSweep()
    const ws = workspace
    const initial = cats.includes('missing') ? missingSteps(ws) : []
    setQueue(initial)
    setCurIdx(0)
    setView('wizard')
    if (cats.includes('missing') && initial.length) loadMissingDrafts(ws, initial.map((s) => s.gap))
    if (cats.includes('review')) loadReview(ws)
  }

  // The unified entry: instant missing-info fixes + an AI deep review, then an
  // interview tail — all in one stepped flow, applied as you go.
  function startImprove(scope: 'view' | 'model') {
    if (!workspace) return
    resetSweep()
    setImproveScope(scope)
    setInterviewOn(true)
    const ws = workspace
    // Derive the scope ids from the chosen scope NOW (setImproveScope is async, so
    // the scopeIds memo isn't updated yet this tick).
    const ids = scope === 'view' ? viewScopeIds(activeView) : undefined
    const initial = missingSteps(ws, ids)
    setQueue(initial)
    setCurIdx(0)
    setView('wizard')
    if (initial.length) loadMissingDrafts(ws, initial.map((s) => s.gap))
    loadReview(ws, scope)
  }

  // Apply the interview tail's synthesized plan through the same ledger so it's
  // revertable alongside the fixes and findings, then end the flow.
  function applyInterviewPlan(plan: EditPlan) {
    const ws = useWorkspaceStore.getState().workspace
    if (ws) {
      if (!baseline) setBaseline(ws)
      const result = applyPlanToStore(plan, ws)
      setSkipNotice(summarizeSkips(result))
      if (plan.operations.length) {
        const detail = plural(result.appliedCount, 'update', 'updates')
          + (result.skippedCount ? ` · ${result.skippedCount} skipped` : '')
        setLedger((l) => [...l, { key: 'interview', label: 'From your answers', detail, cat: 'interview', ops: plan.operations }])
      }
    }
    setIvApplied(true)
    clearAiSession('interview')
  }

  function goHome() { resetSweep(); setView('home') }

  // Honor a command-palette deep-link — on mount AND while the panel is already
  // open. Running an AI feature command (Review/Interview/ADR…) on an open panel
  // must switch the tab, not silently no-op; we consume the one-shot so it can't
  // fire again later.
  useEffect(() => {
    if (!feature) return
    if (feature === 'review') { if (workspace) startSweep(['review']) }
    else { resetSweep(); setView(FEATURE_TO_VIEW[feature]) }
    useWorkspaceStore.getState().clearAiPanelFeature()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature, workspace])

  // Mark the assistant "busy" whenever it's in a flow (anything but Home), so a
  // canvas selection won't close the panel and discard an in-progress interview
  // or staged sweep. Cleared on Home and on unmount.
  useEffect(() => {
    const store = useWorkspaceStore.getState()
    store.setAiPanelBusy(view !== 'home')
    return () => store.setAiPanelBusy(false)
  }, [view])

  // ── queue navigation ──
  const cur = view === 'wizard' && curIdx >= 0 && curIdx < queue.length ? queue[curIdx] : null
  const showOverview = view === 'wizard' && overviewOpen && queue.length > 0
  // The ledger keys — with `decisions`, what resolves each step's display state.
  const appliedKeys = useMemo(() => new Set(ledger.map((e) => e.key)), [ledger])

  function advance(key: string, status: StepStatus) {
    const next = { ...decisions, [key]: status }
    setDecisions(next)
    setCurIdx(nextUndecidedIndex(queue, curIdx + 1, next))
  }
  // Resolve the forward ops + ledger detail for the current step. A fix maps its
  // draft to one update; a finding applies the chosen option's ops, or — for a
  // free-text "Other" — runs the user's instruction through planEdit. Returns null
  // when there's nothing to apply (empty draft / empty Other / planEdit failure).
  async function resolveStep(step: Step): Promise<{ ops: EditOp[]; detail: string } | null> {
    if (step.type === 'fix') {
      const v = (drafts[step.key] ?? '').trim()
      return v ? { ops: [gapToOp(step.gap, v)], detail: v } : null
    }
    const opts = findingOptions(step.finding)
    const choice = findingChoice[step.key] ?? { idx: 0, other: '' }
    if (choice.idx === -1) {
      const text = choice.other.trim()
      const ws = useWorkspaceStore.getState().workspace
      if (!text || !ws) return null
      setApplyBusy(true)
      try {
        const plan = await planEdit(provider, ws, text)
        return plan.operations.length ? { ops: plan.operations, detail: text } : null
      } catch (err) { setError(aiErrorMessage(err)); return null }
      finally { setApplyBusy(false) }
    }
    const opt = opts[choice.idx] ?? opts[0]
    return opt ? { ops: opt.operations, detail: opt.label } : null
  }
  async function applyStep() {
    if (!cur) return
    // Mirror the disabled apply button: a fix needs a non-empty draft.
    if (cur.type === 'fix' && !(drafts[cur.key] ?? '').trim()) return
    if (cur.type === 'finding' && !isActionable(cur.finding)) { advance(cur.key, 'dismiss'); return }
    setSkipNotice(null)
    const resolved = await resolveStep(cur)
    if (!resolved || !resolved.ops.length) { if (resolved) advance(cur.key, 'apply'); return }
    const { ops, detail } = resolved
    const entry: LedgerEntry = { key: cur.key, label: cur.type === 'fix' ? cur.gap.label : cur.finding.title, detail, cat: cur.cat, ops }
    if (ledger.some((e) => e.key === cur.key)) {
      // Re-applying a revisited step: rebuild from baseline with this entry swapped
      // in, so the old effect is undone and the new one applied as ONE undo entry.
      const next = ledger.map((e) => (e.key === cur.key ? entry : e))
      rebuildFromBaseline(next)
      setLedger(next)
    } else {
      // First apply of this step — capture the pre-sweep baseline once, then apply
      // just this step incrementally (cheap; no full rebuild on the hot path).
      const ws = useWorkspaceStore.getState().workspace
      if (ws && !baseline) setBaseline(ws)
      if (ws) setSkipNotice(summarizeSkips(applyPlanToStore({ operations: ops }, ws)))
      setLedger((l) => [...l, entry])
    }
    advance(cur.key, 'apply')
  }
  // Revert is replay-from-baseline: reset the model to the pre-sweep snapshot and
  // re-apply the kept entries' forward ops as ONE undo entry. Rebuilding the exact
  // "as if only these were applied" state correctly reverses deletes, auto-created
  // views, and system-context node injections without per-op inverse bookkeeping.
  function rebuildFromBaseline(keptEntries: LedgerEntry[]) {
    const base = baseline
    if (!base) return
    const store = useWorkspaceStore.getState()
    store.setBatchApplying(true)
    try {
      store.resetWorkspaceTo(base)
      const ops = keptEntries.flatMap((e) => e.ops)
      // Replay skips are real information: a kept change whose target came from
      // a now-reverted entry quietly stops applying — say so.
      setSkipNotice(ops.length ? summarizeSkips(applyEditPlan({ operations: ops }, storeEditActions(), base)) : null)
    } finally {
      store.setBatchApplying(false)
    }
  }
  function revertEntry(key: string) {
    const next = ledger.filter((e) => e.key !== key)
    rebuildFromBaseline(next)
    setLedger(next)
    setDecisions((d) => { const n = { ...d }; delete n[key]; return n })
  }
  function revertAll() {
    if (!ledger.length) return
    rebuildFromBaseline([])
    setDecisions((d) => { const n = { ...d }; for (const e of ledger) delete n[e.key]; return n })
    setLedger([])
  }
  // Bulk-apply the given missing-info fixes (their drafted values) in ONE store
  // apply — a single undo entry — but one ledger entry PER fix, so each stays
  // individually revertable in the summary, exactly as if applied one by one.
  function bulkApplyFixes(steps: FixStep[]) {
    const ws = useWorkspaceStore.getState().workspace
    if (!ws) return
    setSkipNotice(null)
    const entries: LedgerEntry[] = []
    for (const s of steps) {
      const v = (drafts[s.key] ?? '').trim()
      if (!v || appliedKeys.has(s.key)) continue
      entries.push({ key: s.key, label: s.gap.label, detail: v, cat: 'missing', ops: [gapToOp(s.gap, v)] })
    }
    if (!entries.length) return
    if (!baseline) setBaseline(ws)
    setSkipNotice(summarizeSkips(applyPlanToStore({ operations: entries.flatMap((e) => e.ops) }, ws)))
    setLedger((l) => [...l, ...entries])
    const next = { ...decisions }
    for (const e of entries) next[e.key] = 'apply'
    setDecisions(next)
    setCurIdx((i) => nextUndecidedIndex(queue, i, next))
  }
  // Bulk-skip the given steps — decisions only, no model change.
  function bulkSkipSteps(steps: Step[]) {
    const next = { ...decisions }
    for (const s of steps) {
      if (next[s.key] || appliedKeys.has(s.key)) continue
      next[s.key] = s.type === 'finding' && !isActionable(s.finding) ? 'dismiss' : 'skip'
    }
    setDecisions(next)
    setCurIdx((i) => nextUndecidedIndex(queue, i, next))
  }
  function skipStep() { if (!cur) return; setSkipNotice(null); advance(cur.key, cur.type === 'finding' && !isActionable(cur.finding) ? 'dismiss' : 'skip') }
  // Step back to the previous question to revisit/change a decision. Drafts and
  // decisions are kept, so the earlier step shows exactly what you left.
  function goBack() { setCurIdx((i) => Math.max(0, i - 1)) }

  // ⌘↵ apply · esc skip, while stepping through the wizard.
  useEffect(() => {
    if (view !== 'wizard' || showOverview || !cur) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)
      if (e.key === 'Escape') {
        // While editing a draft, Escape just defocuses the field — it must not
        // skip the step and discard what the user is typing.
        e.preventDefault()
        e.stopPropagation()
        if (typing) { t!.blur(); return }
        skipStep()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        e.stopPropagation()
        applyStep()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cur, showOverview])

  // Esc closes the queue overview back to the stepper. Capture phase +
  // stopPropagation so it wins over DialogShell's document-level Escape
  // (which would close the whole panel) and the stepper's esc-to-skip.
  useEffect(() => {
    if (!showOverview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault(); e.stopPropagation()
      setOverviewOpen(false)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOverview])

  // Memoized — AppView re-renders on every wizard keystroke; without this each
  // one would re-walk the whole model tree via modelHealthPercent.
  const completePct = useMemo(() => (workspace ? modelHealthPercent(workspace, scopeIds) : 100), [workspace, scopeIds])

  // How many drafted fixes "Apply all suggested" would land right now (whole
  // queue, minus opt-outs) — the stepper's shortcut row shows this count.
  const bulkReady = useMemo(
    () => bulkApplyTargets(queue, 'all', decisions, appliedKeys, drafts, bulkOptOut).length,
    [queue, decisions, appliedKeys, drafts, bulkOptOut],
  )

  // A key that changes on every screen / wizard sub-state change (but NOT between
  // wizard steps — those animate per-card). Drives the body entrance animation so
  // a screen change is always visible. Step-to-step is handled by the card key.
  const screenKey = view !== 'wizard' ? view : showOverview ? 'wizard-queue' : cur ? 'wizard-step' : reviewLoading ? 'wizard-scan' : 'wizard-review'

  return (
    <>
      {/* header (drag handle) */}
      <div style={headerRow}>
        {view === 'home' ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: '1 1 auto', fontSize: 15, fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>
            <Sparkles size={17} color={C.accent} style={{ flex: 'none' }} /> AI assistant
          </span>
        ) : (
          <button onClick={goHome} className="c4ai-ghost" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 auto', height: 30, padding: '0 10px 0 7px', borderRadius: 9, border: 'none', background: 'transparent', color: C.text, fontSize: 14, fontWeight: 600, cursor: 'pointer', overflow: 'hidden' }}>
            <ArrowLeft size={16} color={C.muted} style={{ flex: 'none' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{VIEW_TITLE[view] ?? 'Back'}</span>
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
          <UsageCounterPill />
          <button onClick={onOpenSettings} title={`Connected — ${model} · open AI settings`}
            aria-label={`AI model ${shortModel(model)} — open AI settings`}
            onPointerEnter={() => setModelHover(true)} onPointerLeave={() => setModelHover(false)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: modelHover ? 5 : 4, height: 28, padding: modelHover ? '0 7px 0 9px' : '0 6px', borderRadius: 999, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.22)', fontSize: 11, fontWeight: 500, color: C.greenText, cursor: 'pointer', maxWidth: 160, overflow: 'hidden', transition: 'gap .2s ease, padding .2s ease' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, flex: 'none' }} />
            <span style={{ maxWidth: modelHover ? 130 : 0, opacity: modelHover ? 1 : 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'max-width .25s ease, opacity .2s ease' }}>{shortModel(model)}</span>
            <Settings size={11} style={{ flex: 'none', opacity: 0.85 }} />
          </button>
          <button onClick={onClose} className="c4ai-ghost" aria-label="Close" style={iconBtn}><X size={14} /></button>
        </div>
      </div>

      {/* body — keyed wrapper so every screen / sub-state change replays an
          entrance animation, making the transition unmistakable. */}
      <div data-scroll style={{ padding: '20px 20px 24px', overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* flex: 1 0 auto — fills the body when a screen is short, but grows past
            it (never shrinks) when content is tall, so the body scrolls instead
            of compressing children (which would overlap fixed-minHeight rows). */}
        <div key={screenKey} style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column', animation: 'c4ai-screen .32s cubic-bezier(0.16,1,0.3,1) both' }}>
        {view === 'home' && (
          <HomeDashboard
            workspace={workspace} completePct={completePct}
            scope={improveScope} scopeIds={scopeIds} viewName={activeView ? viewLabel(activeView) : null}
            onScope={setImproveScope}
            onImprove={startImprove}
            onDescribe={() => setView('describe')}
          />
        )}

        {view === 'wizard' && (
          showOverview ? (
            <QueueOverview
              queue={queue} curIdx={curIdx} decisions={decisions} appliedKeys={appliedKeys}
              drafts={drafts} draftsLoading={draftsLoading} reviewLoading={reviewLoading}
              optOut={bulkOptOut}
              onToggleOptOut={(key) => setBulkOptOut((m) => ({ ...m, [key]: !m[key] }))}
              onJump={(i) => { setCurIdx(i); setOverviewOpen(false) }}
              onBulkApply={bulkApplyFixes} onBulkSkip={bulkSkipSteps}
              onClose={() => setOverviewOpen(false)}
              onStopReview={cancelReview}
            />
          ) : cur ? (
            <>
              <WizardStep
                step={cur} idx={curIdx} total={queue.length}
                draft={drafts[cur.key] ?? ''} draftLoading={draftsLoading && (drafts[cur.key] ?? '') === ''}
                applied={!!ledger.find((e) => e.key === cur.key)}
                onDraft={(v) => setDrafts((d) => ({ ...d, [cur.key]: v }))}
                onRewrite={() => { if (workspace && cur.type === 'fix') return rewriteDraft(draftProvider, workspace, cur, drafts[cur.key] ?? '', setDrafts, setError) }}
                onReveal={workspace && stepElementIds(cur, workspace).length ? () => revealInDiagram(workspace, stepElementIds(cur, workspace), stepRelationshipId(cur, workspace)) : undefined}
                onBack={curIdx > 0 ? goBack : undefined}
                onApply={applyStep} onSkip={skipStep} onRevert={() => revertEntry(cur.key)}
                choice={findingChoice[cur.key]} onChoice={(c) => setFindingChoice((m) => ({ ...m, [cur.key]: c }))}
                applyBusy={applyBusy}
                onOverview={() => setOverviewOpen(true)} bulkReady={bulkReady}
              />
              {ledger.length > 0 && (
                <AppliedBar n={ledger.length} pct={completePct} onReview={() => setCurIdx(queue.length)} />
              )}
            </>
          ) : reviewLoading && workspace ? (
            <ReviewScanning workspace={workspace} scopeIds={scopeIds} scopeLabel={improveScope === 'view' ? 'this view' : null} onStop={cancelReview} />
          ) : interviewOn && !ivApplied && workspace ? (
            // Interview tail: once the instant fixes and review findings are done,
            // fold in the conversational interview, applying its plan via the ledger.
            <InterviewBody provider={provider} embedded
              onApply={applyInterviewPlan} onSkipQuestions={() => setIvApplied(true)} />
          ) : (
            <SweepSummary
              completePct={completePct} ledger={ledger}
              onRevert={revertEntry} onRevertAll={revertAll}
              onBack={queue.length > 0 ? () => setCurIdx(queue.length - 1) : undefined}
              onDone={goHome}
            />
          )
        )}
        {view === 'wizard' && (
          <>
            <Notice text={skipNotice} />
            <ErrorLine error={error} />
            <ErrorLine
              error={reviewError && !reviewLoading ? `Deep review didn’t finish — ${reviewError}` : null}
              onRetry={retryReview}
            />
          </>
        )}

        {view === 'describe' && <ComposeBody provider={provider} workspace={workspace} onClose={onClose} />}
        {view === 'interview' && (workspace ? <InterviewBody provider={provider} /> : <Empty>Open or create a workspace to start an interview.</Empty>)}
        {view === 'adr' && <AdrBody provider={provider} workspace={workspace} />}
        </div>
      </div>
    </>
  )
}

// Re-draft a single missing-info gap on demand (the wizard's "Rewrite") — one
// targeted request for just this field, not the whole-model autoDescribe/
// planEdit batches (which re-drafted EVERY gap to refresh one). Passing the
// current draft asks for a genuinely different take rather than the same
// deterministic answer, and makes Rewrite work on title gaps too.
async function rewriteDraft(
  provider: AiProvider, ws: Workspace, step: FixStep, current: string,
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  setError: (e: string | null) => void,
) {
  try {
    const { gap } = step
    const value = await suggestFieldValue(provider, ws, gap.kind, gap.targetId, current)
    if (value) setDrafts((d) => ({ ...d, [gap.key]: value }))
  } catch (err) {
    setError(aiErrorMessage(err))
  }
}

// Switch to a view that shows the element(s) and zoom in on them — the same
// reveal the search dialog uses. Keeps the AI panel open (selection alone never
// closes it; only adding elements does). For a relationship, `ids` are its two
// endpoints and `relationshipId` is set: the canvas then frames both endpoints
// (centering the edge between them) and pulses a highlight on the edge.
function revealInDiagram(ws: Workspace, ids: string[], relationshipId: string | null = null) {
  const real = ids.filter(Boolean)
  if (!real.length) return
  const s = useWorkspaceStore.getState()
  // Prefer a view that contains ALL the ids (so a relationship's edge is
  // actually drawn), falling back to any view that contains at least one.
  const views = allViewsOf(ws)
  const view = views.find((v) => real.every((id) => v.elements.some((e) => e.id === id)))
    ?? views.find((v) => v.elements.some((e) => real.includes(e.id)))
  if (view) s.setActiveView(view.key)
  // Focus an id that is actually ON the chosen view — for a relationship whose
  // endpoints don't share a view, the fallback view may hold only the
  // destination, so pinning real[0] (the source) would never resolve and the
  // canvas would frame nothing. Fall back to real[0] when no view was found.
  const focusId = (view && real.find((id) => view.elements.some((e) => e.id === id))) ?? real[0]
  // Pan AND zoom in rather than select, so the AI panel stays open (selecting
  // opens the inspector, which now closes the panel). focusZoom tells the canvas
  // to zoom-to-fit (capped) instead of merely panning. Bump the pulse nonce so a
  // repeat reveal of the SAME relationship re-triggers its highlight animation.
  useWorkspaceStore.setState((st) => ({
    focusElementId: focusId,
    focusZoom: 1.4,
    focusRelationshipId: relationshipId,
    focusRelationshipNonce: relationshipId ? st.focusRelationshipNonce + 1 : st.focusRelationshipNonce,
  }))
}
