import { useEffect, useMemo, useRef, useState } from 'react'
import { clearAiSession, ensureSessionForWorkspace, usePersistentState } from './sessionCache'
import {
  X, Loader2, Sparkles, Check,
  ArrowLeft, ArrowRight, KeyRound, ShieldCheck, ExternalLink,
  Layers, Wand2, ChevronDown,
  Type, Link2, Box, Unlink, Stethoscope, CheckCircle2, CornerDownRight, SquarePen, Settings, Star, RotateCw, Undo2, ListChecks, type LucideIcon,
} from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import { useWorkspaceStore, getActiveView } from '@/store/workspace'
import { allViewsOf } from '@/store/workspace-helpers'
import { useAiSettingsStore, useAiProvider } from '@/store/ai-settings'
import { AI_PROVIDER_META, AI_PROVIDER_IDS, type AiProviderId } from '@/lib/ai/providerMeta'
import type { Workspace } from '@/types/model'
import {
  aiErrorMessage,
  planEdit, autoDescribe, reviewArchitecture, suggestFieldValue,
  applyEditPlan, summarizeSkips, elementNameMap, flattenElements, viewLabel,
  sortedFindings, isActionable,
  missingInfoGaps, modelHealthPercent, gapToOp,
  type MissingGap,
  type AiProvider,
  type EditPlan, type EditOp, type AiFeatureId,
  type ReviewFinding,
} from '@/lib/ai'
import {
  stepElementIds, stepRelationshipId,
  stepState, stepMatchesFilter, queueFilterChips, bulkApplyTargets, bulkSkipTargets, nextUndecidedIndex,
  type Step, type FixStep, type FindingStep, type StepStatus, type QueueFilter, type QueueStepState,
} from './wizardSteps'
import {
  C, STYLE,
  headerRow, sectionLabel, wizSecBtn, describeBtn, describeIcon, iconBtn,
  fieldLabel, primaryBtn, secondaryBtn, keyInput,
} from './aiTheme'
import {
  plural, storeEditActions, applyPlanToStore,
} from './aiHelpers'
import {
  FEATURE_TO_VIEW, VIEW_TITLE, CAT, KIND, SEV, TECH_INSTRUCTION, findingOptions, viewScopeIds,
  type SweepView, type CatId, type FindingChoice, type LedgerEntry,
} from './sweepModel'
import {
  ErrorLine, Notice, Empty,
} from './aiPrimitives'
import { AdrBody } from './AdrBody'
import { ComposeBody } from './ComposeBody'
import { InterviewBody } from './InterviewBody'

export default function AiPanel({ onClose }: { onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const settings = useAiSettingsStore()
  const setStoreSettingsOpen = useWorkspaceStore((s) => s.setAiSettingsOpen)
  const storeFeature = useWorkspaceStore((s) => s.aiPanelFeature)
  const storeSettingsOpen = useWorkspaceStore((s) => s.aiSettingsOpen)

  const [settingsOpen, setSettingsOpen] = useState(false)

  const { provider, hasKey, model } = useAiProvider()

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
            provider={provider} workspace={workspace} model={model}
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
  provider, workspace, model, feature, onOpenSettings, onClose,
}: {
  provider: AiProvider
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
      if (needDesc) tasks.push(autoDescribe(provider, ws).then((r) => {
        setDrafts((d) => {
          const n = { ...d }
          for (const p of r.elements) { const k = `desc:${p.id}`; if (n[k] === undefined && p.description?.trim()) n[k] = p.description.trim() }
          for (const p of r.relationships) { const k = `rel:${p.id}`; if (n[k] === undefined && p.description?.trim()) n[k] = p.description.trim() }
          return n
        })
      }))
      if (needTech) tasks.push(planEdit(provider, ws, TECH_INSTRUCTION).then((plan) => {
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
    setReviewLoading(true); setReviewError(null)
    try {
      const result = await reviewArchitecture(provider, ws, scope === 'view' ? (activeView ?? null) : null)
      const steps: FindingStep[] = sortedFindings(result).map((finding, i) => ({ type: 'finding', key: `f:${i}`, cat: 'review', finding }))
      setQueue((q) => [...q, ...steps])
    } catch (err) {
      setReviewError(aiErrorMessage(err))
    } finally {
      setReviewLoading(false)
    }
  }
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
            />
          ) : cur ? (
            <>
              <WizardStep
                step={cur} idx={curIdx} total={queue.length}
                draft={drafts[cur.key] ?? ''} draftLoading={draftsLoading && (drafts[cur.key] ?? '') === ''}
                applied={!!ledger.find((e) => e.key === cur.key)}
                onDraft={(v) => setDrafts((d) => ({ ...d, [cur.key]: v }))}
                onRewrite={() => { if (workspace && cur.type === 'fix') return rewriteDraft(provider, workspace, cur, drafts[cur.key] ?? '', setDrafts, setError) }}
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
            <ReviewScanning workspace={workspace} scopeIds={scopeIds} scopeLabel={improveScope === 'view' ? 'this view' : null} />
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

function RevealLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="c4ai-ghost"
      style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 2px', border: 'none', background: 'transparent', color: C.accent, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
      <CornerDownRight size={13} /> Show in diagram
    </button>
  )
}

// ─── Home dashboard ─────────────────────────────────────────────────

function HomeDashboard({
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

function WizardStep({
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
  optOut, onToggleOptOut, onJump, onBulkApply, onBulkSkip, onClose,
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
          {reviewLoading ? 'Deep review running — its findings will appear here.' : 'Drafting suggestions…'}
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
function AppliedBar({ n, pct, onReview }: { n: number; pct: number; onReview: () => void }) {
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
function SweepSummary({ completePct, ledger, onRevert, onRevertAll, onBack, onDone }: {
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
function ReviewScanning({ workspace, scopeIds, scopeLabel }: { workspace: Workspace; scopeIds?: ReadonlySet<string>; scopeLabel?: string | null }) {
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
    </div>
  )
}

// ─── BYOK welcome + Settings ────────────────────────────────────────

// Simple monochrome provider marks (evocative, not official logos).
function ProviderGlyph({ id, size = 18 }: { id: AiProviderId; size?: number }) {
  if (id === 'gemini') { // Gemini — sparkle
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c.45 5.1 2.4 7.05 7.5 7.5-5.1.45-7.05 2.4-7.5 7.5-.45-5.1-2.4-7.05-7.5-7.5C9.6 9.05 11.55 7.1 12 2Z" /></svg>
  }
  if (id === 'openai') { // knot — approximated as a 6-point flower
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 3.5a3.2 3.2 0 0 1 5.3 1.4 3.2 3.2 0 0 1 1.6 5.4 3.2 3.2 0 0 1-1.6 5.4A3.2 3.2 0 0 1 12 20.5a3.2 3.2 0 0 1-5.3-1.4 3.2 3.2 0 0 1-1.6-5.4 3.2 3.2 0 0 1 1.6-5.4A3.2 3.2 0 0 1 12 3.5Z" /><circle cx="12" cy="12" r="3" /></svg>
  }
  // Anthropic — sunburst
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5M5.1 5.1l2.5 2.5M16.4 16.4l2.5 2.5M18.9 5.1l-2.5 2.5M7.6 16.4l-2.5 2.5" /><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" /></svg>
}

function ProviderPicker({ value, onPick }: { value: AiProviderId; onPick: (id: AiProviderId) => void }) {
  return (
    <div style={{ display: 'flex', gap: 7 }}>
      {AI_PROVIDER_IDS.map((id) => {
        const on = id === value
        return (
          <button key={id} onClick={() => onPick(id)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, height: 58, borderRadius: 10, fontSize: 12, cursor: 'pointer', background: on ? 'rgba(88,166,255,0.1)' : 'transparent', border: `1px solid ${on ? C.borderStrong : C.border}`, color: on ? C.text : C.muted, fontWeight: on ? 600 : 500 }}>
            <span style={{ color: on ? C.accent : C.muted2 }}><ProviderGlyph id={id} size={18} /></span>
            {AI_PROVIDER_META[id].label.replace(/^Google /, '').replace(/ \(Claude\)$/, '')}
          </button>
        )
      })}
    </div>
  )
}

function ByokWelcome({ onClose }: { onClose: () => void }) {
  const provider = useAiSettingsStore((s) => s.provider)
  const update = useAiSettingsStore((s) => s.update)
  const setApiKey = useAiSettingsStore((s) => s.setApiKey)
  const meta = AI_PROVIDER_META[provider]
  const [draft, setDraft] = useState('')
  const save = () => { if (draft.trim()) setApiKey(draft.trim()) }

  return (
    <div data-scroll style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '13px 14px 0' }}>
        <button onClick={onClose} className="c4ai-ghost" aria-label="Close" style={iconBtn}><X size={14} /></button>
      </div>
      <div style={{ padding: '6px 32px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1, justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ position: 'absolute', inset: 0, borderRadius: 18, background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.2)' }} />
          <KeyRound size={34} color={C.accent} style={{ position: 'relative' }} />
        </div>
        <h2 style={{ margin: '14px 0 0', fontSize: 20, fontWeight: 700, letterSpacing: '-.01em', color: C.text }}>Bring your own key</h2>
        <p style={{ margin: '9px 0 0', fontSize: 13, lineHeight: 1.55, color: C.muted2, maxWidth: 400 }}>AI features run on your own provider key. It stays in this browser and is sent only to the provider — c4hero has no server and never sees it.</p>
        <div style={{ width: '100%', maxWidth: 420, marginTop: 22, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={fieldLabel}>Provider</div>
            <ProviderPicker value={provider} onPick={(id) => update({ provider: id })} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={fieldLabel}>{meta.keyLabel}</div>
              <a href={meta.keyHelpUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.accent }}>Get a key <ExternalLink size={11} /></a>
            </div>
            <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }} placeholder={meta.keyPlaceholder} autoComplete="off" spellCheck={false} style={keyInput} />
          </div>
        </div>
        <button className="c4ai-pri" onClick={save} disabled={!draft.trim()}
          style={{ width: '100%', maxWidth: 420, marginTop: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 40, borderRadius: 10, border: 'none', background: C.accent, color: C.ink, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Save &amp; start <ArrowRight size={15} />
        </button>
        <SecurityNote style={{ maxWidth: 420, marginTop: 14 }} />
      </div>
    </div>
  )
}

function SettingsView({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const { enabled, provider, apiKeys, models, update, setApiKey } = useAiSettingsStore()
  const meta = AI_PROVIDER_META[provider]
  const [reveal, setReveal] = useState(false)
  const [edit, setEdit] = useState(false)
  // Edit mode works on a LOCAL draft so changes only persist on Save — Cancel
  // (or closing) must not leave a half-typed key/provider written to the store.
  const [draft, setDraft] = useState<{ provider: AiProviderId; apiKeys: Record<AiProviderId, string>; models: Record<AiProviderId, string> } | null>(null)
  const editMeta = AI_PROVIDER_META[draft?.provider ?? provider]
  function startEdit() { setDraft({ provider, apiKeys: { ...apiKeys }, models: { ...models } }); setReveal(false); setEdit(true) }
  function cancelEdit() { setDraft(null); setEdit(false) }
  function saveEdit() { if (draft) update({ provider: draft.provider, apiKeys: draft.apiKeys, models: draft.models }); setDraft(null); setEdit(false) }
  const key = apiKeys[provider] ?? ''
  const maskedKey = key.length > 10 ? `${key.slice(0, 6)}····${key.slice(-3)}` : (key ? '••••••' : '—')
  const providerName = meta.label.replace(/ \(Claude\)$/, '')
  const model = models[provider] || meta.defaultModel

  return (
    <div data-scroll style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div style={headerRow}>
        {onDone ? (
          <button onClick={onDone} className="c4ai-ghost" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 10px 0 7px', borderRadius: 9, border: 'none', background: 'transparent', color: C.text, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            <ArrowLeft size={16} color={C.muted} /> AI settings
          </button>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, fontWeight: 700, color: C.text }}><KeyRound size={16} color={C.accent} /> AI settings</span>
        )}
        <button onClick={onClose} className="c4ai-ghost" aria-label="Close" style={iconBtn}><X size={14} /></button>
      </div>
      <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!edit ? (
          <>
            {/* read-first: live connection summary */}
            <div style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, boxShadow: '0 0 6px rgba(34,197,94,0.6)' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Connected</span>
              </div>
              <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {([['Provider', providerName, false], ['Model', model, false], ['Key', maskedKey, true]] as const).map(([k, val, mono]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 12, color: C.muted }}>{k}</span>
                    <span style={{ fontSize: 12, color: C.text, fontWeight: 600, fontFamily: mono ? 'ui-monospace, monospace' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
            <button className="c4ai-sec" onClick={startEdit} style={{ height: 36, borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Change key or provider</button>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div><div style={fieldLabel}>Enable AI features</div><div style={{ fontSize: 12, color: C.muted2, marginTop: 2 }}>Show the AI assistant and its commands.</div></div>
              <button role="switch" aria-checked={enabled} onClick={() => update({ enabled: !enabled })} style={{ width: 36, height: 20, borderRadius: 999, background: enabled ? C.accent : 'rgba(255,255,255,0.16)', position: 'relative', flex: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <span style={{ position: 'absolute', top: 2, [enabled ? 'right' : 'left']: 2, width: 16, height: 16, borderRadius: '50%', background: enabled ? C.ink : C.text } as React.CSSProperties} />
              </button>
            </div>
            <SecurityNote />
            <button onClick={() => { setApiKey(''); onClose() }} style={{ height: 34, borderRadius: 10, border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: C.dangerText, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Disconnect key</button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={fieldLabel}>Provider</div>
              <ProviderPicker value={draft?.provider ?? provider} onPick={(id) => setDraft((d) => (d ? { ...d, provider: id } : d))} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ ...fieldLabel, whiteSpace: 'nowrap' }}>API key</div>
                <a href={editMeta.keyHelpUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.accent, whiteSpace: 'nowrap' }}>Get a key <ExternalLink size={11} /></a>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type={reveal ? 'text' : 'password'} value={draft ? (draft.apiKeys[draft.provider] ?? '') : ''} onChange={(e) => setDraft((d) => (d ? { ...d, apiKeys: { ...d.apiKeys, [d.provider]: e.target.value } } : d))} placeholder={editMeta.keyPlaceholder} autoComplete="off" spellCheck={false} style={keyInput} />
                <button className="c4ai-sec" onClick={() => setReveal((r) => !r)} style={{ ...secondaryBtn, height: 38, padding: '0 12px' }}>{reveal ? 'Hide' : 'Show'}</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={fieldLabel}>Model</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {editMeta.models.map((m) => {
                  const on = (draft && (draft.models[draft.provider] || editMeta.defaultModel)) === m.id
                  const recommended = m.id === editMeta.defaultModel
                  return (
                    <button key={m.id} onClick={() => setDraft((d) => (d ? { ...d, models: { ...d.models, [d.provider]: m.id } } : d))}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 38, padding: '8px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', background: on ? 'rgba(88,166,255,0.1)' : C.card, border: `1px solid ${on ? C.borderStrong : C.border}`, color: on ? C.text : C.text2, fontSize: 13, fontWeight: on ? 600 : 500 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 auto' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                        {recommended && <span style={{ flex: 'none', fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 5, background: 'rgba(88,166,255,0.16)', color: C.accent }}>Recommended</span>}
                      </span>
                      {on && <Check size={15} color={C.accent} style={{ flex: 'none' }} />}
                    </button>
                  )
                })}
              </div>
            </div>
            <SecurityNote />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="c4ai-sec" onClick={cancelEdit} style={{ ...secondaryBtn, height: 34 }}>Cancel</button>
              <button className="c4ai-pri" onClick={saveEdit} style={{ ...primaryBtn, height: 34 }}>Save</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SecurityNote({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)', ...style }}>
      <ShieldCheck size={14} color={C.accent} style={{ flex: 'none', marginTop: 1 }} />
      <span style={{ fontSize: 11.5, lineHeight: 1.45, color: C.text2 }}>Your key is stored only in this browser and sent only to the provider, directly from your device. Anyone with access to this profile can read it.</span>
    </div>
  )
}

