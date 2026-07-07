import { useEffect, useMemo, useRef, useState } from 'react'
import { ensureSessionForWorkspace, usePersistentState } from './sessionCache'
import {
  X, Sparkles, ArrowLeft, Settings, MessagesSquare, Stethoscope,
} from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import { useWorkspaceStore, getActiveView } from '@/store/workspace'
import { useAiProvider } from '@/store/ai-settings'
import type { Workspace } from '@/types/model'
import {
  aiErrorMessage,
  planEdit, autoDescribe, reviewArchitectureStream,
  applyEditPlan, summarizeSkips,
  missingInfoGaps, healthFieldCounts, gapToOp,
  type MissingGap, type ReviewFixOption,
  type AiProvider, type AiFeatureId,
} from '@/lib/ai'
import { C, STYLE, headerRow, iconBtn } from './aiTheme'
import { storeEditActions, applyPlanToStore, isAbortError } from './aiHelpers'
import {
  FEATURE_TO_VIEW, VIEW_TITLE, TECH_INSTRUCTION, viewScopeIds,
  type AiView, type FindingItem, type LedgerEntry, type ReviewUndo,
} from './sweepModel'
import { Empty } from './aiPrimitives'
import { AdrBody } from './AdrBody'
import { ChatBody } from './ChatBody'
import { ReviewBody } from './ReviewBody'
import { InterviewBody } from './InterviewBody'
import { ByokWelcome, SettingsView } from './SettingsView'

export default function AiPanel({ onClose }: { onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const setStoreSettingsOpen = useWorkspaceStore((s) => s.setAiSettingsOpen)
  const storeFeature = useWorkspaceStore((s) => s.aiPanelFeature)
  const storeSettingsOpen = useWorkspaceStore((s) => s.aiSettingsOpen)

  const [settingsOpen, setSettingsOpen] = useState(false)

  const { provider, draftProvider, hasKey, model } = useAiProvider()

  function openSettings() { setSettingsOpen(true); setStoreSettingsOpen(false) }
  function closeSettings() { setSettingsOpen(false); setStoreSettingsOpen(false) }

  // View routing: no key → BYOK welcome; settings open → settings; else app.
  // `enabled` only governs the rail launcher's visibility (see FloatingToolRail),
  // not what the panel shows once it's open — so a palette-opened panel with a
  // key always reaches the app.
  const mode: 'byok' | 'settings' | 'app' = !hasKey ? 'byok' : (settingsOpen || storeSettingsOpen) ? 'settings' : 'app'

  // A floating glass panel docked at the left of the canvas, tucked against the
  // tool rail (which carries the assistant's own launcher). Its height is
  // viewport-driven, NOT content-driven (content jumps around as answers
  // stream): it spans exactly the gap between the top pill (top 14 + 44 tall)
  // and the bottom highlighter bar (bottom 14, ~44 tall) with 12px breathing
  // room, and follows that gap on resize.
  const CHROME_GAP = 'max(70px, calc(env(safe-area-inset-top, 0px) + 64px))'
  const baseStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column',
    background: C.panel, border: `1px solid ${C.border}`,
    boxShadow: '0 16px 64px rgba(0,0,0,0.6)', overflow: 'hidden',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    width: `min(${PANEL_WIDTH}px, calc(100vw - 28px))`,
    borderRadius: 14,
    top: CHROME_GAP, bottom: 70, height: 'auto',
    left: 64, right: 'auto',
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

// The settled panel width from the design (AssistantPanel, tabs variant).
const PANEL_WIDTH = 340

/** Compact model name for the header pill (drops the vendor prefix), so it
 *  doesn't crowd the title — e.g. "claude-haiku-4-5" → "haiku-4-5". */
function shortModel(m: string): string {
  return m.replace(/^(claude-|gemini-|models\/)/, '')
}

// ─── App (Chat + Review controller) ─────────────────────────────────
//
// One panel, two tabs. Chat is a request/response thread (questions stream
// answers; change requests preview a plan before applying). Review is the
// janitor: a completeness ring, quick wins with AI-drafted values, and deep-
// review findings, with apply/skip per row plus Apply-all and Undo-last.
// Interview and ADR — inherently conversational — stay reachable via the
// command palette as their own focused screens.

function AppView({
  provider, draftProvider, workspace, model, feature, onOpenSettings, onClose,
}: {
  provider: AiProvider
  /** Cheap-tier provider for mechanical drafts (auto-describe, tech). */
  draftProvider: AiProvider
  workspace: Workspace | null
  model: string
  feature: AiFeatureId | null
  onOpenSettings: () => void
  onClose: () => void
}) {
  // Drop any cached state from a different workspace before restoring below.
  // Key the resume cache on the diagram identity (collection/workspace), not the
  // workspace name (not unique) nor the full path (it includes the active view
  // key — `/collection/:c/:ws/:view` — so a view switch would wrongly clear the
  // in-progress state). Take the first three path segments only.
  ensureSessionForWorkspace(typeof window !== 'undefined' ? window.location.pathname.split('/').slice(0, 4).join('/') : null)

  const [view, setView] = usePersistentState<AiView>('ai.view', feature ? FEATURE_TO_VIEW[feature] : 'chat')

  // ── Review state — persisted across close→reopen so the worklist resumes ──
  const [scope, setScope] = usePersistentState<'view' | 'model'>('review.scope', 'view')
  const [drafts, setDrafts] = usePersistentState<Record<string, string>>('review.drafts', {})
  const [skipped, setSkipped] = usePersistentState<Record<string, true>>('review.skipped', {})
  // Apply-as-you-go ledger (chronological): each applied row lands in the model
  // immediately and is recorded here so Undo-last can revert it. `baseline` is
  // the model snapshot before the first apply — revert replays the kept entries'
  // ops on top of it, which reverses any op kind without inverse bookkeeping.
  const [ledger, setLedger] = usePersistentState<LedgerEntry[]>('review.ledger', [])
  const [baseline, setBaseline] = usePersistentState<Workspace | null>('review.baseline', null)
  // The workspace ref produced by the last review apply/replay. "Undo last" is a
  // replay-from-baseline that would wipe any edit made outside the review since —
  // so if the live workspace has diverged from this ref (a manual canvas edit, a
  // Chat-tab apply, a freshly loaded model), the apply-undo is withheld. The ref
  // survives close→reopen (the store keeps the same workspace object), so the
  // guard holds across the whole session, not just this mount.
  const [expectedWs, setExpectedWs] = usePersistentState<Workspace | null>('review.expectedWs', null)
  const [undoStack, setUndoStack] = usePersistentState<ReviewUndo[]>('review.undo', [])
  const [findings, setFindings] = usePersistentState<FindingItem[]>('review.findings', [])
  // Which scopes a deep review has run for — turns the run CTA into "Re-run".
  const [reviewRan, setReviewRan] = usePersistentState<Record<string, boolean>>('review.ran', {})
  const [openId, setOpenId] = usePersistentState<string | null>('review.open', null)
  // Transient (in-flight) flags — not worth persisting.
  const [draftsLoading, setDraftsLoading] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // One-line warning when the latest apply/replay skipped some operations —
  // applyEditPlan drops invalid ops rather than failing, and silently dropping
  // them reads as success.
  const [skipNotice, setSkipNotice] = useState<string | null>(null)
  // Monotonic key source for streamed findings — unique even across re-runs.
  const findingKeyRef = useRef(0)
  // Aborts the in-flight streamed review when the user hits Stop.
  const reviewAbortRef = useRef<AbortController | null>(null)

  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const activeView = workspace && activeViewKey ? getActiveView(workspace, activeViewKey) : undefined
  // The element + relationship ids the active view shows — the scope set for
  // "this view". `undefined` means whole-model (the 'model' scope).
  const scopeIds = useMemo(
    () => (scope === 'view' ? viewScopeIds(activeView) : undefined),
    [scope, activeView],
  )
  const chatScopeIds = useMemo(() => viewScopeIds(activeView), [activeView])

  // ── Review derived state ──
  const appliedKeys = useMemo(() => new Set(ledger.map((e) => e.key)), [ledger])
  // Active quick wins: recomputed live from the model, so an applied fix drops
  // out on its own (the field is now filled) and reappears if it's undone.
  const activeGaps = useMemo(
    () => (workspace ? missingInfoGaps(workspace, scopeIds).filter((g) => !skipped[g.key] && !appliedKeys.has(g.key)) : []),
    [workspace, scopeIds, skipped, appliedKeys],
  )
  const activeFindings = useMemo(
    // Coalesce null→undefined to match how runReview stores viewKey (a viewless
    // workspace stores `undefined`, so the filter must compare against undefined,
    // not raw null, or it would hide every streamed finding).
    () => findings.filter((f) => f.scope === scope
      && (scope === 'model' || f.viewKey === (activeViewKey ?? undefined))
      && !skipped[f.key] && !appliedKeys.has(f.key)),
    [findings, scope, activeViewKey, skipped, appliedKeys],
  )
  const thingsCount = activeGaps.length + activeFindings.length
  const counts = useMemo(
    () => (workspace ? healthFieldCounts(workspace, scopeIds) : { filled: 0, total: 0, pct: 100 }),
    [workspace, scopeIds],
  )
  const applyAllCount = useMemo(
    () => activeGaps.filter((g) => (drafts[g.key] ?? '').trim()).length,
    [activeGaps, drafts],
  )
  // "Has a deep review run?" is per scope — and, for the view scope, per view, so
  // reviewing one view doesn't mark another as already reviewed.
  const ranKey = scope === 'view' ? `view:${activeViewKey ?? ''}` : 'model'
  // The last undo entry is an apply-revert whose replay-from-baseline would clobber
  // work done outside the review since it was applied. Withhold it when the live
  // model has diverged from what the review last produced (skip-reverts are safe —
  // they don't touch the model).
  const lastUndo = undoStack[undoStack.length - 1]
  const undoStale = !!lastUndo && lastUndo.type === 'apply' && expectedWs !== null && workspace !== expectedWs

  // ── Drafting (quick-win suggested values) ──
  // Lazily draft values for the visible gaps whenever the Review tab shows gaps
  // that have none (descriptions via auto-describe; technologies via a targeted
  // edit, both on the cheap tier). The attempt set stops a failed or empty
  // drafting run from re-firing in a loop; never overwrites an existing draft.
  const draftAttemptRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (view !== 'review' || !workspace || draftsLoading) return
    const need = activeGaps.filter((g) => (drafts[g.key] ?? '') === '' && g.kind !== 'title')
    if (!need.length) return
    const attemptKey = need.map((g) => g.key).sort().join(',')
    if (draftAttemptRef.current.has(attemptKey)) return
    draftAttemptRef.current.add(attemptKey)
    void loadDrafts(workspace, need)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, workspace, activeGaps, draftsLoading])

  async function loadDrafts(ws: Workspace, gaps: MissingGap[]) {
    const needDesc = gaps.some((g) => g.kind === 'desc' || g.kind === 'rel')
    const needTech = gaps.some((g) => g.kind === 'tech')
    if (!needDesc && !needTech) return
    setDraftsLoading(true)
    try {
      const tasks: Promise<void>[] = []
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
      const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failed) setError(aiErrorMessage(failed.reason))
    } finally {
      setDraftsLoading(false)
    }
  }

  // ── Deep review (findings) ──
  async function runReview() {
    const ws = useWorkspaceStore.getState().workspace
    if (!ws || reviewLoading) return
    const runScope = scope
    const runViewKey = runScope === 'view' ? (activeViewKey ?? undefined) : undefined
    const runRanKey = runScope === 'view' ? `view:${runViewKey ?? ''}` : 'model'
    // Drop findings from a prior run of THIS scope+view so a re-run streams clean,
    // without touching another view's still-valid findings.
    setFindings((f) => f.filter((x) => !(x.scope === runScope && (runScope === 'model' || x.viewKey === runViewKey))))
    reviewAbortRef.current?.abort()
    const ac = new AbortController()
    reviewAbortRef.current = ac
    setReviewLoading(true); setReviewError(null)
    // Track whether anything streamed, so a Stop before the first finding doesn't
    // mark the scope reviewed (which would falsely read as "Nothing to improve").
    let streamed = 0
    try {
      // Findings surface as each one parses — the user can triage the first
      // while the rest are still generating (the model emits high-severity first).
      await reviewArchitectureStream(provider, ws, runScope === 'view' ? (activeView ?? null) : null, (finding) => {
        streamed++
        setFindings((f) => [...f, { key: `f:${findingKeyRef.current++}`, scope: runScope, viewKey: runViewKey, finding }])
      }, ac.signal)
      setReviewRan((r) => ({ ...r, [runRanKey]: true }))
    } catch (err) {
      // A user Stop surfaces as an AbortError — keep what streamed, no error.
      if (!ac.signal.aborted && !isAbortError(err)) setReviewError(aiErrorMessage(err))
      else if (streamed > 0) setReviewRan((r) => ({ ...r, [runRanKey]: true }))
    } finally {
      if (reviewAbortRef.current === ac) { reviewAbortRef.current = null; setReviewLoading(false) }
    }
  }
  function stopReview() { reviewAbortRef.current?.abort(); reviewAbortRef.current = null; setReviewLoading(false) }

  // ── Apply / skip / undo ──
  function pushApplied(entry: LedgerEntry) {
    const ws = useWorkspaceStore.getState().workspace
    if (!ws) return
    if (!baseline) setBaseline(ws)
    setSkipNotice(summarizeSkips(applyPlanToStore({ operations: entry.ops }, ws)))
    setLedger((l) => [...l, entry])
    setUndoStack((u) => [...u, { type: 'apply', key: entry.key }])
    setExpectedWs(useWorkspaceStore.getState().workspace)
    setOpenId((id) => (id === entry.key ? null : id))
  }
  function applyGap(gap: MissingGap) {
    const v = (drafts[gap.key] ?? '').trim()
    if (!v) return
    pushApplied({ key: gap.key, label: gap.label, detail: v, ops: [gapToOp(gap, v)] })
  }
  function applyFinding(item: FindingItem, opt: ReviewFixOption | null) {
    if (opt && opt.operations.length) {
      pushApplied({ key: item.key, label: item.finding.title, detail: opt.label, ops: opt.operations })
    } else {
      // "Mark done" — nothing to apply; resolve the row like a skip so Undo
      // last can restore it.
      skipItem(item.key)
    }
  }
  function skipItem(key: string) {
    setSkipped((s) => ({ ...s, [key]: true }))
    setUndoStack((u) => [...u, { type: 'skip', key }])
    setOpenId((id) => (id === key ? null : id))
  }
  // Bulk-apply every drafted quick win in scope in ONE store apply — a single
  // canvas undo entry — but one ledger/undo entry PER fix, so Undo last still
  // steps back one row at a time.
  function applyAll() {
    const ws = useWorkspaceStore.getState().workspace
    if (!ws) return
    const entries: LedgerEntry[] = []
    for (const g of activeGaps) {
      const v = (drafts[g.key] ?? '').trim()
      if (v) entries.push({ key: g.key, label: g.label, detail: v, ops: [gapToOp(g, v)] })
    }
    if (!entries.length) return
    if (!baseline) setBaseline(ws)
    setSkipNotice(summarizeSkips(applyPlanToStore({ operations: entries.flatMap((e) => e.ops) }, ws)))
    setLedger((l) => [...l, ...entries])
    setUndoStack((u) => [...u, ...entries.map((e) => ({ type: 'apply' as const, key: e.key }))])
    setExpectedWs(useWorkspaceStore.getState().workspace)
    setOpenId(null)
  }
  // Revert is replay-from-baseline: reset the model to the pre-review snapshot
  // and re-apply the kept entries' forward ops as ONE undo entry. Rebuilding the
  // exact "as if only these were applied" state correctly reverses deletes and
  // auto-created views without per-op inverse bookkeeping.
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
    // Record the workspace this replay produced, so a subsequent undo can tell
    // whether the user has edited outside the review since.
    setExpectedWs(useWorkspaceStore.getState().workspace)
  }
  function undoLast() {
    if (!undoStack.length) return
    const last = undoStack[undoStack.length - 1]
    // Guard the destructive path: replaying the baseline over a diverged model
    // would wipe intervening work. The Undo button is already hidden in this
    // state (undoStale) — this is defense in depth for the keyboard/programmatic path.
    if (last.type === 'apply' && undoStale) return
    setUndoStack((u) => u.slice(0, -1))
    if (last.type === 'skip') {
      setSkipped((s) => { const n = { ...s }; delete n[last.key]; return n })
    } else {
      const next = ledger.filter((e) => e.key !== last.key)
      rebuildFromBaseline(next)
      setLedger(next)
    }
  }
  function toggleScope() {
    setScope((s) => (s === 'view' ? 'model' : 'view'))
    setOpenId(null)
  }

  // Honor a command-palette deep-link — on mount AND while the panel is already
  // open. Running an AI feature command (Review/Interview/ADR…) on an open panel
  // must switch the tab, not silently no-op; we consume the one-shot so it can't
  // fire again later.
  useEffect(() => {
    if (!feature) return
    setView(FEATURE_TO_VIEW[feature])
    // Only auto-start a (paid) review when this scope+view hasn't been reviewed
    // yet — re-invoking the palette command to reopen an existing worklist must
    // not wipe the streamed findings and re-spend tokens.
    if (feature === 'review' && workspace && !reviewLoading && !reviewRan[ranKey]) void runReview()
    useWorkspaceStore.getState().clearAiPanelFeature()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature, workspace])

  // Mark the assistant "busy" while a focused flow or in-flight AI work would be
  // lost if a canvas selection closed the panel. Cleared on unmount.
  useEffect(() => {
    const store = useWorkspaceStore.getState()
    store.setAiPanelBusy(view === 'interview' || view === 'adr' || reviewLoading || draftsLoading)
    return () => store.setAiPanelBusy(false)
  }, [view, reviewLoading, draftsLoading])

  const isTabbed = view === 'chat' || view === 'review'

  return (
    <>
      {/* header */}
      <div style={{ ...headerRow, padding: '15px 16px 13px' }}>
        {isTabbed ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: '1 1 auto', fontSize: 15, fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>
            <Sparkles size={17} color={C.accent} style={{ flex: 'none' }} /> AI assistant
          </span>
        ) : (
          <button onClick={() => setView('chat')} className="c4ai-ghost" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '1 1 auto', height: 30, padding: '0 10px 0 7px', borderRadius: 9, border: 'none', background: 'transparent', color: C.text, fontSize: 14, fontWeight: 600, cursor: 'pointer', overflow: 'hidden' }}>
            <ArrowLeft size={16} color={C.muted} style={{ flex: 'none' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{VIEW_TITLE[view] ?? 'Back'}</span>
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
          <button onClick={onOpenSettings} title={`Connected — ${model} · open AI settings`}
            aria-label={`AI model ${shortModel(model)} — open AI settings`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 7px 0 9px', borderRadius: 999, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.22)', fontSize: 10.5, fontWeight: 500, color: C.greenText, cursor: 'pointer', maxWidth: 160, overflow: 'hidden' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, flex: 'none' }} />
            <span style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortModel(model)}</span>
            <Settings size={11} style={{ flex: 'none', opacity: 0.85 }} />
          </button>
          <button onClick={onClose} className="c4ai-ghost" aria-label="Close" style={{ ...iconBtn, width: 26, height: 26 }}><X size={14} /></button>
        </div>
      </div>

      {/* tab switcher */}
      {isTabbed && (
        <div style={{ padding: '11px 16px 0', flex: 'none' }}>
          <div role="tablist" style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 10, background: C.ink, border: `1px solid ${C.border}` }}>
            <TabBtn active={view === 'chat'} onClick={() => setView('chat')} label="Chat" icon={<MessagesSquare size={13} />} />
            <TabBtn active={view === 'review'} onClick={() => setView('review')} label="Review" icon={<Stethoscope size={13} />}
              badge={workspace ? thingsCount : undefined} />
          </div>
        </div>
      )}

      {/* body */}
      {view === 'chat' && (
        <div key="chat" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', animation: 'c4ai-screen .32s cubic-bezier(0.16,1,0.3,1) both' }}>
          <ChatBody provider={provider} workspace={workspace} scopeIds={chatScopeIds} onClose={onClose} />
        </div>
      )}
      {view === 'review' && (
        <div key="review" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', animation: 'c4ai-screen .32s cubic-bezier(0.16,1,0.3,1) both' }}>
          {workspace ? (
            <ReviewBody
              workspace={workspace} scopeIds={scopeIds}
              scope={scope} onToggleScope={toggleScope}
              counts={counts} thingsCount={thingsCount}
              gaps={activeGaps} drafts={drafts} draftsLoading={draftsLoading}
              findings={activeFindings} reviewRan={!!reviewRan[ranKey]} reviewLoading={reviewLoading}
              reviewError={reviewError} onRunReview={() => void runReview()} onStopReview={stopReview}
              openId={openId} onToggleRow={(key) => setOpenId((id) => (id === key ? null : key))}
              onApplyGap={applyGap} onApplyFinding={applyFinding} onSkip={skipItem}
              applyAllCount={applyAllCount} onApplyAll={applyAll}
              appliedCount={ledger.length} canUndoLast={undoStack.length > 0} undoStale={undoStale} onUndoLast={undoLast}
              skipNotice={skipNotice} error={error}
            />
          ) : (
            <div style={{ padding: '18px 20px' }}><Empty>Open or create a workspace, then I can review it with you.</Empty></div>
          )}
        </div>
      )}
      {(view === 'interview' || view === 'adr') && (
        <div key={view} data-scroll style={{ padding: '20px 20px 24px', overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column', animation: 'c4ai-screen .32s cubic-bezier(0.16,1,0.3,1) both' }}>
            {view === 'interview' && (workspace ? <InterviewBody provider={provider} /> : <Empty>Open or create a workspace to start an interview.</Empty>)}
            {view === 'adr' && <AdrBody provider={provider} workspace={workspace} />}
          </div>
        </div>
      )}
    </>
  )
}

function TabBtn({ active, onClick, label, icon, badge }: {
  active: boolean; onClick: () => void; label: string; icon: React.ReactNode; badge?: number
}) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick}
      style={{ flex: 1, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 7, border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: active ? 'rgba(88,166,255,0.16)' : 'transparent', color: active ? C.accent : C.muted }}>
      {icon} {label}
      {badge !== undefined && (
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 6, background: active ? 'rgba(88,166,255,0.2)' : 'rgba(139,148,158,0.16)', color: active ? C.accent : C.muted }}>{badge}</span>
      )}
    </button>
  )
}
