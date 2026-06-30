import { useEffect, useMemo, useRef, useState } from 'react'
import { clearAiSession, ensureSessionForWorkspace, usePersistentState } from './sessionCache'
import {
  X, Loader2, Sparkles, Check, Copy, Download, AlertCircle,
  ArrowLeft, ArrowRight, KeyRound, ShieldCheck, ExternalLink,
  Pencil, Layers, Wand2, Folder, GitBranch, FileCode, ChevronRight, ChevronDown, HelpCircle,
  Activity, Cpu, Type, Link2, Box, Unlink, Stethoscope, MessagesSquare, CheckCircle2, CornerDownRight, SquarePen, Settings, Star, RotateCw, Undo2, type LucideIcon,
} from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import { useWorkspaceStore, getActiveView, getScopeMemberIds } from '@/store/workspace'
import { allViewsOf } from '@/store/workspace-helpers'
import { useAiSettingsStore, isAiReady, activeAiConfig, type PanelPos } from '@/store/ai-settings'
import { AI_PROVIDER_META, AI_PROVIDER_IDS, type AiProviderId } from '@/lib/ai/providerMeta'
import { parseDSL } from '@/lib/dsl'
import { downloadFile } from '@/lib/exportUtils'
import type { View, Workspace } from '@/types/model'
import {
  createProvider, aiErrorMessage,
  generateDiagram, planEdit, autoDescribe, reviewArchitecture, draftAdr, detectComposeMode,
  interviewAsk, interviewKickoffMessage, interviewBuildPlan,
  scanRepo, canScanRepo, readRepoFiles, buildRepoBundle,
  applyEditPlan, describeOps, elementNameMap, flattenElements, viewLabel,
  sortedFindings, isActionable, classifyScope,
  missingInfoGaps, modelHealthPercent, gapToOp,
  type MissingGap, type GapKind,
  type AiProvider, type EditActions,
  type EditPlan, type EditOp, type AiFeatureId, type AiChatTurn,
  type ReviewFinding, type ReviewSeverity, type RepoScanResult, type PlanScope,
} from '@/lib/ai'
import { MicButton } from './dictation'

// ─── Palette (the "AI Assistant Hybrid" design) ─────────────────────

const C = {
  accent: '#58a6ff', accentHover: '#79b8ff', ink: '#0d1117',
  text: '#e6edf3', text2: '#c9d1d9', muted: '#8b949e', muted2: '#848d97', muted3: '#6e7681',
  // Match the floating chrome (top pill / tool rail / bottom strip) — they all
  // use the heavy glass surface, so the assistant reads as part of the same set.
  panel: 'var(--glass-bg-heavy)', card: '#161b22',
  border: 'rgba(88,166,255,0.16)', borderStrong: 'rgba(88,166,255,0.45)',
  green: '#22c55e', greenText: '#86efac',
  danger: '#ef4444', dangerText: '#fca5a5',
  warn: '#f97316', warnText: '#fdba74',
}


const STYLE = `
.c4ai [data-scroll]{scrollbar-width:thin;scrollbar-color:rgba(88,166,255,0.28) transparent}
.c4ai [data-scroll]::-webkit-scrollbar{width:10px;height:10px}
.c4ai [data-scroll]::-webkit-scrollbar-thumb{background:rgba(88,166,255,0.22);border-radius:999px;border:3px solid transparent;background-clip:padding-box}
.c4ai-pri:hover{background:${C.accentHover}!important}
.c4ai-ghost:hover{background:rgba(255,255,255,0.06)!important;color:${C.text}!important}
.c4ai-sec:hover{background:rgba(255,255,255,0.05)!important}
.c4ai-card:hover{border-color:${C.borderStrong}!important;background:#1c2128!important}
@keyframes c4ai-fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes c4ai-rise{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:none}}
@keyframes c4ai-result{from{opacity:0;transform:translateY(16px) scale(.985)}to{opacity:1;transform:none}}
@keyframes c4ai-stagger{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes c4ai-screen{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes c4ai-next{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}
@keyframes c4ai-node{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes c4ai-flow{to{stroke-dashoffset:-14}}
@keyframes c4ai-radar{to{transform:rotate(360deg)}}
@keyframes c4ai-ping{0%,72%,100%{opacity:.4;transform:scale(.78)}82%{opacity:1;transform:scale(1.22)}}
@keyframes c4ai-pop{0%{opacity:0;transform:scale(0)}65%{opacity:1;transform:scale(1.2)}100%{opacity:1;transform:scale(1)}}
@keyframes c4ai-ringpulse{0%{opacity:.5;transform:scale(.7)}100%{opacity:0;transform:scale(1.25)}}
@keyframes c4ai-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}
.c4ai-node{transform-box:fill-box;transform-origin:center;animation:c4ai-node 1.7s ease-in-out infinite}
.c4ai-edge{stroke-dasharray:3 5;animation:c4ai-flow .9s linear infinite}
.c4ai-ping{transform-box:fill-box;transform-origin:center;animation:c4ai-ping 2.8s cubic-bezier(.4,0,.2,1) infinite}
.c4ai-pop{transform-box:fill-box;transform-origin:center;animation:c4ai-pop .5s cubic-bezier(.34,1.56,.64,1) both}
`

export default function AiPanel({ onClose }: { onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const settings = useAiSettingsStore()
  const setStoreSettingsOpen = useWorkspaceStore((s) => s.setAiSettingsOpen)

  const [initialFeature] = useState(() => useWorkspaceStore.getState().aiPanelFeature)
  const [settingsOpen, setSettingsOpen] = useState(() => useWorkspaceStore.getState().aiSettingsOpen)

  const { provider: providerId, apiKey, model } = activeAiConfig(settings)
  const hasKey = apiKey.trim().length > 0
  const ready = isAiReady(settings)
  const provider = useMemo(
    () => (ready ? createProvider(providerId, { apiKey, model }) : null),
    [ready, providerId, apiKey, model],
  )

  function openSettings() { setSettingsOpen(true); setStoreSettingsOpen(false) }
  function closeSettings() { setSettingsOpen(false); setStoreSettingsOpen(false) }

  // View routing: no key → BYOK welcome; disabled or settings open → settings; else app.
  const mode: 'byok' | 'settings' | 'app' = !hasKey ? 'byok' : (settingsOpen || !settings.enabled) ? 'settings' : 'app'

  // Draggable floating panel. `pos` is the persisted top-left; null = default
  // top-right anchor. Dragging starts on any element marked [data-drag-handle].
  // The stored position is clamped to the current viewport so a panel dragged on
  // a big screen never lands off-screen on a smaller one.
  const [pos, setPos] = useState<PanelPos | null>(
    () => (settings.panelPos ? clampPanelPos(settings.panelPos, window.innerWidth, window.innerHeight) : null),
  )

  // On resize keep a dragged panel on-screen and inside the top/bottom band, and
  // hold its distance from the *right* edge constant (the panel docks near the
  // right, so it should track that edge rather than drift as the width changes).
  const lastW = useRef(window.innerWidth)
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const prevW = lastW.current
      lastW.current = w
      setPos((p) => {
        if (!p) return p
        const rightGap = prevW - (p.x + PANEL_WIDTH)
        return clampPanelPos({ x: w - PANEL_WIDTH - rightGap, y: p.y }, w, h)
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function startDrag(e: React.PointerEvent) {
    const t = e.target as HTMLElement
    if (t.closest('button, input, textarea, a, select, [role="switch"]')) return
    if (!t.closest('[data-drag-handle]')) return
    const base = pos ?? { x: Math.max(EDGE, window.innerWidth - PANEL_WIDTH - 14), y: TOP_INSET }
    const startX = e.clientX
    const startY = e.clientY
    let latest = base
    const move = (ev: PointerEvent) => {
      latest = clampPanelPos({ x: base.x + ev.clientX - startX, y: base.y + ev.clientY - startY }, window.innerWidth, window.innerHeight)
      setPos(latest)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      useAiSettingsStore.getState().update({ panelPos: latest })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    e.preventDefault()
  }

  const baseStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column',
    background: C.panel, border: `1px solid ${C.border}`,
    boxShadow: '0 16px 64px rgba(0,0,0,0.6)', overflow: 'hidden',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    width: `min(${PANEL_WIDTH}px, calc(100vw - 28px))`,
    borderRadius: 12,
    // Default anchor: top-right, vertically inset to sit *between* the floating
    // top pill (top:14, h44) and the bottom-right zoom HUD (bottom:14, h~44),
    // shrinking to fit on smaller screens. Once dragged, switch to an explicit
    // top-left with a capped height. `bottom: auto` (drag case) overrides
    // DialogShell's docked full-height rail.
    ...(pos
      ? { top: pos.y, bottom: 'auto', height: `min(${MAX_PANEL_H}px, calc(100dvh - ${TOP_INSET + BOTTOM_INSET}px))`, left: pos.x, right: 'auto' }
      : {
          top: 'max(64px, calc(env(safe-area-inset-top, 0px) + 58px))',
          bottom: 'max(72px, calc(env(safe-area-inset-bottom, 0px) + 66px))',
          height: 'auto', right: 14,
        }),
  }

  return (
    <DialogShell
      onClose={onClose}
      ariaLabel="AI assistant"
      className="c4ai"
      position="docked"
      style={baseStyle}
    >
      <div onPointerDown={startDrag} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <style>{STYLE}</style>

        {mode === 'byok' && <ByokWelcome onClose={onClose} />}
        {mode === 'settings' && <SettingsView onClose={onClose} onDone={hasKey ? closeSettings : undefined} />}
        {mode === 'app' && provider && (
          <AppView
            provider={provider} workspace={workspace} model={model}
            initialFeature={initialFeature} onOpenSettings={openSettings} onClose={onClose}
          />
        )}
      </div>
    </DialogShell>
  )
}

const PANEL_WIDTH = 360

/** Compact model name for the header pill (drops the vendor prefix), so it
 *  doesn't crowd the view title — e.g. "claude-haiku-4-5" → "haiku-4-5". */
function shortModel(m: string): string {
  return m.replace(/^(claude-|gemini-|models\/)/, '')
}
const EDGE = 8            // min gap to the viewport edge
const TOP_INSET = 64     // clears the floating top pill (top:14 + h44)
const BOTTOM_INSET = 72  // clears the bottom-right zoom HUD
const MAX_PANEL_H = 820  // cap so it doesn't get absurdly tall on big screens

function clampPx(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max))
}

/** Escape a string for safe use inside a RegExp (element names can contain
 *  regex metacharacters like dots or parens). */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Height a dragged panel occupies: the top↔bottom band, capped, never negative. */
function panelBandHeight(viewportH: number): number {
  return Math.min(MAX_PANEL_H, Math.max(160, viewportH - TOP_INSET - BOTTOM_INSET))
}

/** Clamp a dragged top-left so the panel stays fully on-screen and within the
 *  top/bottom band, whatever the current viewport size. */
function clampPanelPos(p: PanelPos, viewportW: number, viewportH: number): PanelPos {
  const maxX = Math.max(EDGE, viewportW - PANEL_WIDTH - EDGE)
  const maxY = Math.max(TOP_INSET, viewportH - BOTTOM_INSET - panelBandHeight(viewportH))
  return { x: clampPx(p.x, EDGE, maxX), y: clampPx(p.y, TOP_INSET, maxY) }
}

// ─── App (guided-sweep controller) ──────────────────────────────────
//
// One AI assistant, one guided flow. The Home dashboard funnels everything into
// a step-by-step wizard over a merged queue (instant missing-info fixes + AI
// review findings), a batch-review screen, and a commit. Interview and repo —
// inherently conversational / folder-driven — are reachable from the dashboard
// as their own focused flows (existing InterviewBody / RepoBody).

type SweepView = 'home' | 'wizard' | 'describe' | 'interview' | 'repo' | 'adr'

const FEATURE_TO_VIEW: Record<AiFeatureId, SweepView> = {
  compose: 'describe', interview: 'interview', review: 'wizard', repo: 'repo', adr: 'adr',
}

const VIEW_TITLE: Partial<Record<SweepView, string>> = {
  wizard: 'Guided cleanup',
  describe: 'Describe', interview: 'Interview', repo: 'From your code', adr: 'Draft ADR',
}

// Per-category presentation (matches the imported design's palette).
type CatId = 'missing' | 'review' | 'interview'
const CAT: Record<CatId, { label: string; sub: string; icon: LucideIcon; color: string; bg: string; iconBg: string }> = {
  missing: { label: 'Missing info', sub: 'Titles, descriptions and technologies', icon: Wand2, color: C.accent, bg: 'rgba(88,166,255,0.16)', iconBg: 'rgba(88,166,255,0.1)' },
  review: { label: 'Deep review', sub: 'Orphans, untyped links, naming', icon: Stethoscope, color: C.warn, bg: 'rgba(249,115,22,0.16)', iconBg: 'rgba(249,115,22,0.1)' },
  interview: { label: 'Your answers', sub: 'From the interview questions', icon: MessagesSquare, color: '#a78bfa', bg: 'rgba(168,85,247,0.16)', iconBg: 'rgba(168,85,247,0.1)' },
}

// Icon + label per missing-info kind.
const KIND: Record<GapKind, { icon: LucideIcon; label: string; prompt: string }> = {
  title: { icon: Type, label: 'title', prompt: 'Still has a placeholder name.' },
  desc: { icon: Pencil, label: 'description', prompt: 'This element has no description.' },
  tech: { icon: Cpu, label: 'technology', prompt: 'No technology is set.' },
  rel: { icon: Link2, label: 'label', prompt: 'This relationship is untyped.' },
}

const SEV: Record<ReviewSeverity, { label: string; bg: string; color: string }> = {
  high: { label: 'High', bg: 'rgba(239,68,68,0.12)', color: C.dangerText },
  medium: { label: 'Medium', bg: 'rgba(249,115,22,0.12)', color: C.warnText },
  low: { label: 'Low', bg: 'rgba(132,141,151,0.14)', color: '#9aa3ad' },
}

// Instruction reused to draft technologies for the missing-info "tech" gaps.
const TECH_INSTRUCTION = 'Set a plausible technology for every container and component that currently has none, inferred from its name, description, and the rest of the model. Only set technology — do not rename, add, or remove anything.'

type StepStatus = 'apply' | 'skip' | 'dismiss'
interface FixStep { type: 'fix'; key: string; cat: 'missing'; gap: MissingGap }
interface FindingStep { type: 'finding'; key: string; cat: 'review'; finding: ReviewFinding }
type Step = FixStep | FindingStep

// One applied change in the guided flow's revert ledger. We store the forward ops
// (not an inverse): revert rebuilds the model by replaying the kept entries' ops on
// top of the pre-sweep baseline, so reversal is always exact regardless of op kind.
interface LedgerEntry { key: string; label: string; detail: string; cat: CatId; ops: EditOp[] }

/** The element + relationship ids a view shows — the scope set for "this view".
 *  `undefined` when there's no view (treated as whole-model). */
function viewScopeIds(view: View | undefined): ReadonlySet<string> | undefined {
  if (!view) return undefined
  return new Set<string>([...view.elements.map((e) => e.id), ...view.relationships.map((r) => r.id)])
}

function AppView({
  provider, workspace, model, initialFeature, onOpenSettings, onClose,
}: {
  provider: AiProvider
  workspace: Workspace | null
  model: string
  initialFeature: AiFeatureId | null
  onOpenSettings: () => void
  onClose: () => void
}) {
  // Drop any cached flow from a different workspace before restoring below.
  // Key the resume cache on the diagram identity (collection/workspace), not the
  // workspace name (not unique) nor the full path (it includes the active view
  // key — `/collection/:c/:ws/:view` — so a view switch would wrongly clear the
  // in-progress flow). Take the first three path segments only.
  ensureSessionForWorkspace(typeof window !== 'undefined' ? window.location.pathname.split('/').slice(0, 4).join('/') : null)
  const [view, setView] = usePersistentState<SweepView>('sweep.view', initialFeature ? FEATURE_TO_VIEW[initialFeature] : 'home')

  // Sweep state — persisted across close→reopen so an in-progress wizard resumes.
  const [queue, setQueue] = usePersistentState<Step[]>('sweep.queue', [])
  const [curIdx, setCurIdx] = usePersistentState('sweep.curIdx', 0)
  const [decisions, setDecisions] = usePersistentState<Record<string, StepStatus>>('sweep.decisions', {})
  const [drafts, setDrafts] = usePersistentState<Record<string, string>>('sweep.drafts', {})
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
  // Transient (in-flight) flags — not worth persisting.
  const [draftsLoading, setDraftsLoading] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      await Promise.allSettled(tasks)
    } finally {
      setDraftsLoading(false)
    }
  }

  // Run the architecture review and append its findings to the live queue. Scope
  // 'view' grounds the review on the active view; 'model' reviews the whole model.
  async function loadReview(ws: Workspace, scope: 'view' | 'model' = 'view') {
    setReviewLoading(true); setError(null)
    try {
      const result = await reviewArchitecture(provider, ws, scope === 'view' ? (activeView ?? null) : null)
      const steps: FindingStep[] = sortedFindings(result).map((finding, i) => ({ type: 'finding', key: `f:${i}`, cat: 'review', finding }))
      setQueue((q) => [...q, ...steps])
    } catch (err) {
      setError(aiErrorMessage(err))
    } finally {
      setReviewLoading(false)
    }
  }

  function resetSweep() { setQueue([]); setCurIdx(0); setDecisions({}); setDrafts({}); setLedger([]); setBaseline(null); setInterviewOn(false); setIvApplied(false); setError(null) }

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
      applyPlanToStore(plan, ws)
      if (plan.operations.length) {
        setLedger((l) => [...l, { key: 'interview', label: 'From your answers', detail: plural(plan.operations.length, 'update', 'updates'), cat: 'interview', ops: plan.operations }])
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
  const storeFeature = useWorkspaceStore((s) => s.aiPanelFeature)
  useEffect(() => {
    if (!storeFeature) return
    if (storeFeature === 'review') { if (workspace) startSweep(['review']) }
    else { resetSweep(); setView(FEATURE_TO_VIEW[storeFeature]) }
    useWorkspaceStore.getState().clearAiPanelFeature()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeFeature, workspace])

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

  function advance(key: string, status: StepStatus) {
    const next = { ...decisions, [key]: status }
    setDecisions(next)
    let i = curIdx + 1
    while (i < queue.length && next[queue[i].key]) i++
    setCurIdx(i)
  }
  // The forward ops a step applies — a fix's single update, or a finding's ops.
  function stepOps(step: Step, draft: string): EditOp[] {
    return step.type === 'fix'
      ? (draft.trim() ? [gapToOp(step.gap, draft.trim())] : [])
      : (step.finding.operations ?? [])
  }
  function entryFor(step: Step, draft: string, ops: EditOp[]): LedgerEntry {
    return {
      key: step.key,
      label: step.type === 'fix' ? step.gap.label : step.finding.title,
      detail: step.type === 'fix' ? (draft.trim() || '(cleared)') : step.finding.suggestion,
      cat: step.cat, ops,
    }
  }
  function applyStep() {
    if (!cur) return
    // Mirror the disabled apply button: a fix needs a non-empty draft.
    if (cur.type === 'fix' && !(drafts[cur.key] ?? '').trim()) return
    if (cur.type === 'finding' && !isActionable(cur.finding)) { advance(cur.key, 'dismiss'); return }
    const ops = stepOps(cur, drafts[cur.key] ?? '')
    if (!ops.length) { advance(cur.key, 'apply'); return }
    const entry = entryFor(cur, drafts[cur.key] ?? '', ops)
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
      if (ws) applyPlanToStore({ operations: ops }, ws)
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
      if (ops.length) applyEditPlan({ operations: ops }, storeEditActions(), base)
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
  function skipStep() { if (cur) advance(cur.key, cur.type === 'finding' && !isActionable(cur.finding) ? 'dismiss' : 'skip') }
  // Step back to the previous question to revisit/change a decision. Drafts and
  // decisions are kept, so the earlier step shows exactly what you left.
  function goBack() { setCurIdx((i) => Math.max(0, i - 1)) }

  // ⌘↵ apply · esc skip, while stepping through the wizard.
  useEffect(() => {
    if (view !== 'wizard' || !cur) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)
      if (e.key === 'Escape') {
        // While editing a draft, Escape just defocuses the field — it must not
        // skip the step and discard what the user is typing.
        if (typing) { t!.blur(); return }
        e.preventDefault(); skipStep()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); applyStep() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cur])

  // Memoized — AppView re-renders on every wizard keystroke; without this each
  // one would re-walk the whole model tree via modelHealthPercent.
  const completePct = useMemo(() => (workspace ? modelHealthPercent(workspace, scopeIds) : 100), [workspace, scopeIds])

  // A key that changes on every screen / wizard sub-state change (but NOT between
  // wizard steps — those animate per-card). Drives the body entrance animation so
  // a screen change is always visible. Step-to-step is handled by the card key.
  const screenKey = view !== 'wizard' ? view : cur ? 'wizard-step' : reviewLoading ? 'wizard-scan' : 'wizard-review'

  return (
    <>
      {/* header (drag handle) */}
      <div data-drag-handle style={{ ...headerRow, cursor: 'move' }}>
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
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 7px 0 9px', borderRadius: 999, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.22)', fontSize: 11, fontWeight: 500, color: C.greenText, cursor: 'pointer', maxWidth: 138, overflow: 'hidden' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, flex: 'none' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortModel(model)}</span>
            <Settings size={11} style={{ flex: 'none', opacity: 0.85 }} />
          </button>
          <button onClick={onClose} className="c4ai-ghost" aria-label="Close" style={iconBtn}><X size={14} /></button>
        </div>
      </div>

      {/* body — keyed wrapper so every screen / sub-state change replays an
          entrance animation, making the transition unmistakable. */}
      <div data-scroll style={{ padding: '20px 20px 24px', overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div key={screenKey} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', animation: 'c4ai-screen .32s cubic-bezier(0.16,1,0.3,1) both' }}>
        {view === 'home' && (
          <HomeDashboard
            workspace={workspace} completePct={completePct}
            scope={improveScope} scopeIds={scopeIds} viewName={activeView ? viewLabel(activeView) : null}
            onScope={setImproveScope}
            onImprove={startImprove}
            onDescribe={() => setView('describe')}
            onRepo={() => setView('repo')}
          />
        )}

        {view === 'wizard' && (
          cur ? (
            <>
              <WizardStep
                step={cur} idx={curIdx} total={queue.length}
                draft={drafts[cur.key] ?? ''} draftLoading={draftsLoading && (drafts[cur.key] ?? '') === ''}
                applied={!!ledger.find((e) => e.key === cur.key)}
                onDraft={(v) => setDrafts((d) => ({ ...d, [cur.key]: v }))}
                onRewrite={() => { if (workspace && cur.type === 'fix') return rewriteDraft(provider, workspace, cur, setDrafts, setError) }}
                onReveal={workspace && stepElementIds(cur, workspace).length ? () => revealInDiagram(workspace, stepElementIds(cur, workspace)) : undefined}
                onBack={curIdx > 0 ? goBack : undefined}
                onApply={applyStep} onSkip={skipStep} onRevert={() => revertEntry(cur.key)}
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
            <InterviewBody provider={provider} onClose={onClose} embedded
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
        {view === 'wizard' && <ErrorLine error={error} />}

        {view === 'describe' && <ComposeBody provider={provider} workspace={workspace} onClose={onClose} />}
        {view === 'interview' && (workspace ? <InterviewBody provider={provider} onClose={onClose} /> : <Empty>Open or create a workspace to start an interview.</Empty>)}
        {view === 'repo' && <RepoBody provider={provider} workspace={workspace} onClose={onClose} />}
        {view === 'adr' && <AdrBody provider={provider} workspace={workspace} />}
        </div>
      </div>
    </>
  )
}

// Re-draft a single missing-info gap on demand (the wizard's "Rewrite").
async function rewriteDraft(
  provider: AiProvider, ws: Workspace, step: FixStep,
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  setError: (e: string | null) => void,
) {
  try {
    const { gap } = step
    if (gap.kind === 'desc' || gap.kind === 'rel') {
      const r = await autoDescribe(provider, ws)
      const list = gap.kind === 'desc' ? r.elements : r.relationships
      const hit = list.find((p) => p.id === gap.targetId)
      if (hit?.description?.trim()) setDrafts((d) => ({ ...d, [gap.key]: hit.description.trim() }))
    } else if (gap.kind === 'tech') {
      const plan = await planEdit(provider, ws, TECH_INSTRUCTION)
      const op = plan.operations.find((o) => o.op === 'updateElement' && o.id === gap.targetId && o.technology?.trim())
      if (op && op.op === 'updateElement' && op.technology) setDrafts((d) => ({ ...d, [gap.key]: op.technology!.trim() }))
    }
  } catch (err) {
    setError(aiErrorMessage(err))
  }
}

// The element id(s) a step refers to, for revealing them on the canvas. A
// relationship gap resolves to its two endpoints.
function stepElementIds(step: Step, ws: Workspace): string[] {
  if (step.type === 'finding') return step.finding.elementIds ?? []
  const g = step.gap
  if (g.kind === 'rel') {
    const r = ws.model.relationships.find((x) => x.id === g.targetId)
    return r ? [r.sourceId, r.destinationId] : []
  }
  return [g.targetId]
}

// Switch to a view that shows the element(s) and select them — the same reveal
// the search dialog uses. Keeps the AI panel open (selection alone never closes
// it; only adding elements does).
function revealInDiagram(ws: Workspace, ids: string[]) {
  const real = ids.filter(Boolean)
  if (!real.length) return
  const s = useWorkspaceStore.getState()
  const view = allViewsOf(ws).find((v) => v.elements.some((e) => real.includes(e.id)))
  if (view) s.setActiveView(view.key)
  // Pan AND zoom in on the element rather than select it, so the AI panel stays
  // open (selecting opens the inspector, which now closes the panel). focusZoom
  // tells the canvas to zoom-to-fit the node (capped) instead of merely panning.
  useWorkspaceStore.setState({ focusElementId: real[0], focusZoom: 1.4 })
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
  workspace, completePct, scope, scopeIds, viewName, onScope, onImprove, onDescribe, onRepo,
}: {
  workspace: Workspace | null
  completePct: number
  scope: 'view' | 'model'
  scopeIds: ReadonlySet<string> | undefined
  viewName: string | null
  onScope: (s: 'view' | 'model') => void
  onImprove: (s: 'view' | 'model') => void
  onDescribe: () => void
  onRepo: () => void
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
      {/* Health */}
      <div style={{ padding: '12px 14px', borderRadius: 13, border: `1px solid ${C.border}`, background: 'linear-gradient(165deg, #1a222e, #161b22)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: C.text2 }}><Activity size={14} color={C.accent} /> Health</span>
            <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: C.muted3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scopeContext}</span>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none', fontSize: 22, fontWeight: 800, color: allClear ? '#facc15' : C.text, letterSpacing: '-.02em' }}>
            {allClear && <Star size={15} fill="#facc15" color="#facc15" />}
            {completePct}<span style={{ fontSize: 12, color: allClear ? '#facc15' : C.muted, fontWeight: 600 }}>%</span>
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
        <CategoryButton icon={GitBranch} color={C.green} iconBg="rgba(34,197,94,0.1)" label="From your code" sub="Point at a local repo — propose updates" onClick={onRepo} />
      </div>
    </>
  )
}


function CategoryButton({ icon: Icon, color, iconBg, label, sub, onClick }: { icon: LucideIcon; color: string; iconBg: string; label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="c4ai-card"
      style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 13, padding: '14px 15px', borderRadius: 13, border: `1px solid ${C.border}`, background: C.card, cursor: 'pointer' }}>
      <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: iconBg, color }}><Icon size={19} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.text }}>{label}</span>
        <span style={{ display: 'block', fontSize: 12, color: C.muted2, marginTop: 2 }}>{sub}</span>
      </span>
      <ArrowRight size={16} color={C.muted3} style={{ flex: 'none' }} />
    </button>
  )
}

// ─── Wizard step ────────────────────────────────────────────────────

function WizardStep({
  step, idx, total, draft, draftLoading, applied, onDraft, onRewrite, onReveal, onBack, onApply, onSkip, onRevert,
}: {
  step: Step; idx: number; total: number
  draft: string; draftLoading: boolean; applied: boolean
  onDraft: (v: string) => void; onRewrite: () => void; onReveal?: () => void
  onBack?: () => void
  onApply: () => void; onSkip: () => void; onRevert: () => void
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
          <span style={{ fontSize: 12, color: C.muted2 }}>Step {Math.min(idx + 1, total)} of {total}</span>
        </span>
      </div>

      {step.type === 'fix'
        ? <FixCard key={step.key} gap={step.gap} draft={draft} draftLoading={draftLoading} applied={applied} onDraft={onDraft} onRewrite={onRewrite} onReveal={onReveal} onApply={onApply} onSkip={onSkip} onRevert={onRevert} />
        : <FindingCardStep key={step.key} finding={step.finding} applied={applied} onReveal={onReveal} onApply={onApply} onSkip={onSkip} onRevert={onRevert} />}
    </div>
  )
}

function FixCard({ gap, draft, draftLoading, applied, onDraft, onRewrite, onReveal, onApply, onSkip, onRevert }: {
  gap: MissingGap; draft: string; draftLoading: boolean; applied: boolean
  onDraft: (v: string) => void; onRewrite: () => void | Promise<void>; onReveal?: () => void; onApply: () => void; onSkip: () => void; onRevert: () => void
}) {
  const k = KIND[gap.kind]
  const Icon = k.icon
  const [regen, setRegen] = useState(false)
  // Hold the spinner until the actual rewrite call settles (onRewrite returns the
  // async rewriteDraft promise), not a fixed timer.
  function rewrite() { setRegen(true); Promise.resolve(onRewrite()).finally(() => setRegen(false)) }

  return (
    <div style={{ marginTop: 18, animation: 'c4ai-next .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <span style={{ width: 46, height: 46, flex: 'none', borderRadius: 12, background: 'rgba(88,166,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7dd3fc' }}><Icon size={23} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gap.label}</div>
          <div style={{ fontSize: 13, color: C.muted2, marginTop: 2 }}>{k.prompt}</div>
        </div>
      </div>
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted3 }}>
        <Sparkles size={13} color={C.accent} /> Suggested {k.label}
        {(draftLoading || regen)
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto', letterSpacing: 0, textTransform: 'none', fontWeight: 500, color: C.muted2 }}><Loader2 size={12} className="animate-spin" /> Drafting…</span>
          : <button onClick={rewrite} aria-label="Rewrite suggestion" title="Rewrite suggestion" className="c4ai-ghost" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', border: 'none', background: 'transparent', color: C.muted2, cursor: 'pointer', padding: 2 }}><RotateCw size={13} /></button>}
      </div>
      <textarea value={draft} onChange={(e) => onDraft(e.target.value)}
        placeholder={draftLoading ? 'Drafting a suggestion…' : `Type a ${k.label}…`}
        style={{ width: '100%', marginTop: 9, resize: 'vertical', minHeight: gap.kind === 'desc' ? 128 : gap.kind === 'rel' ? 112 : 60, padding: '13px 15px', borderRadius: 12, border: `1px solid ${C.borderStrong}`, background: C.card, color: C.text, fontSize: 14, lineHeight: 1.55, fontFamily: 'inherit' }} />
      {onReveal && <div><RevealLink onClick={onReveal} /></div>}
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <button onClick={onApply} disabled={!draft.trim()} className="c4ai-pri"
          style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, border: 'none', background: applied ? C.green : C.accent, color: C.ink, fontSize: 14.5, fontWeight: 700, cursor: 'pointer', opacity: draft.trim() ? 1 : 0.55 }}>
          <Check size={16} /> {applied ? 'Applied · update' : 'Apply'}
        </button>
        {applied
          ? <button onClick={onRevert} className="c4ai-ghost" style={{ ...wizSecBtn, flex: 'none', width: '100%', color: C.dangerText }}>Revert</button>
          : <button onClick={onSkip} className="c4ai-ghost" style={{ ...wizSecBtn, flex: 'none', width: '100%' }}>Skip</button>}
      </div>
    </div>
  )
}

function FindingCardStep({ finding, applied, onReveal, onApply, onSkip, onRevert }: { finding: ReviewFinding; applied: boolean; onReveal?: () => void; onApply: () => void; onSkip: () => void; onRevert: () => void }) {
  const sev = SEV[finding.severity]
  const actionable = isActionable(finding)
  return (
    <div style={{ marginTop: 18, animation: 'c4ai-next .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
        <span style={{ width: 46, height: 46, flex: 'none', borderRadius: 12, background: sev.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: sev.color }}><AlertCircle size={23} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: '-.01em' }}>{finding.title}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: sev.color, marginTop: 3 }}>{sev.label} severity · {finding.category}</div>
        </div>
      </div>
      <div style={{ marginTop: 16, fontSize: 14, color: C.text2, lineHeight: 1.55 }}>{finding.detail}</div>
      <div style={{ marginTop: 14, padding: '13px 15px', borderRadius: 12, background: 'rgba(88,166,255,0.07)', border: '1px solid rgba(88,166,255,0.2)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>Suggested fix</span>
        <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5, marginTop: 4 }}>{finding.suggestion}</div>
      </div>
      {onReveal && <div><RevealLink onClick={onReveal} /></div>}
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {actionable && (
          <button onClick={onApply} className="c4ai-pri"
            style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, border: 'none', background: applied ? C.green : C.accent, color: C.ink, fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>
            <Check size={16} /> {applied ? 'Applied' : 'Apply fix'}
          </button>
        )}
        {applied
          ? <button onClick={onRevert} className="c4ai-ghost" style={{ ...wizSecBtn, flex: 'none', width: '100%', color: C.dangerText }}>Revert</button>
          : <button onClick={onSkip} className="c4ai-ghost" style={{ ...wizSecBtn, flex: 'none', width: '100%' }}>Skip</button>}
      </div>
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

// ─── Describe (Generate + Edit merged) ──────────────────────────────

const DESCRIBE_EXAMPLES = [
  'Add a Redis cache between the Web App and the database',
  'Split the monolith into separate Orders and Payments services',
  'Add Stripe as an external payment system the API calls',
]

function ComposeBody({ provider, workspace, onClose }: { provider: AiProvider; workspace: Workspace | null; onClose: () => void }) {
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)
  const undoLen = useWorkspaceStore((s) => s.undoStack.length)
  const lastSaved = useWorkspaceStore((s) => s.lastSavedUndoLength)
  const hasUnsaved = !!workspace && undoLen !== lastSaved

  const [text, setText] = useState('')
  const run = useAiRun()
  const [dsl, setDsl] = useState<string | null>(null)
  const [plan, setPlan] = useState<EditPlan | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const parsed = useMemo(() => (dsl ? parseDSL(dsl) : null), [dsl])
  const planLines = plan && workspace ? describeOps(plan, workspace) : []

  // Auto-detect intent. Without a workspace there's nothing to change → "new".
  const detected: 'new' | 'change' = !workspace ? 'new' : detectComposeMode(text)
  const DetIcon = detected === 'new' ? Sparkles : Pencil
  const detectedHint = !text.trim()
    ? 'Intent is detected automatically as you type.'
    : detected === 'new' ? 'Detected: new model — opens in a new workspace.' : `Detected: change to ${workspace?.name || 'the current model'}.`

  function reset() { setDsl(null); setPlan(null); setConfirmReplace(false) }
  const canRun = !!text.trim() && (detected === 'new' || !!workspace)

  function submit() {
    if (!canRun || run.loading) return
    reset()
    if (detected === 'new') run.go(() => generateDiagram(provider, text), setDsl)
    else run.go(() => planEdit(provider, workspace!, text), setPlan)
  }
  function load() { if (parsed) { loadWorkspace(parsed.workspace); onClose() } }
  const done = !!parsed || !!plan

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '6px 0 2px', marginBottom: 13 }}>
        <span style={{ position: 'relative', width: 60, height: 60, borderRadius: 16, background: 'rgba(88,166,255,0.12)', border: '1px solid rgba(88,166,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7dd3fc', animation: 'c4ai-pop .5s cubic-bezier(.34,1.56,.64,1) both' }}>
          <SquarePen size={26} />
          <span style={{ position: 'absolute', inset: -1, borderRadius: 16, border: '1px solid rgba(88,166,255,0.35)', animation: 'c4ai-ringpulse 2.4s ease-out infinite' }} />
        </span>
        <h2 style={{ margin: '16px 0 0', fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: '-.01em' }}>Describe <span style={{ color: '#7dd3fc' }}>a change</span></h2>
        <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, color: C.muted2, maxWidth: 300 }}>Tell me in plain English what to build or change. I’ll detect whether it’s a new model or an edit to this one, then show you a preview first.</p>
      </div>

      {!done && !text.trim() && (
        <div style={{ marginBottom: 13 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted3, marginBottom: 8 }}>Try one of these</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {DESCRIBE_EXAMPLES.map((ex, i) => (
              <button key={i} onClick={() => setText(ex)} className="c4ai-card"
                style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', padding: '9px 11px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, cursor: 'pointer', animation: 'c4ai-stagger .4s cubic-bezier(0.16,1,0.3,1) both', animationDelay: `${0.06 + i * 0.06}s` }}>
                <Wand2 size={13} color={C.accent} style={{ flex: 'none' }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.text2 }}>{ex}</span>
                <ArrowRight size={13} color={C.muted3} style={{ flex: 'none' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      <Field value={text} onChange={setText} grow={!done} onSubmit={submit} placeholder="Describe a system to build, or a change to make — e.g. add a Redis cache between the Web App and the database." />
      <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 9, background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)' }}>
        <DetIcon size={13} color={C.accent} style={{ flex: 'none' }} />
        <span style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.4 }}>{detectedHint}</span>
      </div>
      <RunButton label={detected === 'new' ? 'Generate diagram' : 'Plan changes'} loading={run.loading} disabled={!canRun} onClick={submit} />
      <ErrorLine error={run.error} />

      {parsed && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span style={kicker}>Preview</span>
            <span style={{ fontSize: 12, color: C.muted }}>{summarize(parsed.workspace)}</span>
          </div>
          <div style={{ ...kicker, marginTop: 14 }}>Elements</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
            {flattenElements(parsed.workspace).slice(0, 6).map((el) => <span key={el.id} style={chipBlue}>{el.name}</span>)}
            {flattenElements(parsed.workspace).length > 6 && <span style={{ ...chipBlue, color: C.muted, borderColor: C.border, background: 'rgba(255,255,255,0.04)' }}>+{flattenElements(parsed.workspace).length - 6} more</span>}
          </div>
          {parsed.errors.length > 0 && <div style={{ marginTop: 10, fontSize: 12, color: C.warnText }}>{parsed.errors.length} parser warning(s) — the diagram may be partial.</div>}

          {!confirmReplace ? (
            <>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)' }}>
                <Layers size={14} color={C.accent} style={{ flex: 'none', marginTop: 1 }} />
                <span style={{ fontSize: 12, lineHeight: 1.45, color: C.text2 }}>
                  {workspace ? <>This is a brand-new model. Loading it <strong style={{ color: C.text }}>replaces {workspace.name || 'the current model'}</strong> — it doesn’t merge into the open workspace.</> : 'Load this as a new workspace.'}
                </span>
              </div>
              <Actions>
                <button className="c4ai-pri" style={primaryBtn} disabled={!hasContent(parsed.workspace)} onClick={() => { if (workspace) setConfirmReplace(true); else load() }}>Load diagram</button>
                <button className="c4ai-sec" style={secondaryBtn} onClick={reset}>Discard</button>
              </Actions>
            </>
          ) : (
            <div style={{ marginTop: 14, padding: '13px 14px', borderRadius: 10, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', animation: 'c4ai-fade .2s ease' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                <AlertCircle size={16} color={C.warn} style={{ flex: 'none', marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fed7aa' }}>Replace {workspace?.name || 'the current model'}?</div>
                  <div style={{ fontSize: 12, lineHeight: 1.45, color: C.warnText, marginTop: 3 }}>
                    {hasUnsaved
                      ? <>It has <strong style={{ color: '#fed7aa' }}>unsaved changes</strong>. Loading the new model discards your current diagram — this can’t be undone. Save it first if you want to keep it.</>
                      : <>Loading the new model <strong style={{ color: '#fed7aa' }}>replaces</strong> your current diagram. This can’t be undone.</>}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 13, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="c4ai-sec" style={{ ...secondaryBtn, border: '1px solid rgba(239,68,68,0.3)', color: C.dangerText }} onClick={load}>Replace anyway</button>
                <button className="c4ai-sec" style={secondaryBtn} onClick={() => setConfirmReplace(false)}>Cancel</button>
              </div>
            </div>
          )}
        </Card>
      )}

      {plan && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{planLines.length} proposed change(s)</div>
          <PlanList lines={planLines} />
          <Actions>
            <button className="c4ai-pri" style={primaryBtn} disabled={!planLines.length} onClick={() => { if (workspace) { applyPlanToStore(plan, workspace); onClose() } }}>Apply changes</button>
            <button className="c4ai-sec" style={secondaryBtn} onClick={() => setPlan(null)}>Discard</button>
          </Actions>
        </Card>
      )}
    </>
  )
}

// ─── Interview ──────────────────────────────────────────────────────

// Questions per round before offering to wrap up (the interview is otherwise
// open-ended; "Keep going" adds another round).
const INTERVIEW_TARGET = 5

function InterviewBody({ provider, onClose, embedded, onApply, onSkipQuestions }: {
  provider: AiProvider; onClose: () => void
  /** Rendered as the tail of the Improve flow: auto-start, apply via the ledger
   *  (onApply) instead of the standalone preview, and offer a skip-out. */
  embedded?: boolean; onApply?: (plan: EditPlan) => void; onSkipQuestions?: () => void
}) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)

  // Conversation state persists across close→reopen so a long interview resumes.
  const [history, setHistory] = usePersistentState<AiChatTurn[]>('interview.history', [])
  const [qa, setQa] = usePersistentState<{ q: string; a: string }[]>('interview.qa', [])
  const [question, setQuestion] = usePersistentState<string | null>('interview.question', null)
  const [answer, setAnswer] = usePersistentState('interview.answer', '')
  // The view the interview is grounded on. Pinned at start so switching views
  // (or reopening on a different one) doesn't silently re-ground the questions.
  const [pinnedKey, setPinnedKey] = usePersistentState<string | null>('interview.viewKey', null)
  const [plan, setPlan] = useState<EditPlan | null>(null)
  const [target, setTarget] = useState(INTERVIEW_TARGET)
  const [wrapUp, setWrapUp] = useState(false)
  const run = useAiRun()
  const started = history.length > 0
  const groundKey = started && pinnedKey ? pinnedKey : activeViewKey
  const view = workspace && groundKey ? getActiveView(workspace, groundKey) : undefined
  const mismatched = started && !!pinnedKey && pinnedKey !== activeViewKey

  // Elements the current question names (≥3 chars, whole-word match) — surfaced
  // as chips and highlighted on the canvas so you can see what's being asked about.
  const mentioned = useMemo(() => {
    if (!workspace || !question) return [] as { id: string; name: string }[]
    return flattenElements(workspace)
      .filter((e) => e.name.trim().length >= 3 && new RegExp(`\\b${escapeRegExp(e.name.trim())}\\b`, 'i').test(question))
      .map((e) => ({ id: e.id, name: e.name }))
      .slice(0, 6)
  }, [workspace, question])

  useEffect(() => {
    if (!mentioned.length) return
    // Pan the canvas to the first mentioned element. We pan rather than *select*
    // it — selecting opens the inspector, which closes this panel.
    useWorkspaceStore.setState({ focusElementId: mentioned[0].id })
  }, [mentioned])

  // Embedded (Improve-flow tail): kick the first question off automatically so the
  // interview begins without a separate "Start" screen.
  useEffect(() => {
    if (embedded && workspace && view && !started && !plan && !run.loading) start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, workspace, view, started])

  if (!workspace || !view) return <Empty>Open a view to start an interview.</Empty>
  const ws = workspace
  const v: View = view

  function start() {
    setPinnedKey(activeViewKey) // pin the interview to the view it began on
    setWrapUp(false); setTarget(INTERVIEW_TARGET); setQa([])
    run.go(async () => {
      const kickoff = interviewKickoffMessage(v)
      const q = await interviewAsk(provider, ws, v, [], kickoff)
      setHistory([{ role: 'user', content: kickoff }, { role: 'assistant', content: q }])
      return q
    }, setQuestion)
  }
  function answerNext() {
    if (!question || !answer.trim()) return
    const a = answer.trim()
    setQa((p) => [...p, { q: question, a }])
    setAnswer('')
    setWrapUp(qa.length + 1 >= target) // hit the planned count → offer to wrap up
    // Always fetch the next question so the transcript ends on a question
    // (keeps history alternating, and the next one is ready if they continue).
    run.go(async () => {
      const q = await interviewAsk(provider, ws, v, history, a)
      setHistory([...history, { role: 'user', content: a }, { role: 'assistant', content: q }])
      return q
    }, setQuestion)
  }
  function skip() {
    if (!question || run.loading) return
    const msg = 'Let’s skip that one — ask me something else.'
    setAnswer('')
    run.go(async () => {
      const q = await interviewAsk(provider, ws, v, history, msg)
      setHistory([...history, { role: 'user', content: msg }, { role: 'assistant', content: q }])
      return q
    }, setQuestion)
  }
  function keepGoing() { setWrapUp(false); setTarget((t) => t + INTERVIEW_TARGET) }
  // Discard the pinned conversation and offer a fresh interview on the view the
  // user is now looking at.
  function reground() { setHistory([]); setQa([]); setQuestion(null); setAnswer(''); setPinnedKey(null); setWrapUp(false); setPlan(null) }
  // Build from the committed transcript (always ends on a question), so the plan
  // request alternates cleanly. An unsent draft answer is ignored.
  function finish() { run.go(() => interviewBuildPlan(provider, ws, v, history), setPlan) }

  const planLines = plan ? describeOps(plan, ws) : []
  const answeredN = qa.length
  const dotCount = Math.max(target, answeredN + 1)

  return (
    <>
      {mismatched && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', marginBottom: 12, borderRadius: 9, border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.08)', fontSize: 11.5, color: C.muted2 }}>
          <MessagesSquare size={13} color="#c4b5fd" style={{ flex: 'none' }} />
          <span style={{ flex: 1, minWidth: 0 }}>About <strong style={{ color: C.text2 }}>{viewLabel(v)}</strong> — you’re viewing a different one.</span>
          <button onClick={reground} style={{ flex: 'none', border: 'none', background: 'transparent', color: '#c4b5fd', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Re-ground</button>
        </div>
      )}
      {!started && !plan ? (
        embedded ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 4px', fontSize: 13, color: C.muted2 }}>
              {run.error
                ? <span>Couldn’t start the questions.</span>
                : <><Loader2 size={15} className="animate-spin" color="#c4b5fd" /> Preparing a few questions about <span style={{ color: C.text2 }}>{viewLabel(v)}</span>…</>}
            </div>
            {onSkipQuestions && (
              <button onClick={onSkipQuestions} className="c4ai-ghost" style={{ marginTop: 6, width: '100%', height: 34, borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>Skip the questions →</button>
            )}
          </div>
        ) : (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '6px 0 2px' }}>
            <span style={{ position: 'relative', width: 60, height: 60, borderRadius: 16, background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c4b5fd', animation: 'c4ai-pop .5s cubic-bezier(.34,1.56,.64,1) both' }}>
              <MessagesSquare size={28} />
              <span style={{ position: 'absolute', inset: -1, borderRadius: 16, border: '1px solid rgba(168,85,247,0.35)', animation: 'c4ai-ringpulse 2.4s ease-out infinite' }} />
            </span>
            <h2 style={{ margin: '16px 0 0', fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: '-.01em' }}>Let’s fill in <span style={{ color: '#c4b5fd' }}>{viewLabel(v)}</span></h2>
            <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, color: C.muted2, maxWidth: 300 }}>A handful of focused questions, and I’ll turn your answers straight into model updates — no diagram editing needed.</p>
          </div>
          <div style={{ marginTop: 18, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted3 }}>Things I might ask</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['What’s the primary responsibility here?', 'Which datastores or services does it rely on?', 'Any external systems — email, payments, SMS?'].map((q, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, animation: 'c4ai-stagger .4s cubic-bezier(0.16,1,0.3,1) both', animationDelay: `${0.1 + i * 0.07}s` }}>
                <span style={{ width: 24, height: 24, flex: 'none', borderRadius: 7, background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c4b5fd' }}><HelpCircle size={13} /></span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.text2, textAlign: 'left' }}>{q}</span>
              </div>
            ))}
          </div>
          <button onClick={start} disabled={run.loading} className="c4ai-pri"
            style={{ width: '100%', marginTop: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, border: 'none', background: C.accent, color: C.ink, fontSize: 14.5, fontWeight: 700, cursor: 'pointer', opacity: run.loading ? 0.6 : 1 }}>
            {run.loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {run.loading ? 'Starting…' : 'Start interview'} {!run.loading && <ArrowRight size={15} />}
          </button>
        </div>
        )
      ) : (
        <p style={blurb}>Filling in <span style={{ color: '#7dd3fc' }}>{viewLabel(v)}</span>. Answer a few questions; c4hero turns them into model updates.</p>
      )}

      {started && !plan && !wrapUp && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {Array.from({ length: dotCount }, (_, i) => (
                <span key={i} style={{ width: 18, height: 4, borderRadius: 999, background: i <= answeredN ? C.accent : 'rgba(88,166,255,0.2)' }} />
              ))}
            </div>
            <span style={{ fontSize: 11, color: C.muted }}>Question {answeredN + 1} of {dotCount}</span>
          </div>
          <div style={{ minHeight: 42, marginTop: 12, fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: C.text }}>
            {run.loading && !question
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: C.muted2 }}><Loader2 size={14} className="animate-spin" color={C.accent} /> Thinking…</span>
              : <span key={question} style={{ display: 'block', animation: 'c4ai-rise .3s ease both' }}>{question}</span>}
          </div>
          {mentioned.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', animation: 'c4ai-fade .25s ease' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.muted2 }}><CornerDownRight size={12} /> Highlighting</span>
              {mentioned.map((m) => (
                <button key={m.id} onClick={() => useWorkspaceStore.setState({ focusElementId: m.id })}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 6, background: '#142540', border: '1px solid rgba(37,99,235,0.4)', fontSize: 11, color: '#7dd3fc', cursor: 'pointer' }}>
                  {m.name}
                </button>
              ))}
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <Field value={answer} onChange={setAnswer} placeholder="Type or dictate your answer…" rows={3} onSubmit={answerNext} />
            <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="c4ai-sec" style={{ ...secondaryBtn, color: C.muted }} onClick={skip} disabled={run.loading}>Skip</button>
                <button className="c4ai-sec" style={{ ...secondaryBtn, color: C.muted }} onClick={finish} disabled={run.loading}>Finish</button>
              </div>
              <button className="c4ai-pri" style={{ ...primaryBtn, height: 32 }} onClick={answerNext} disabled={run.loading || !answer.trim()}>
                {run.loading ? 'Thinking…' : 'Answer'} <ArrowRight size={13} />
              </button>
            </div>
          </div>
          {embedded && onSkipQuestions && (
            <button onClick={onSkipQuestions} className="c4ai-ghost" style={{ marginTop: 10, width: '100%', height: 34, borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>Skip the questions →</button>
          )}
          {qa.length > 0 && !embedded && <PlanPreviewBar provider={provider} ws={ws} view={v} history={history} />}
        </>
      )}

      {started && !plan && wrapUp && (
        <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, padding: 16, animation: 'c4ai-fade .25s ease' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>That’s {answeredN} question{answeredN === 1 ? '' : 's'} answered.</div>
          <p style={{ ...blurb, margin: '8px 0 0' }}>Keep going for more detail, or wrap up and turn your answers into model updates.</p>
          <Actions>
            <button className="c4ai-sec" style={secondaryBtn} onClick={keepGoing} disabled={run.loading}>Keep going</button>
            <button className="c4ai-pri" style={primaryBtn} onClick={finish} disabled={run.loading}>Finish &amp; update model</button>
          </Actions>
        </div>
      )}

      <ErrorLine error={run.error} />

      {plan && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{planLines.length} proposed change(s) from your answers</div>
          <PlanList lines={planLines} />
          <Actions>
            <button className="c4ai-pri" style={primaryBtn} disabled={!planLines.length}
              onClick={() => { if (onApply) onApply(plan); else { applyPlanToStore(plan, ws); clearAiSession('interview'); onClose() } }}>
              {onApply ? 'Apply & finish' : 'Apply changes'}
            </button>
            <button className="c4ai-sec" style={secondaryBtn} onClick={() => setPlan(null)}>Back</button>
          </Actions>
        </Card>
      )}
    </>
  )
}

const SCOPE_META: Record<PlanScope, { label: string; bg: string; color: string }> = {
  view: { label: 'This view', bg: 'rgba(88,166,255,0.12)', color: '#7dd3fc' },
  model: { label: 'Model only', bg: 'rgba(132,141,151,0.16)', color: '#9aa3ad' },
  context: { label: '↗ Context', bg: 'rgba(249,115,22,0.12)', color: C.warnText },
  component: { label: '↗ Component', bg: 'rgba(249,115,22,0.12)', color: C.warnText },
}

function ScopeTag({ scope }: { scope: PlanScope }) {
  const m = SCOPE_META[scope]
  return <span style={{ flex: 'none', marginTop: 1, fontSize: 9.5, fontWeight: 600, letterSpacing: '.03em', padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap', background: m.bg, color: m.color }}>{m.label}</span>
}

/** On-demand "what will I add" preview during the interview. Builds the plan
 *  from answers given so far (one AI call), with each change scope-tagged. */
function PlanPreviewBar({ provider, ws, view, history }: { provider: AiProvider; ws: Workspace; view: View; history: AiChatTurn[] }) {
  const run = useAiRun()
  const [plan, setPlan] = useState<EditPlan | null>(null)
  const [open, setOpen] = useState(false)
  const lines = plan ? describeOps(plan, ws) : []
  const scopes = plan ? plan.operations.map((op) => classifyScope(op, ws, view)) : []
  const offCount = scopes.filter((s) => s === 'context' || s === 'component').length

  function toggle() {
    if (!open && !plan && !run.loading) run.go(() => interviewBuildPlan(provider, ws, view, history), setPlan)
    setOpen((o) => !o)
  }

  return (
    <div style={{ marginTop: 16 }}>
      <button onClick={toggle} className="c4ai-sec"
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
        {run.loading ? <Loader2 size={13} className="animate-spin" color={C.accent} /> : <Layers size={13} color={C.accent} />}
        <span style={{ fontSize: 12, color: C.text2 }}>{plan ? `Will add ${plan.operations.length} update${plan.operations.length === 1 ? '' : 's'}` : 'Preview what I’ll add'}</span>
        {offCount > 0 && <span style={{ fontSize: 11, color: C.warnText, background: 'rgba(249,115,22,0.1)', borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap' }}>{offCount} off-view</span>}
        <span style={{ flex: 1 }} />
        <ChevronRight size={13} color={C.muted3} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s' }} />
      </button>
      <ErrorLine error={run.error} />
      {open && plan && (
        <div style={{ marginTop: 8, borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, padding: 8, animation: 'c4ai-fade .2s ease' }}>
          {lines.length === 0 ? (
            <div style={{ ...blurb, margin: '4px 6px' }}>Nothing to add from your answers yet.</div>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {lines.map((l, i) => (
                <li key={i} style={{ padding: '7px 8px', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.45, color: C.text2 }}>{l}</span>
                  <ScopeTag scope={scopes[i]} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─── ADR ────────────────────────────────────────────────────────────

function AdrBody({ provider, workspace }: { provider: AiProvider; workspace: Workspace | null }) {
  const [topic, setTopic] = useState('')
  const run = useAiRun()
  const [md, setMd] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const submit = () => { if (topic.trim() && !run.loading) run.go(() => draftAdr(provider, workspace, topic), setMd) }

  function copy() { if (md) navigator.clipboard?.writeText(md).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }

  return (
    <>
      <p style={blurb}>Capture an architecture decision as a Markdown record, grounded in the current model.</p>
      <Field value={topic} onChange={setTopic} grow={!md} onSubmit={submit} placeholder="e.g. Adopt event-driven messaging between the Orders and Payments services" />
      <RunButton label="Draft ADR" loading={run.loading} disabled={!topic.trim()} onClick={submit} />
      <ErrorLine error={run.error} />
      {md && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>ADR</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="c4ai-sec" style={{ ...miniBtn, border: `1px solid ${C.border}`, background: 'transparent', color: C.text }} onClick={copy}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}</button>
              <button className="c4ai-sec" style={{ ...miniBtn, border: `1px solid ${C.border}`, background: 'transparent', color: C.text }} onClick={() => downloadFile(md, adrFilename(topic), 'text/markdown')}><Download size={12} /> .md</button>
            </div>
          </div>
          <pre data-scroll style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '10px 0 0', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.55, color: C.text2, maxHeight: 280, overflowY: 'auto' }}>{md}</pre>
        </Card>
      )}
    </>
  )
}

// ─── Scan repo ──────────────────────────────────────────────────────

type RepoStage = 'idle' | 'scanning' | 'done'

function RepoBody({ provider, workspace, onClose }: { provider: AiProvider; workspace: Workspace | null; onClose: () => void }) {
  const [stage, setStage] = useState<RepoStage>('idle')
  const [phase, setPhase] = useState<'reading' | 'analyzing'>('reading')
  const [counts, setCounts] = useState({ files: 0, keyFiles: 0 })
  const [found, setFound] = useState<string[]>([])
  const [repoName, setRepoName] = useState('')
  const [result, setResult] = useState<RepoScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removed, setRemoved] = useState<Set<number>>(new Set())
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const supported = canScanRepo()

  async function choose() {
    setError(null)
    let dir: FileSystemDirectoryHandle
    try {
      dir = await window.showDirectoryPicker({ mode: 'read' })
    } catch {
      return // user cancelled the picker
    }
    setStage('scanning'); setPhase('reading'); setRepoName(dir.name)
    setResult(null); setRemoved(new Set()); setAnswers({}); setCounts({ files: 0, keyFiles: 0 }); setFound([])
    try {
      const snapshot = await readRepoFiles(dir, {}, (p) => {
        setCounts({ files: p.files, keyFiles: p.keyFiles })
        if (p.keyFile) setFound((prev) => [p.keyFile!.split('/').pop() ?? p.keyFile!, ...prev].slice(0, 6))
      })
      setPhase('analyzing')
      const res = await scanRepo(provider, workspace, buildRepoBundle(snapshot))
      setResult(res); setStage('done')
    } catch (err) {
      setError(aiErrorMessage(err)); setStage('idle')
    }
  }

  function apply() {
    if (!result || !workspace) return
    const ops = [
      ...result.proposals.filter((_, i) => !removed.has(i)).map((p) => p.op),
      // ops chosen by answering the scan's questions
      ...result.questions.flatMap((q, i) => {
        const op = answers[i] != null ? q.options[answers[i]]?.op : undefined
        return op ? [op] : []
      }),
    ]
    if (!ops.length) { onClose(); return }

    const before = useWorkspaceStore.getState()
    const activeKey = before.activeViewKey
    const activeView = activeKey ? getActiveView(before.workspace!, activeKey) : undefined
    // On an L2/L3 we'll later strip out imported elements that don't belong here.
    const cleanScope = activeView && (activeView.type === 'container' || activeView.type === 'component') ? activeView : undefined
    const beforeViewIds = new Set(cleanScope ? cleanScope.elements.map((e) => e.id) : [])
    const beforeSystemIds = new Set(before.workspace!.model.softwareSystems.map((s) => s.id))

    applyPlanToStore({ operations: ops }, workspace)

    const after = useWorkspaceStore.getState()
    const ws1 = after.workspace!

    // Keep the scan from polluting the view you were on: drop newly-added
    // elements that don't belong to this view's own scope (a new system's
    // containers, external boxes, …), while keeping additions to *this* system.
    if (cleanScope && activeKey) {
      const view = getActiveView(ws1, activeKey)
      const added = view ? view.elements.map((e) => e.id).filter((id) => !beforeViewIds.has(id)) : []
      const belongs = getScopeMemberIds(ws1, cleanScope)
      const foreign = added.filter((id) => !belongs.has(id))
      if (foreign.length) after.removeElementsFromView(activeKey, foreign)
    }

    // Give each newly-imported *internal* system its own container (L2) view, and
    // open the largest. External systems are black boxes — no view for them.
    // applyPlanToStore's addContainer already auto-creates a scoped container
    // view for systems that gained containers, so reuse it rather than making a
    // duplicate; only create one for systems that don't have one yet.
    const newSystems = ws1.model.softwareSystems
      .filter((s) => !beforeSystemIds.has(s.id) && s.location !== 'External')
      .sort((a, b) => b.containers.length - a.containers.length)
    let primaryKey: string | null = null
    for (const sys of newSystems) {
      const existing = ws1.views.containerViews.find((v) => v.softwareSystemId === sys.id)
      const key = existing ? existing.key : after.addView('container', sys.id, `${sys.name} — Containers`)
      if (!primaryKey) primaryKey = key
    }
    if (primaryKey) after.setActiveView(primaryKey)
    onClose()
  }

  if (!supported) {
    return <Empty>Repo scanning needs the File System Access API — available in Chromium browsers (Chrome, Edge, Brave, Arc).</Empty>
  }

  if (stage === 'scanning') {
    return <ScanningView phase={phase} repoName={repoName} counts={counts} found={found} />
  }

  if (stage === 'done' && result) {
    const kept = result.proposals.filter((_, i) => !removed.has(i)).length
    const answeredOps = result.questions.reduce((n, q, i) => n + (answers[i] != null && q.options[answers[i]]?.op ? 1 : 0), 0)
    const applyCount = kept + answeredOps
    const nothing = result.proposals.length === 0 && result.questions.length === 0
    const entries = result.proposals.map((p, i) => ({ p, i }))
    const elementEntries = entries.filter((e) => e.p.op.op !== 'addRelationship')
    const connEntries = entries.filter((e) => e.p.op.op === 'addRelationship')

    const proposalGroup = (title: string, group: { p: typeof result.proposals[number]; i: number }[]) => (
      <div style={{ marginTop: 14, animation: 'c4ai-fade .25s ease' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.muted, marginBottom: 7 }}>{title}</div>
        <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, overflow: 'hidden' }}>
          <ul style={{ margin: 0, padding: 8, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {group.map(({ p, i }) => {
              const gone = removed.has(i)
              const rel = p.op.op === 'addRelationship'
              const add = p.op.op.startsWith('add')
              const tag = rel ? 'Link' : add ? 'Add' : 'Update'
              return (
                <li key={i} style={{ padding: 8, opacity: gone ? 0.4 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                    <span style={{ marginTop: 1, flex: 'none', fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 5, background: rel ? 'rgba(167,139,250,0.16)' : add ? 'rgba(34,197,94,0.14)' : 'rgba(88,166,255,0.14)', color: rel ? '#c4b5fd' : add ? C.greenText : '#7dd3fc' }}>{tag}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.45, color: C.text2, textDecoration: gone ? 'line-through' : 'none', wordBreak: 'break-word' }}>{p.label}</span>
                    <button onClick={() => setRemoved((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })}
                      className="c4ai-ghost" title={gone ? 'Restore' : 'Skip'} style={{ ...iconBtn, width: 22, height: 22, flex: 'none' }}>
                      {gone ? <ArrowRight size={12} /> : <X size={12} />}
                    </button>
                  </div>
                  {p.src && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingLeft: 38 }}>
                      <FileCode size={11} color={C.muted3} style={{ flex: 'none' }} />
                      <span style={{ fontSize: 11, color: C.muted3, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>{p.src}</span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    )

    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 600, color: C.text }}><GitBranch size={15} color="#7dd3fc" /> {repoName}</span>
          <button className="c4ai-sec" style={{ ...miniBtn, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted }} onClick={() => { setStage('idle'); setResult(null) }}><Folder size={12} /> Scan another</button>
        </div>
        <p style={{ ...blurb, margin: '10px 0 0' }}>
          {nothing
            ? 'The model already matches what the code shows — nothing to propose.'
            : <>From the code, c4hero proposes <strong style={{ color: C.text }}>{result.proposals.length} update{result.proposals.length === 1 ? '' : 's'}</strong>{result.questions.length > 0 && <> and has <strong style={{ color: C.text }}>{result.questions.length} question{result.questions.length === 1 ? '' : 's'}</strong></>}.</>}
        </p>

        {elementEntries.length > 0 && proposalGroup('Elements', elementEntries)}
        {connEntries.length > 0 && proposalGroup('Connections', connEntries)}

        {result.questions.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 9 }}>
              <HelpCircle size={14} color="#fdba74" /> A few things I wasn’t sure about
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {result.questions.map((q, qi) => (
                <div key={qi} style={{ borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, padding: '12px 13px' }}>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.text, fontWeight: 500 }}>{q.text}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                    {q.options.map((o, oi) => {
                      const sel = answers[qi] === oi
                      return (
                        <button key={oi} onClick={() => setAnswers((a) => ({ ...a, [qi]: a[qi] === oi ? -1 : oi }))}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left', padding: '9px 11px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${sel ? C.accent : C.border}`, background: sel ? 'rgba(88,166,255,0.12)' : 'transparent' }}>
                          <span style={{ width: 15, height: 15, flex: 'none', marginTop: 1, borderRadius: '50%', border: `1.5px solid ${sel ? C.accent : C.muted3}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {sel && <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.accent }} />}
                          </span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.45, color: sel ? C.text : C.text2, wordBreak: 'break-word' }}>{o.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ ...blurb, marginTop: 9 }}>Pick an answer to apply it; unanswered questions are skipped.</div>
          </div>
        )}

        {!nothing && (
          <>
            <Actions>
              <button className="c4ai-pri" style={{ ...primaryBtn, height: 34 }} disabled={applyCount === 0 || !workspace} onClick={apply}>Apply {applyCount} update{applyCount === 1 ? '' : 's'}</button>
              <button className="c4ai-sec" style={secondaryBtn} onClick={() => { setStage('idle'); setResult(null) }}>Discard</button>
            </Actions>
            {!workspace && <div style={{ ...blurb, marginTop: 8 }}>Open a workspace to apply these.</div>}
          </>
        )}
      </>
    )
  }

  // idle
  const looksFor: { icon: LucideIcon; t: string; s: string }[] = [
    { icon: FileCode, t: 'Manifests & configs', s: 'package.json, pom.xml, go.mod, application.yml…' },
    { icon: Box, t: 'Services & containers', s: 'apps and modules, and how they’re wired together' },
    { icon: Link2, t: 'External dependencies', s: 'databases, queues, Stripe, SendGrid…' },
  ]
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '6px 0 2px' }}>
        <span style={{ position: 'relative', width: 60, height: 60, borderRadius: 16, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#86efac', animation: 'c4ai-pop .5s cubic-bezier(.34,1.56,.64,1) both' }}>
          <GitBranch size={27} />
          <span style={{ position: 'absolute', inset: -1, borderRadius: 16, border: '1px solid rgba(34,197,94,0.35)', animation: 'c4ai-ringpulse 2.4s ease-out infinite' }} />
        </span>
        <h2 style={{ margin: '16px 0 0', fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: '-.01em' }}>Build the model <span style={{ color: '#86efac' }}>from your code</span></h2>
        <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, color: C.muted2, maxWidth: 300 }}>Point me at a local repo. I read it on your machine and propose containers, services and connections — each tagged with the file it came from.</p>
      </div>
      <div style={{ marginTop: 18, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted3 }}>What I look for</div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {looksFor.map((r, i) => {
          const I = r.icon
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, animation: 'c4ai-stagger .4s cubic-bezier(0.16,1,0.3,1) both', animationDelay: `${0.1 + i * 0.07}s` }}>
              <span style={{ width: 26, height: 26, flex: 'none', borderRadius: 7, background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#86efac' }}><I size={14} /></span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.text }}>{r.t}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.s}</span>
              </span>
            </div>
          )
        })}
      </div>
      <button onClick={choose} className="c4ai-pri"
        style={{ width: '100%', marginTop: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, border: 'none', background: C.accent, color: C.ink, fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>
        <Folder size={16} /> Choose a folder…
      </button>
      <ErrorLine error={error} />
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '11px 13px', borderRadius: 10, background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)' }}>
        <ShieldCheck size={14} color={C.accent} style={{ flex: 'none', marginTop: 1 }} />
        <span style={{ fontSize: 11.5, lineHeight: 1.45, color: C.text2 }}>Files are read in your browser. Secret-looking values are redacted, then only the file tree and key manifest/config excerpts are sent to your AI provider with your key — c4hero has no server.</span>
      </div>
    </div>
  )
}

const ANALYZE_MESSAGES = [
  'Inferring systems and services…',
  'Detecting technologies and frameworks…',
  'Mapping relationships between components…',
  'Spotting external systems and integrations…',
  'Drafting model proposals…',
]

function ScanningView({ phase, repoName, counts, found }: {
  phase: 'reading' | 'analyzing'
  repoName: string
  counts: { files: number; keyFiles: number }
  found: string[]
}) {
  const [msg, setMsg] = useState(0)
  useEffect(() => {
    if (phase !== 'analyzing') return
    const t = setInterval(() => setMsg((m) => (m + 1) % ANALYZE_MESSAGES.length), 1900)
    return () => clearInterval(t)
  }, [phase])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '8px 0', animation: 'c4ai-fade .25s ease' }}>
      <ScanGraph />
      <div style={{ marginTop: 16, fontSize: 13, fontWeight: 600, color: C.text }}>
        <span key={phase === 'reading' ? 'reading' : msg} style={{ display: 'inline-block', animation: 'c4ai-fade .3s ease' }}>
          {phase === 'reading' ? `Reading ${repoName}…` : ANALYZE_MESSAGES[msg]}
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: C.muted }}>
        {phase === 'reading'
          ? `${counts.files} file${counts.files === 1 ? '' : 's'} · ${counts.keyFiles} key file${counts.keyFiles === 1 ? '' : 's'} found`
          : 'Analyzing with your model — this can take a moment'}
      </div>
      {found.length > 0 && (
        <div style={{ marginTop: 16, width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {found.map((f, i) => (
            <div key={`${f}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.muted2, animation: 'c4ai-fade .25s ease' }}>
              <FileCode size={12} color="#7dd3fc" style={{ flex: 'none' }} />
              <span style={{ fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// A radar sweeping over an architecture graph that assembles itself: the hub
// and its nodes pop in and "ping" as the beam crosses them, edges stream data,
// concentric rings breathe — a thematic stand-in for the model being inferred.
const SWEEP_PERIOD = 3.2 // seconds per revolution; node pings are synced to it
const CX = 100
const CY = 100
const RADAR_R = 78

function ScanGraph() {
  // Six satellites evenly around the hub, plus the hub itself.
  const sats = [0, 1, 2, 3, 4, 5].map((i) => {
    const deg = i * 60 - 90 // start at 12 o'clock, clockwise
    const a = (deg * Math.PI) / 180
    const r = 58
    return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a), deg: (deg + 360) % 360 }
  })
  const ringEdges: [number, number][] = [[0, 2], [2, 4], [4, 0]] // a faint triangle between satellites

  return (
    <div style={{ position: 'relative', width: 200, height: 200, animation: 'c4ai-float 4s ease-in-out infinite' }}>
      {/* rotating radar beam (conic wedge) */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: RADAR_R * 2, height: RADAR_R * 2,
        marginLeft: -RADAR_R, marginTop: -RADAR_R, borderRadius: '50%',
        background: 'conic-gradient(from -90deg, rgba(88,166,255,0) 0deg, rgba(88,166,255,0) 290deg, rgba(88,166,255,0.18) 340deg, rgba(125,211,252,0.55) 360deg)',
        animation: `c4ai-radar ${SWEEP_PERIOD}s linear infinite`,
      }} />
      <svg viewBox="0 0 200 200" width="200" height="200" style={{ position: 'absolute', inset: 0 }}>
        {/* concentric range rings + crosshairs */}
        {[28, 52, RADAR_R].map((r) => (
          <circle key={r} cx={CX} cy={CY} r={r} fill="none" stroke="rgba(88,166,255,0.14)" strokeWidth="1" />
        ))}
        <line x1={CX - RADAR_R} y1={CY} x2={CX + RADAR_R} y2={CY} stroke="rgba(88,166,255,0.1)" strokeWidth="1" />
        <line x1={CX} y1={CY - RADAR_R} x2={CX} y2={CY + RADAR_R} stroke="rgba(88,166,255,0.1)" strokeWidth="1" />

        {/* edges: hub → each satellite, plus a faint triangle */}
        {sats.map((s, i) => (
          <line key={`h${i}`} x1={CX} y1={CY} x2={s.x} y2={s.y} stroke="rgba(88,166,255,0.45)" strokeWidth="1.5" className="c4ai-edge" style={{ animationDelay: `${i * 0.14}s` }} />
        ))}
        {ringEdges.map(([a, b], i) => (
          <line key={`r${i}`} x1={sats[a].x} y1={sats[a].y} x2={sats[b].x} y2={sats[b].y} stroke="rgba(88,166,255,0.18)" strokeWidth="1" />
        ))}

        {/* satellites: halo + dot, popping in then pinging in time with the beam */}
        {sats.map((s, i) => {
          const pingDelay = (s.deg / 360) * SWEEP_PERIOD
          return (
            <g key={i} className="c4ai-pop" style={{ animationDelay: `${0.15 + i * 0.09}s` }}>
              <circle cx={s.x} cy={s.y} r={11} fill="rgba(125,211,252,0.12)" className="c4ai-ping" style={{ animationDelay: `${pingDelay}s` }} />
              <circle cx={s.x} cy={s.y} r={5.5} fill="#7dd3fc" className="c4ai-ping" style={{ animationDelay: `${pingDelay}s` }} />
            </g>
          )
        })}

        {/* hub: steady glowing core with an expanding pulse ring */}
        <circle cx={CX} cy={CY} r={13} fill="none" stroke="rgba(88,166,255,0.5)" strokeWidth="1.5" style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'c4ai-ringpulse 2.2s ease-out infinite' }} />
        <circle cx={CX} cy={CY} r={9} fill="rgba(88,166,255,0.18)" />
        <circle cx={CX} cy={CY} r={5.5} fill={C.accent} />
      </svg>
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
      <div data-drag-handle style={{ display: 'flex', justifyContent: 'flex-end', padding: '13px 14px 0', cursor: 'move' }}>
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
      <div data-drag-handle style={{ ...headerRow, cursor: 'move' }}>
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

// ─── Shared primitives ──────────────────────────────────────────────

interface RunState {
  loading: boolean
  error: string | null
  go: <T>(fn: () => Promise<T>, onResult: (v: T) => void) => Promise<void>
}
function useAiRun(): RunState {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function go<T>(fn: () => Promise<T>, onResult: (v: T) => void) {
    setLoading(true); setError(null)
    try { onResult(await fn()) } catch (err) { setError(aiErrorMessage(err)) } finally { setLoading(false) }
  }
  return { loading, error, go }
}

function Field({ value, onChange, placeholder, rows, grow, onSubmit }: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number; grow?: boolean; onSubmit?: () => void }) {
  return (
    <div style={{ position: 'relative', display: 'flex', ...(grow ? { flex: 1, minHeight: 130 } : {}) }}>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={grow ? undefined : (rows ?? 3)}
        onKeyDown={(e) => { if (onSubmit && (e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSubmit() } }}
        style={{ width: '100%', resize: grow ? 'none' : 'vertical', height: grow ? '100%' : undefined, minHeight: grow ? undefined : 60, padding: '11px 42px 11px 13px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit' }} />
      <MicButton value={value} onChange={onChange} style={{ position: 'absolute', top: 8, right: 8, color: C.muted2 }} />
    </div>
  )
}

function RunButton({ label, loading, disabled, onClick }: { label: string; loading: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button className="c4ai-pri" onClick={onClick} disabled={loading || disabled}
      style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start', height: 36, padding: '0 16px', borderRadius: 10, border: 'none', background: C.accent, color: C.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (loading || disabled) ? 0.55 : 1 }}>
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
      {loading ? 'Thinking…' : label}
    </button>
  )
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null
  return <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 10, fontSize: 12, color: C.dangerText }}><AlertCircle size={13} style={{ flex: 'none', marginTop: 1 }} /> {error}</div>
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ marginTop: 16, padding: 16, borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, animation: 'c4ai-fade .25s ease' }}>{children}</div>
}
function Actions({ children }: { children: React.ReactNode }) {
  return <div style={{ marginTop: 15, display: 'flex', gap: 8 }}>{children}</div>
}
function PlanList({ lines }: { lines: string[] }) {
  if (lines.length === 0) return <div style={{ ...blurb, margin: '8px 0 0' }}>No changes proposed.</div>
  return <ul style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>{lines.map((l, i) => <li key={i} style={liStyle}>{l}</li>)}</ul>
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ ...blurb, padding: '8px 0' }}>{children}</div>
}

// ─── apply / format helpers ─────────────────────────────────────────

// EditActions bound to the live store — the seam applyEditPlan drives.
function storeEditActions(): EditActions {
  const s = useWorkspaceStore.getState()
  return {
    addPerson: (name) => s.addPerson(name),
    addSoftwareSystem: (name, external) => s.addSoftwareSystem(name, undefined, external ? 'External' : undefined),
    addContainer: (systemId, name) => s.addContainer(systemId, name),
    addComponent: (containerId, name) => s.addComponent(containerId, name),
    addRelationship: (src, dst, desc, tech) => s.addRelationship(src, dst, desc, tech),
    updateElement: (id, patch) => s.updateElement(id, patch),
    updateRelationship: (id, patch) => s.updateRelationship(id, patch),
    deleteElement: (id) => s.deleteElement(id),
  }
}

function applyPlanToStore(plan: EditPlan, ws: Workspace) {
  const s = useWorkspaceStore.getState()
  // Apply in batch mode so the per-op addContainer/addComponent don't jump the
  // canvas to each created view; then navigate ONCE to where the new elements are.
  // Validate and diff against the LIVE store (not the possibly-stale `ws` prop
  // snapshot) so the applier doesn't skip edits to elements added since the panel
  // rendered, and the navigation target is accurate.
  const liveBefore = s.workspace ?? ws
  const before = new Set(flattenElements(liveBefore).map((e) => e.id))
  s.setBatchApplying(true)
  let result
  try {
    result = applyEditPlan(plan, storeEditActions(), liveBefore)
  } finally {
    s.setBatchApplying(false)
  }
  const updated = useWorkspaceStore.getState().workspace
  const newIds = updated ? flattenElements(updated).filter((e) => !before.has(e.id)).map((e) => e.id) : []
  if (newIds.length) useWorkspaceStore.getState().focusViewForElements(newIds)
  return result
}

function summarize(ws: Workspace): string {
  const systems = ws.model.softwareSystems.length
  const containers = ws.model.softwareSystems.reduce((n, s) => n + s.containers.length, 0)
  const components = ws.model.softwareSystems.reduce((n, s) => n + s.containers.reduce((m, c) => m + c.components.length, 0), 0)
  const parts = [plural(ws.model.people.length, 'person', 'people'), plural(systems, 'system', 'systems'), plural(containers, 'container', 'containers')]
  if (components > 0) parts.push(plural(components, 'component', 'components'))
  parts.push(plural(ws.model.relationships.length, 'relationship', 'relationships'))
  return parts.join(' · ')
}
function hasContent(ws: Workspace): boolean { return ws.model.people.length > 0 || ws.model.softwareSystems.length > 0 }
function plural(n: number, one: string, many: string): string { return `${n} ${n === 1 ? one : many}` }
function adrFilename(topic: string): string {
  const slug = topic.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'decision'
  return `adr-${slug}.md`
}

// ─── style objects ──────────────────────────────────────────────────

const headerRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px 13px', borderBottom: `1px solid ${C.border}`, flex: 'none' }
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: C.muted3, margin: '18px 0 10px' }
const wizSecBtn: React.CSSProperties = { flex: 1, height: 40, borderRadius: 11, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }
const describeBtn: React.CSSProperties = { width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 13, padding: '14px 15px', borderRadius: 13, border: `1px solid ${C.border}`, background: C.card, cursor: 'pointer' }
const describeIcon: React.CSSProperties = { width: 38, height: 38, flex: 'none', borderRadius: 11, background: 'rgba(88,166,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent }
const iconBtn: React.CSSProperties = { width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer' }
const blurb: React.CSSProperties = { fontSize: 12, color: C.muted2, margin: '0 0 12px' }
const kicker: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted2 }
const fieldLabel: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: C.text }
const liStyle: React.CSSProperties = { fontSize: 13, color: C.text, lineHeight: 1.45 }
const primaryBtn: React.CSSProperties = { height: 32, padding: '0 14px', borderRadius: 10, border: 'none', background: C.accent, color: C.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }
const secondaryBtn: React.CSSProperties = { height: 32, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: 13, fontWeight: 500, cursor: 'pointer' }
const miniBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 11px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }
const keyInput: React.CSSProperties = { flex: 1, minWidth: 0, width: '100%', height: 38, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontFamily: 'ui-monospace, monospace', fontSize: 13 }
const chipBlue: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: '#142540', border: '1px solid rgba(37,99,235,0.4)', color: '#7dd3fc' }
