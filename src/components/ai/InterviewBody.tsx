import { useEffect, useMemo, useState } from 'react'
import { usePersistentState, clearAiSession } from './sessionCache'
import { Loader2, Sparkles, ArrowRight, MessagesSquare, HelpCircle, CornerDownRight, ChevronRight, Layers, X } from 'lucide-react'
import { useWorkspaceStore, getActiveView } from '@/store/workspace'
import {
  interviewAskStream, interviewKickoffMessage, interviewBuildPlan,
  describeOps, flattenElements, viewLabel, classifyPlanScopes, escapeRegExp,
  type AiProvider, type EditPlan, type AiChatTurn, type PlanScope,
} from '@/lib/ai'
import type { View, Workspace } from '@/types/model'
import { C, blurb, primaryBtn, secondaryBtn } from './aiTheme'
import { useAiRun, runApply, type AppliedInfo } from './aiHelpers'
import { Empty, Field, ErrorLine, AppliedSummary, Card, Actions, PlanList } from './aiPrimitives'

// Questions per round before offering to wrap up (the interview is otherwise
// open-ended; "Keep going" adds another round).
const INTERVIEW_TARGET = 5

export function InterviewBody({ provider }: { provider: AiProvider }) {
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
  // Post-apply summary (standalone flow only): the panel stays open with the
  // start screen ready for another round, plus a one-shot Undo.
  const [applied, setApplied] = useState<AppliedInfo | null>(null)
  const [target, setTarget] = useState(INTERVIEW_TARGET)
  const [wrapUp, setWrapUp] = useState(false)
  // The question as it streams in, token-by-token. Transient (not persisted, to
  // avoid a sessionStorage write per token) — `null` once settled into `question`.
  const [streamingQ, setStreamingQ] = useState<string | null>(null)
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

  // A failed stream leaves a partial question dangling — drop it so retry starts
  // clean and the box falls back to the last settled question.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (run.error) setStreamingQ(null) }, [run.error])

  if (!workspace || !view) return <Empty>Open a view to start an interview.</Empty>
  const ws = workspace
  const v: View = view

  // Accumulate streamed tokens into the transient question; commit clears it and
  // writes the final text into the persisted `question`.
  const streamQ = (delta: string) => setStreamingQ((s) => (s ?? '') + delta)
  function commitQuestion(q: string) { setStreamingQ(null); setQuestion(q) }
  function start() {
    setApplied(null)
    setPinnedKey(activeViewKey) // pin the interview to the view it began on
    setWrapUp(false); setTarget(INTERVIEW_TARGET); setQa([])
    setStreamingQ('')
    run.go(async (signal) => {
      const kickoff = interviewKickoffMessage(v)
      const q = await interviewAskStream(provider, ws, v, [], kickoff, streamQ, signal)
      setHistory([{ role: 'user', content: kickoff }, { role: 'assistant', content: q }])
      return q
    }, commitQuestion)
  }
  function answerNext() {
    if (!question || !answer.trim()) return
    const a = answer.trim()
    setQa((p) => [...p, { q: question, a }])
    setAnswer('')
    setWrapUp(qa.length + 1 >= target) // hit the planned count → offer to wrap up
    setStreamingQ('')
    // Always fetch the next question so the transcript ends on a question
    // (keeps history alternating, and the next one is ready if they continue).
    run.go(async (signal) => {
      const q = await interviewAskStream(provider, ws, v, history, a, streamQ, signal)
      setHistory([...history, { role: 'user', content: a }, { role: 'assistant', content: q }])
      return q
    }, commitQuestion)
  }
  function skip() {
    if (!question || run.loading) return
    const msg = 'Let’s skip that one — ask me something else.'
    setAnswer('')
    setStreamingQ('')
    run.go(async (signal) => {
      const q = await interviewAskStream(provider, ws, v, history, msg, streamQ, signal)
      setHistory([...history, { role: 'user', content: msg }, { role: 'assistant', content: q }])
      return q
    }, commitQuestion)
  }
  function keepGoing() { setWrapUp(false); setTarget((t) => t + INTERVIEW_TARGET) }
  // Discard the pinned conversation and offer a fresh interview on the view the
  // user is now looking at.
  function reground() { setHistory([]); setQa([]); setQuestion(null); setAnswer(''); setPinnedKey(null); setWrapUp(false); setPlan(null); setStreamingQ(null) }
  // Build from the committed transcript (always ends on a question), so the plan
  // request alternates cleanly. An unsent draft answer is ignored.
  function finish() { run.go(() => interviewBuildPlan(provider, ws, v, history), setPlan) }

  const planLines = plan ? describeOps(plan, ws) : []
  const answeredN = qa.length
  const dotCount = Math.max(target, answeredN + 1)

  return (
    <>
      {applied && (
        <AppliedSummary
          info={applied} liveWs={ws}
          onUndo={() => { useWorkspaceStore.getState().undo(); setPlan(applied.plan); setApplied(null) }}
        />
      )}
      {mismatched && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', marginBottom: 12, borderRadius: 9, border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.08)', fontSize: 11.5, color: C.muted2 }}>
          <MessagesSquare size={13} color="#c4b5fd" style={{ flex: 'none' }} />
          <span style={{ flex: 1, minWidth: 0 }}>About <strong style={{ color: C.text2 }}>{viewLabel(v)}</strong> — you’re viewing a different one.</span>
          <button onClick={reground} style={{ flex: 'none', border: 'none', background: 'transparent', color: '#c4b5fd', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Re-ground</button>
        </div>
      )}
      {!started && !plan ? (
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
            {run.loading && !streamingQ
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: C.muted2 }}><Loader2 size={14} className="animate-spin" color={C.accent} /> Thinking…</span>
              : streamingQ
                ? <span style={{ display: 'block' }}>{streamingQ}<span style={{ animation: 'c4ai-node 1.1s ease-in-out infinite' }}>▍</span></span>
                : <span key={question} style={{ display: 'block', animation: 'c4ai-rise .3s ease both' }}>{question}</span>}
          </div>
          {run.loading && (
            <button onClick={() => { run.cancel(); setStreamingQ(null) }} className="c4ai-ghost"
              style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <X size={12} /> Stop
            </button>
          )}
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

      {/* retry re-runs the failed call from its closure — an interview answer
          is cleared from the input on send, so "try again" must not need it. */}
      <ErrorLine error={run.error} onRetry={run.retry} />

      {plan && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{planLines.length} proposed change(s) from your answers</div>
          <PlanList lines={planLines} />
          <Actions>
            <button className="c4ai-pri" style={primaryBtn} disabled={!planLines.length}
              onClick={() => {
                // Keep the panel open: apply, then reset the conversation and show
                // the applied summary with the start screen ready for another round.
                const info = runApply(plan, ws)
                clearAiSession('interview')
                reground()
                setApplied(info)
              }}>
              Apply changes
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
  // Both walk the whole model; memoize so toggling open/loading doesn't re-walk
  // it every render (plan/ws/view are the only inputs that change the result).
  const lines = useMemo(() => (plan ? describeOps(plan, ws) : []), [plan, ws])
  const scopes = useMemo(() => (plan ? classifyPlanScopes(plan, ws, view) : []), [plan, ws, view])
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
      <ErrorLine error={run.error} onRetry={run.retry} />
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
