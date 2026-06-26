import { useEffect, useMemo, useState } from 'react'
import {
  X, Settings, Loader2, Sparkles, Check, Copy, Download, AlertCircle,
  Home, ArrowRight, KeyRound, ShieldCheck, ExternalLink,
  Pencil, Layers, Wand2, Folder, GitBranch, FileCode, ChevronRight, HelpCircle,
  Activity, Unlink, Cpu, Box, type LucideIcon,
} from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import { useWorkspaceStore, getActiveView, getScopeMemberIds } from '@/store/workspace'
import { useAiSettingsStore, isAiReady, activeAiConfig, type PanelPos } from '@/store/ai-settings'
import { AI_PROVIDER_META, AI_PROVIDER_IDS, type AiProviderId } from '@/lib/ai/providerMeta'
import { parseDSL } from '@/lib/dsl'
import { downloadFile } from '@/lib/exportUtils'
import type { View, Workspace } from '@/types/model'
import {
  createProvider, aiErrorMessage,
  generateDiagram, planEdit, autoDescribe, reviewArchitecture, draftAdr,
  interviewAsk, interviewKickoffMessage, interviewBuildPlan,
  scanRepo, canScanRepo, readRepoFiles, buildRepoBundle,
  applyEditPlan, describeOps, elementNameMap, flattenElements, viewLabel,
  buildDescribePreview, applyDescribePreview, countMissingDescriptions,
  findingsToMarkdown, sortedFindings, isActionable, classifyScope, modelHealth,
  type ModelGap, type ModelGapId,
  type AiProvider, type EditActions, type DescribeActions,
  type EditPlan, type DescribePreview, type AiFeatureId, type AiChatTurn,
  type ReviewResult, type ReviewFinding, type ReviewSeverity, type RepoScanResult, type PlanScope,
} from '@/lib/ai'
import { AI_FEATURES, ADR_FEATURE } from './aiFeatureMeta'
import { MicButton } from './dictation'

// ─── Palette (the "AI Assistant Hybrid" design) ─────────────────────

const C = {
  accent: '#58a6ff', accentHover: '#79b8ff', ink: '#0d1117',
  text: '#e6edf3', text2: '#c9d1d9', muted: '#8b949e', muted2: '#848d97', muted3: '#6e7681',
  panel: 'rgba(26,34,46,0.99)', card: '#161b22',
  border: 'rgba(88,166,255,0.16)', borderStrong: 'rgba(88,166,255,0.45)',
  green: '#22c55e', greenText: '#86efac',
  danger: '#ef4444', dangerText: '#fca5a5',
  warn: '#f97316', warnText: '#fdba74',
}

type TabId = 'home' | AiFeatureId

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

  const [tab, setTab] = useState<TabId>(() => useWorkspaceStore.getState().aiPanelFeature ?? 'home')
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
  const [pos, setPos] = useState<PanelPos | null>(settings.panelPos)

  function startDrag(e: React.PointerEvent) {
    const t = e.target as HTMLElement
    if (t.closest('button, input, textarea, a, select, [role="switch"]')) return
    if (!t.closest('[data-drag-handle]')) return
    const base = pos ?? { x: Math.max(8, window.innerWidth - PANEL_WIDTH - 14), y: 14 }
    const startX = e.clientX
    const startY = e.clientY
    let latest = base
    const move = (ev: PointerEvent) => {
      latest = {
        x: clampPx(base.x + ev.clientX - startX, 8, window.innerWidth - PANEL_WIDTH - 8),
        y: clampPx(base.y + ev.clientY - startY, 8, window.innerHeight - 44),
      }
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
    height: 'min(620px, calc(100dvh - 28px))',
    borderRadius: 12,
    // null → anchor top-right; once dragged → explicit left/top. `bottom: auto`
    // overrides DialogShell's docked full-height rail so our height applies.
    top: pos ? pos.y : 14,
    bottom: 'auto',
    ...(pos ? { left: pos.x, right: 'auto' } : { right: 14 }),
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
            tab={tab} setTab={setTab} onOpenSettings={openSettings} onClose={onClose}
          />
        )}
      </div>
    </DialogShell>
  )
}

const PANEL_WIDTH = 360
function clampPx(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max))
}

// ─── App (header + tabs + body) ─────────────────────────────────────

// Persistent nav: Home launcher + the four feature tabs.
const NAV_TABS: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  ...AI_FEATURES.map((f) => ({ id: f.id as TabId, label: f.label, icon: f.icon })),
]

function AppView({
  provider, workspace, model, tab, setTab, onOpenSettings, onClose,
}: {
  provider: AiProvider
  workspace: Workspace | null
  model: string
  tab: TabId
  setTab: (t: TabId) => void
  onOpenSettings: () => void
  onClose: () => void
}) {
  const section = AI_FEATURES.find((f) => f.id === tab) ?? (tab === 'adr' ? ADR_FEATURE : undefined)

  return (
    <>
      {/* header (drag handle) */}
      <div data-drag-handle style={{ ...headerRow, cursor: 'move' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, fontWeight: 700, color: C.text }}>
          <Sparkles size={17} color={C.accent} /> AI assistant
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span title={`Connected — ${model}`} style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, boxShadow: '0 0 6px rgba(34,197,94,0.6)' }} />
          <button onClick={onOpenSettings} className="c4ai-ghost" aria-label="AI settings" title="AI settings"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer' }}>
            <Settings size={13} />
          </button>
          <button onClick={onClose} className="c4ai-ghost" aria-label="Close" style={iconBtn}><X size={14} /></button>
        </div>
      </div>

      {/* mode tabs — the active tab keeps its label, the rest collapse to icons */}
      <div role="tablist" style={{ display: 'flex', gap: 5, padding: '8px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {NAV_TABS.map((t) => {
          const on = tab === t.id
          const Icon = t.icon
          return (
            <button key={t.id} role="tab" aria-selected={on} title={t.label} onClick={() => setTab(t.id)} className="c4ai-sec"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: on ? 7 : 0, height: 32, ...(on ? { padding: '0 12px', flex: '0 1 auto' } : { width: 34, flex: 'none' }), borderRadius: 8, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, background: on ? 'rgba(88,166,255,0.12)' : 'transparent', color: on ? C.accent : C.muted }}>
              <Icon size={15} />{on && <span>{t.label}</span>}
            </button>
          )
        })}
      </div>

      {/* body */}
      <div data-scroll style={{ padding: '18px 20px 22px', overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'home' ? (
          <HomeLauncher onPick={setTab} workspace={workspace} />
        ) : section?.needsWorkspace && !workspace ? (
          <Empty>Open or create a workspace to use this feature.</Empty>
        ) : (
          <FeatureBody feature={tab as AiFeatureId} provider={provider} workspace={workspace} onClose={onClose} />
        )}
      </div>
    </>
  )
}

const GAP_META: Record<ModelGapId, { icon: LucideIcon; tab: TabId; action: string }> = {
  descriptions: { icon: Wand2, tab: 'review', action: 'Auto-write' },
  unconnected: { icon: Unlink, tab: 'interview', action: 'Add links' },
  technology: { icon: Cpu, tab: 'review', action: 'Review' },
  emptySystems: { icon: Box, tab: 'review', action: 'Review' },
}

// Instant, no-AI model-health readout on Home. Each gap routes to its fix.
function ModelHealthCard({ gaps, onPick }: { gaps: ModelGap[]; onPick: (t: TabId) => void }) {
  return (
    <div style={{ marginBottom: 18, padding: 14, borderRadius: 12, border: `1px solid ${C.border}`, background: C.card }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: gaps.length ? 10 : 0 }}>
        <Activity size={15} color={C.accent} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>Model health</span>
      </div>
      {gaps.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12.5, color: C.text2 }}>
          <Check size={14} color={C.green} /> Looks tidy — everything’s described, connected, and typed.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {gaps.map((g) => {
            const m = GAP_META[g.id]
            const Icon = m.icon
            return (
              <button key={g.id} onClick={() => onPick(m.tab)} className="c4ai-sec"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 9px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: 26, height: 26, flex: 'none', borderRadius: 7, background: 'rgba(88,166,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent }}><Icon size={14} /></span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.text2 }}>{g.label}</span>
                <span style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>{m.action}</span>
                <ChevronRight size={14} color={C.muted3} style={{ flex: 'none' }} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function HomeLauncher({ onPick, workspace }: { onPick: (t: TabId) => void; workspace: Workspace | null }) {
  const gaps = workspace ? modelHealth(workspace) : []
  return (
    <>
      {workspace && <ModelHealthCard gaps={gaps} onPick={onPick} />}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted2, marginBottom: 13 }}>What do you want to do?</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {AI_FEATURES.map((f) => {
          const Icon = f.icon
          return (
            <button key={f.id} onClick={() => onPick(f.id)} className="c4ai-card"
              style={{ display: 'flex', gap: 13, alignItems: 'flex-start', textAlign: 'left', padding: 16, borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, cursor: 'pointer' }}>
              <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 10, background: 'rgba(88,166,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent }}><Icon size={19} /></span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.text }}>{f.label}</span>
                <span style={{ display: 'block', fontSize: 12, color: C.muted2, lineHeight: 1.45, marginTop: 2 }}>{f.blurb}</span>
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

function FeatureBody({ feature, provider, workspace, onClose }: { feature: AiFeatureId; provider: AiProvider; workspace: Workspace | null; onClose: () => void }) {
  switch (feature) {
    case 'compose': return <ComposeBody provider={provider} workspace={workspace} onClose={onClose} />
    case 'interview': return <InterviewBody provider={provider} onClose={onClose} />
    case 'review': return <ReviewBody provider={provider} workspace={workspace} />
    case 'repo': return <RepoBody provider={provider} workspace={workspace} onClose={onClose} />
    case 'adr': return <AdrBody provider={provider} workspace={workspace} />
  }
}

// ─── Describe (Generate + Edit merged) ──────────────────────────────

// Guess whether a compose prompt is building a new model or changing the current
// one, from its verbs. Defaults to "change" when ambiguous (safer — "new"
// replaces the workspace), and only "new" on clear build language.
function detectComposeMode(text: string): 'new' | 'change' {
  const t = text.toLowerCase()
  const change = /\b(add|change|connect|remove|rename|update|delete|set|move|introduce|split|insert|replace)\b/.test(t)
  const build = /\b(build|create|new model|new system|new diagram|model for|platform with|system with|design a)\b/.test(t)
  if (build && !change) return 'new'
  return 'change'
}

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
      <p style={blurb}>Say what you want — c4hero figures out whether you’re building a new model or changing the current one.</p>

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
                <button className="c4ai-pri" style={primaryBtn} disabled={!hasContent(parsed.workspace)} onClick={() => { if (hasUnsaved) setConfirmReplace(true); else load() }}>Load diagram</button>
                <button className="c4ai-sec" style={secondaryBtn} onClick={reset}>Discard</button>
              </Actions>
            </>
          ) : (
            <div style={{ marginTop: 14, padding: '13px 14px', borderRadius: 10, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', animation: 'c4ai-fade .2s ease' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                <AlertCircle size={16} color={C.warn} style={{ flex: 'none', marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fed7aa' }}>Replace {workspace?.name || 'the current model'}?</div>
                  <div style={{ fontSize: 12, lineHeight: 1.45, color: C.warnText, marginTop: 3 }}>It has <strong style={{ color: '#fed7aa' }}>unsaved changes</strong>. Loading the new model discards your current diagram — this can’t be undone. Save it first if you want to keep it.</div>
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

function InterviewBody({ provider, onClose }: { provider: AiProvider; onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const view = workspace && activeViewKey ? getActiveView(workspace, activeViewKey) : undefined

  const [history, setHistory] = useState<AiChatTurn[]>([])
  const [qa, setQa] = useState<{ q: string; a: string }[]>([])
  const [question, setQuestion] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [plan, setPlan] = useState<EditPlan | null>(null)
  const [target, setTarget] = useState(INTERVIEW_TARGET)
  const [wrapUp, setWrapUp] = useState(false)
  const run = useAiRun()
  const started = history.length > 0

  if (!workspace || !view) return <Empty>Open a view to start an interview.</Empty>
  const ws = workspace
  const v: View = view

  function start() {
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
  // Build from the committed transcript (always ends on a question), so the plan
  // request alternates cleanly. An unsent draft answer is ignored.
  function finish() { run.go(() => interviewBuildPlan(provider, ws, v, history), setPlan) }

  const planLines = plan ? describeOps(plan, ws) : []
  const answeredN = qa.length
  const dotCount = Math.max(target, answeredN + 1)

  return (
    <>
      <p style={blurb}>Filling in <span style={{ color: '#7dd3fc' }}>{viewLabel(v)}</span>. Answer a few questions; c4hero turns them into model updates.</p>

      {!started && !plan && <RunButton label="Start interview" loading={run.loading} onClick={start} />}

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
          {qa.length > 0 && <PlanPreviewBar provider={provider} ws={ws} view={v} history={history} />}
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
            <button className="c4ai-pri" style={primaryBtn} disabled={!planLines.length} onClick={() => { applyPlanToStore(plan, ws); onClose() }}>Apply changes</button>
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

// ─── Review (audit findings + auto-describe tidy-up) ────────────────

/** Auto-describe, folded into the Review tab as a tidy-up card. */
function DescribeSection({ provider, workspace }: { provider: AiProvider; workspace: Workspace | null }) {
  const missing = workspace ? countMissingDescriptions(workspace) : 0
  const run = useAiRun()
  const [preview, setPreview] = useState<DescribePreview | null>(null)
  const count = preview ? preview.elements.length + preview.relationships.length : 0

  function apply() {
    if (!preview) return
    const s = useWorkspaceStore.getState()
    const actions: DescribeActions = {
      updateElement: (id, patch) => s.updateElement(id, patch),
      updateRelationship: (id, patch) => s.updateRelationship(id, patch),
    }
    applyDescribePreview(preview, actions)
    setPreview(null)
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ padding: '12px 13px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Wand2 size={16} color={C.accent} style={{ flex: 'none' }} />
          <span style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.4 }}>{missing === 0 ? 'Every element and relationship has a description.' : `${missing} item(s) are missing a description.`}</span>
        </div>
        <button className="c4ai-pri" disabled={missing === 0 || run.loading}
          onClick={() => run.go(async () => buildDescribePreview(await autoDescribe(provider, workspace!), workspace!), setPreview)}
          style={{ marginTop: 11, display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 13px', borderRadius: 8, border: 'none', background: C.accent, color: C.ink, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (missing === 0 || run.loading) ? 0.55 : 1 }}>
          {run.loading ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} {run.loading ? 'Thinking…' : 'Auto-write descriptions'}
        </button>
      </div>
      <ErrorLine error={run.error} />
      {preview && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{count} suggested description(s)</div>
          {count === 0 ? <div style={{ ...blurb, margin: '8px 0 0' }}>No applicable suggestions.</div> : (
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {preview.elements.map((p) => <li key={`e-${p.id}`} style={liStyle}><strong>{p.label}:</strong> {p.description}</li>)}
              {preview.relationships.map((p) => <li key={`r-${p.id}`} style={liStyle}><strong>{p.label}:</strong> {p.description}</li>)}
            </ul>
          )}
          <Actions>
            <button className="c4ai-pri" style={primaryBtn} disabled={count === 0} onClick={apply}>Apply descriptions</button>
            <button className="c4ai-sec" style={secondaryBtn} onClick={() => setPreview(null)}>Discard</button>
          </Actions>
        </Card>
      )}
    </div>
  )
}

type ReviewScope = 'view' | 'workspace'
type FindingStatus = 'applied' | 'dismissed'

const SEV: Record<ReviewSeverity, { dot: string; text: string; line: string; label: string }> = {
  high: { dot: C.danger, text: C.dangerText, line: 'rgba(239,68,68,0.18)', label: 'High' },
  medium: { dot: C.warn, text: C.warnText, line: 'rgba(249,115,22,0.18)', label: 'Medium' },
  low: { dot: C.muted2, text: C.muted, line: 'rgba(132,141,151,0.18)', label: 'Low' },
}

function ReviewBody({ provider, workspace }: { provider: AiProvider; workspace: Workspace | null }) {
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const activeView = workspace && activeViewKey ? getActiveView(workspace, activeViewKey) : undefined

  const [scope, setScope] = useState<ReviewScope>('view')
  const run = useAiRun()
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [status, setStatus] = useState<Record<number, FindingStatus>>({})
  const [copied, setCopied] = useState(false)

  const canView = !!activeView
  const effScope: ReviewScope = canView ? scope : 'workspace'
  const findings = result ? sortedFindings(result) : []
  const names = workspace ? elementNameMap(workspace) : new Map<string, string>()
  const indexOf = (f: ReviewFinding) => findings.indexOf(f)

  function runReview() {
    run.go(() => reviewArchitecture(provider, workspace!, effScope === 'view' ? activeView : null), (r) => { setResult(r); setStatus({}) })
  }
  function applyOne(f: ReviewFinding) {
    const i = indexOf(f)
    if (!workspace || !isActionable(f)) return
    applyPlanToStore({ operations: f.operations ?? [] }, workspace)
    setStatus((s) => ({ ...s, [i]: 'applied' }))
  }
  function applyAll() {
    if (!workspace) return
    const next = { ...status }
    findings.forEach((f, i) => { if (isActionable(f) && !status[i]) { applyPlanToStore({ operations: f.operations ?? [] }, workspace); next[i] = 'applied' } })
    setStatus(next)
  }
  function copyMd() {
    if (!result) return
    navigator.clipboard?.writeText(findingsToMarkdown(result)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  }

  const pending = findings.filter((f, i) => isActionable(f) && !status[i]).length
  const fixable = findings.filter(isActionable).length
  const groups = (['high', 'medium', 'low'] as ReviewSeverity[])
    .map((sev) => ({ sev, items: findings.filter((f) => f.severity === sev) }))
    .filter((g) => g.items.length > 0)

  return (
    <>
      <DescribeSection provider={provider} workspace={workspace} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: C.muted2 }}>Scope:</span>
          <div style={segWrap}>
            <button onClick={() => setScope('view')} disabled={!canView} style={segBtn(effScope === 'view')} title={canView ? undefined : 'Open a view to scope to it'}>This view</button>
            <button onClick={() => setScope('workspace')} style={segBtn(effScope === 'workspace')}>Whole model</button>
          </div>
        </div>
        {result && findings.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <button className="c4ai-sec" onClick={copyMd} style={{ ...miniBtn, border: `1px solid ${C.border}`, background: 'transparent', color: C.text }}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}</button>
            {pending > 0 && <button className="c4ai-pri" onClick={applyAll} style={{ ...miniBtn, border: 'none', background: C.accent, color: C.ink, fontWeight: 600 }}>Apply all ({pending})</button>}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <RunButton label={result ? 'Re-run review' : 'Review architecture'} loading={run.loading} onClick={runReview} />
      </div>
      <ErrorLine error={run.error} />

      {result && (
        findings.length === 0 ? (
          <div style={{ ...blurb, marginTop: 14 }}>This {effScope === 'view' ? 'view' : 'model'} looks complete — nothing to flag.</div>
        ) : (
          <>
            <div style={{ marginTop: 12, fontSize: 13, color: C.muted }}><span style={{ color: C.text, fontWeight: 600 }}>{findings.length} finding{findings.length === 1 ? '' : 's'}</span> · {fixable} fixable</div>
            {groups.map((g) => (
              <div key={g.sev}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: SEV[g.sev].dot }} />
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: SEV[g.sev].text }}>{SEV[g.sev].label}</span>
                  <span style={{ fontSize: 11, color: C.muted2 }}>{g.items.length}</span>
                  <span style={{ flex: 1, height: 1, background: SEV[g.sev].line }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  {g.items.map((f) => <FindingCard key={indexOf(f)} finding={f} names={names} status={status[indexOf(f)]} onApply={() => applyOne(f)} onDismiss={() => setStatus((s) => ({ ...s, [indexOf(f)]: 'dismissed' }))} />)}
                </div>
              </div>
            ))}
          </>
        )
      )}
    </>
  )
}

function FindingCard({ finding, names, status, onApply, onDismiss }: { finding: ReviewFinding; names: Map<string, string>; status?: FindingStatus; onApply: () => void; onDismiss: () => void }) {
  const actionable = isActionable(finding)
  const done = status === 'applied' || status === 'dismissed'
  const affected = finding.elementIds.map((id) => names.get(id) ?? id).filter(Boolean)
  return (
    <div style={{ display: 'flex', borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, overflow: 'hidden', opacity: done ? 0.6 : 1 }}>
      <span style={{ width: 3, flex: 'none', background: SEV[finding.severity].dot }} />
      <div style={{ padding: '13px 15px', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{finding.title}</span>
          <span style={pillGrey}>{finding.category}</span>
          {status === 'applied' && <span style={{ ...pillGrey, background: 'rgba(34,197,94,0.14)', color: C.greenText }}>✓ applied</span>}
          {status === 'dismissed' && <span style={pillGrey}>dismissed</span>}
        </div>
        <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.5, marginTop: 6 }}>{finding.detail}</div>
        {affected.length > 0 && !done && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: C.muted2 }}>Affects:</span>
            {affected.map((name, i) => <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 6, background: '#142540', border: '1px solid rgba(37,99,235,0.4)', fontSize: 11, color: '#7dd3fc' }}>{name}</span>)}
          </div>
        )}
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginTop: 8 }}><strong style={{ color: C.text }}>Suggestion:</strong> {finding.suggestion}</div>
        {!done && (
          <div style={{ marginTop: 11, display: 'flex', gap: 8, alignItems: 'center' }}>
            {actionable && <button className="c4ai-pri" style={{ ...miniBtn, height: 30, border: 'none', background: C.accent, color: C.ink, fontWeight: 600 }} onClick={onApply}>Apply fix</button>}
            <button className="c4ai-sec" style={{ ...miniBtn, height: 30, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted }} onClick={onDismiss}>Dismiss</button>
            {!actionable && <span style={{ fontSize: 11, color: C.muted2 }}>Advisory — no automatic fix</span>}
          </div>
        )}
      </div>
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
    const newSystems = ws1.model.softwareSystems
      .filter((s) => !beforeSystemIds.has(s.id) && s.location !== 'External')
      .sort((a, b) => b.containers.length - a.containers.length)
    let primaryKey: string | null = null
    for (const sys of newSystems) {
      const key = after.addView('container', sys.id, `${sys.name} — Containers`)
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
  return (
    <>
      <p style={blurb}>Point c4hero at a local repository. It reads the code on your machine and proposes model updates from what it finds — each carrying the file it came from.</p>
      <button onClick={choose} className="c4ai-card"
        style={{ width: '100%', display: 'flex', gap: 14, alignItems: 'center', textAlign: 'left', padding: 18, borderRadius: 12, border: `1px dashed ${C.borderStrong}`, background: C.card, cursor: 'pointer' }}>
        <span style={{ width: 46, height: 46, flex: 'none', borderRadius: 11, background: 'rgba(88,166,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent }}><Folder size={24} /></span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.text }}>Choose a folder…</span>
          <span style={{ display: 'block', fontSize: 12, color: C.muted2, lineHeight: 1.45, marginTop: 2 }}>Reads a repo locally and proposes updates from the code.</span>
        </span>
      </button>
      <ErrorLine error={error} />
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '11px 13px', borderRadius: 10, background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)' }}>
        <ShieldCheck size={14} color={C.accent} style={{ flex: 'none', marginTop: 1 }} />
        <span style={{ fontSize: 11.5, lineHeight: 1.45, color: C.text2 }}>Files are read in your browser. Only the file tree and key manifest/config files are sent to your AI provider with your key — c4hero has no server.</span>
      </div>
    </>
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

function ProviderPicker({ value, onPick }: { value: AiProviderId; onPick: (id: AiProviderId) => void }) {
  return (
    <div style={{ display: 'flex', gap: 7 }}>
      {AI_PROVIDER_IDS.map((id) => {
        const on = id === value
        return (
          <button key={id} onClick={() => onPick(id)}
            style={{ flex: 1, height: 36, borderRadius: 10, fontSize: 13, cursor: 'pointer', background: on ? 'rgba(88,166,255,0.1)' : 'transparent', border: `1px solid ${on ? C.borderStrong : C.border}`, color: on ? C.text : C.muted, fontWeight: on ? 600 : 500 }}>
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
  const { enabled, showInTopBar, provider, apiKeys, models, update, setApiKey, setModel } = useAiSettingsStore()
  const meta = AI_PROVIDER_META[provider]
  const [reveal, setReveal] = useState(false)
  const [edit, setEdit] = useState(false)
  const modelListId = `c4ai-models-${provider}`
  const key = apiKeys[provider] ?? ''
  const maskedKey = key.length > 10 ? `${key.slice(0, 6)}····${key.slice(-3)}` : (key ? '••••••' : '—')
  const providerName = meta.label.replace(/ \(Claude\)$/, '')
  const model = models[provider] || meta.defaultModel

  return (
    <div data-scroll style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div data-drag-handle style={{ ...headerRow, cursor: 'move' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, fontWeight: 700, color: C.text }}><KeyRound size={16} color={C.accent} /> AI settings</span>
        <button onClick={onDone ?? onClose} className="c4ai-ghost" aria-label="Close" style={iconBtn}><X size={14} /></button>
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
            <button className="c4ai-sec" onClick={() => setEdit(true)} style={{ height: 36, borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Change key or provider</button>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div><div style={fieldLabel}>Enable AI features</div><div style={{ fontSize: 12, color: C.muted2, marginTop: 2 }}>Show the AI assistant and its commands.</div></div>
              <button role="switch" aria-checked={enabled} onClick={() => update({ enabled: !enabled })} style={{ width: 36, height: 20, borderRadius: 999, background: enabled ? C.accent : 'rgba(255,255,255,0.16)', position: 'relative', flex: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <span style={{ position: 'absolute', top: 2, [enabled ? 'right' : 'left']: 2, width: 16, height: 16, borderRadius: '50%', background: enabled ? C.ink : C.text } as React.CSSProperties} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div><div style={fieldLabel}>Show AI button in top bar</div><div style={{ fontSize: 12, color: C.muted2, marginTop: 2 }}>When off, open the assistant from the command palette (⌘K).</div></div>
              <button role="switch" aria-checked={showInTopBar} onClick={() => update({ showInTopBar: !showInTopBar })} style={{ width: 36, height: 20, borderRadius: 999, background: showInTopBar ? C.accent : 'rgba(255,255,255,0.16)', position: 'relative', flex: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <span style={{ position: 'absolute', top: 2, [showInTopBar ? 'right' : 'left']: 2, width: 16, height: 16, borderRadius: '50%', background: showInTopBar ? C.ink : C.text } as React.CSSProperties} />
              </button>
            </div>

            <SecurityNote />
            <button onClick={() => { setApiKey(''); onClose() }} style={{ height: 34, borderRadius: 10, border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: C.dangerText, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Disconnect key</button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={fieldLabel}>Provider</div>
              <ProviderPicker value={provider} onPick={(id) => update({ provider: id })} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={fieldLabel}>{meta.keyLabel}</div>
                <a href={meta.keyHelpUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.accent }}>{meta.keyHelpLabel} <ExternalLink size={11} /></a>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type={reveal ? 'text' : 'password'} value={apiKeys[provider] ?? ''} onChange={(e) => setApiKey(e.target.value)} placeholder={meta.keyPlaceholder} autoComplete="off" spellCheck={false} style={keyInput} />
                <button className="c4ai-sec" onClick={() => setReveal((r) => !r)} style={{ ...secondaryBtn, height: 38, padding: '0 12px' }}>{reveal ? 'Hide' : 'Show'}</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={fieldLabel}>Model</div>
              <input list={modelListId} value={models[provider] ?? ''} onChange={(e) => setModel(e.target.value)} placeholder={meta.defaultModel} autoComplete="off" spellCheck={false} style={keyInput} />
              <datalist id={modelListId}>{meta.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</datalist>
            </div>
            <SecurityNote />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="c4ai-sec" onClick={() => setEdit(false)} style={{ ...secondaryBtn, height: 34 }}>Cancel</button>
              <button className="c4ai-pri" onClick={() => setEdit(false)} style={{ ...primaryBtn, height: 34 }}>Save</button>
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

function applyPlanToStore(plan: EditPlan, ws: Workspace) {
  const s = useWorkspaceStore.getState()
  const actions: EditActions = {
    addPerson: (name) => s.addPerson(name),
    addSoftwareSystem: (name, external) => s.addSoftwareSystem(name, undefined, external ? 'External' : undefined),
    addContainer: (systemId, name) => s.addContainer(systemId, name),
    addComponent: (containerId, name) => s.addComponent(containerId, name),
    addRelationship: (src, dst, desc, tech) => s.addRelationship(src, dst, desc, tech),
    updateElement: (id, patch) => s.updateElement(id, patch),
    updateRelationship: (id, patch) => s.updateRelationship(id, patch),
    deleteElement: (id) => s.deleteElement(id),
  }
  applyEditPlan(plan, actions, ws)
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
const pillGrey: React.CSSProperties = { fontSize: 10.5, padding: '1px 8px', borderRadius: 999, background: 'rgba(132,141,151,0.16)', color: C.muted }
const segWrap: React.CSSProperties = { display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }
function segBtn(active: boolean): React.CSSProperties {
  return { height: 28, padding: '0 12px', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: active ? C.accent : 'transparent', color: active ? C.ink : C.muted }
}
