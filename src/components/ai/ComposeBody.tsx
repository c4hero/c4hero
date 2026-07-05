import { useState, useMemo, useRef, useEffect } from 'react'
import { Sparkles, Pencil, SquarePen, Wand2, ArrowRight, Layers, AlertCircle, Loader2, X, HelpCircle, Copy, Check } from 'lucide-react'
import { useWorkspaceStore, getActiveView } from '@/store/workspace'
import { parseDSL } from '@/lib/dsl'
import {
  generateDiagramStream, planEdit, detectComposeMode, isQuestion, answerQuestionStream,
  describeOps, flattenElements, viewLabel,
  type AiProvider, type EditPlan,
} from '@/lib/ai'
import type { Workspace, View } from '@/types/model'
import { C, kicker, chipBlue, primaryBtn, secondaryBtn } from './aiTheme'
import { useAiRun, runApply, plural, type AppliedInfo } from './aiHelpers'
import { Field, RunButton, ErrorLine, Card, Actions, PlanList, AppliedSummary } from './aiPrimitives'

// Static fallbacks for an empty/new model (nothing to reference yet).
const DESCRIBE_EXAMPLES = [
  'Add a Redis cache between the Web App and the database',
  'Split the monolith into separate Orders and Payments services',
  'Add Stripe as an external payment system the API calls',
]

/** Example prompts templated with the open model's real element names, so the
 *  suggestions feel aware of what's on screen — no AI call, pure string assembly.
 *  Falls back to the static examples for a small or empty model. */
function describeExamples(ws: Workspace | null): string[] {
  if (!ws) return DESCRIBE_EXAMPLES
  const els = flattenElements(ws)
  const systems = els.filter((e) => e.type === 'softwareSystem').map((e) => e.name)
  const containers = els.filter((e) => e.type === 'container').map((e) => e.name)
  const out: string[] = []
  if (containers.length >= 2) out.push(`Add a Redis cache between ${containers[0]} and ${containers[1]}`)
  else if (containers.length === 1) out.push(`Add a Redis cache in front of ${containers[0]}`)
  if (systems.length >= 1) out.push(`Add Stripe as an external payment system that ${systems[0]} calls`)
  if (containers.length >= 1) out.push(`Split ${containers[0]} into separate read and write services`)
  else if (systems.length >= 1) out.push(`Split ${systems[0]} into separate Orders and Payments services`)
  // Pad from the static list (de-duped) if the model was too small to fill three.
  for (const e of DESCRIBE_EXAMPLES) { if (out.length >= 3) break; if (!out.includes(e)) out.push(e) }
  return out.slice(0, 3)
}

export function ComposeBody({ provider, workspace, onClose }: { provider: AiProvider; workspace: Workspace | null; onClose: () => void }) {
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)
  const undoLen = useWorkspaceStore((s) => s.undoStack.length)
  const lastSaved = useWorkspaceStore((s) => s.lastSavedUndoLength)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const hasUnsaved = !!workspace && undoLen !== lastSaved
  const activeView = workspace && activeViewKey ? getActiveView(workspace, activeViewKey) : undefined

  const [text, setText] = useState('')
  const run = useAiRun()
  const [dsl, setDsl] = useState<string | null>(null)
  // Raw text as it streams in (fences/preamble and all) — a live "it's working"
  // preview shown until the final DSL parses into the clean card below.
  const [streamText, setStreamText] = useState('')
  // Grounded Q&A answer (streamed). Non-null once an ask starts; the answer card
  // shows it building token-by-token.
  const [answer, setAnswer] = useState<string | null>(null)
  const [answerCopied, setAnswerCopied] = useState(false)
  const [plan, setPlan] = useState<EditPlan | null>(null)
  // Post-apply summary. The panel stays open (the moment after an apply is when
  // follow-up changes are most likely), with a one-shot Undo.
  const [applied, setApplied] = useState<AppliedInfo | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  // Examples templated from the open model's real names (recomputed only when the
  // model changes) — see describeExamples.
  const examples = useMemo(() => describeExamples(workspace), [workspace])
  const parsed = useMemo(() => (dsl ? parseDSL(dsl) : null), [dsl])
  // Flatten the parsed preview once (the chip row read it three times per render).
  const parsedElements = useMemo(() => (parsed ? flattenElements(parsed.workspace) : []), [parsed])
  const planLines = plan && workspace ? describeOps(plan, workspace) : []

  // Keep the streaming code view pinned to the newest tokens as they arrive.
  const streamRef = useRef<HTMLPreElement>(null)
  useEffect(() => { const el = streamRef.current; if (el) el.scrollTop = el.scrollHeight }, [streamText])

  // Auto-detect intent. Without a workspace there's nothing to change or ask about
  // → "new". With one, a question routes to grounded Q&A; anything else is an edit.
  const intent: 'new' | 'change' | 'ask' = !workspace ? 'new' : isQuestion(text) ? 'ask' : detectComposeMode(text)
  const DetIcon = intent === 'new' ? Sparkles : intent === 'ask' ? HelpCircle : Pencil
  const detectedHint = !text.trim()
    ? 'Intent is detected automatically as you type.'
    : intent === 'new' ? 'Detected: new model — opens in a new workspace.'
    : intent === 'ask' ? 'Detected: question — I’ll answer from your model.'
    : `Detected: change to ${workspace?.name || 'the current model'}.`

  function reset() { setDsl(null); setPlan(null); setApplied(null); setConfirmReplace(false); setStreamText(''); setAnswer(null) }
  const canRun = !!text.trim() && (intent === 'new' || !!workspace)

  // Stream a grounded answer into the answer card. `view` scopes it to a screen
  // (Explain this view); null grounds on the whole model (a typed question).
  function ask(question: string, view: View | null) {
    reset()
    setAnswer('')
    run.go((signal) => answerQuestionStream(provider, workspace!, view, question, (d) => setAnswer((a) => (a ?? '') + d), signal), (full) => setAnswer(full))
  }

  function submit() {
    if (!canRun || run.loading) return
    // Question → grounded prose answer (streamed), grounded on the whole model.
    if (intent === 'ask') { ask(text, null); return }
    reset()
    // New model → stream the DSL in as it generates (an 8k-token call runs
    // 30–60s on reasoning models). `onText` gets raw chunks; accumulate them for
    // the live preview, and `go`'s result is the extracted, parse-ready DSL.
    if (intent === 'new') run.go((signal) => generateDiagramStream(provider, text, (delta) => setStreamText((t) => t + delta), signal), setDsl)
    else run.go(() => planEdit(provider, workspace!, text), setPlan)
  }
  function explainView() {
    if (!workspace || !activeView || run.loading) return
    setText('')
    ask(`Explain this view (${viewLabel(activeView)}): walk through its main elements, how they interact, and its overall purpose. Keep it to a short narrative suitable for onboarding docs.`, activeView)
  }
  function copyAnswer() { if (answer) navigator.clipboard?.writeText(answer).then(() => { setAnswerCopied(true); setTimeout(() => setAnswerCopied(false), 1500) }).catch(() => {}) }
  function load() { if (parsed) { loadWorkspace(parsed.workspace); onClose() } }
  const done = !!parsed || !!plan || !!applied || answer !== null

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '6px 0 2px', marginBottom: 13 }}>
        <span style={{ position: 'relative', width: 60, height: 60, borderRadius: 16, background: 'rgba(88,166,255,0.12)', border: '1px solid rgba(88,166,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7dd3fc', animation: 'c4ai-pop .5s cubic-bezier(.34,1.56,.64,1) both' }}>
          <SquarePen size={26} />
          <span style={{ position: 'absolute', inset: -1, borderRadius: 16, border: '1px solid rgba(88,166,255,0.35)', animation: 'c4ai-ringpulse 2.4s ease-out infinite' }} />
        </span>
        <h2 style={{ margin: '16px 0 0', fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: '-.01em' }}>Describe <span style={{ color: '#7dd3fc' }}>a change</span></h2>
        <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55, color: C.muted2, maxWidth: 300 }}>Tell me what to build or change — or ask a question about your model. I detect the intent and preview any edits before applying.</p>
      </div>

      {!done && !text.trim() && (
        <div style={{ marginBottom: 13 }}>
          {workspace && activeView && (
            <button onClick={explainView} className="c4ai-card"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '11px 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, cursor: 'pointer', marginBottom: 12 }}>
              <span style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: 'rgba(88,166,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent }}><HelpCircle size={16} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text }}>Explain this view</span>
                <span style={{ display: 'block', fontSize: 11.5, color: C.muted2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>A narrative walkthrough of {viewLabel(activeView)}</span>
              </span>
              <ArrowRight size={14} color={C.muted3} style={{ flex: 'none' }} />
            </button>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted3, marginBottom: 8 }}>Try one of these</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {examples.map((ex, i) => (
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
      <RunButton label={intent === 'new' ? 'Generate diagram' : intent === 'ask' ? 'Ask' : 'Plan changes'} loading={run.loading} disabled={!canRun} onClick={submit} />
      <ErrorLine error={run.error} />

      {answer !== null && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={kicker}>Answer</span>
            {run.loading
              ? <button onClick={run.cancel} className="c4ai-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 9px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><X size={12} /> Stop</button>
              : answer.trim() && <button onClick={copyAnswer} className="c4ai-sec" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 9px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{answerCopied ? <Check size={12} /> : <Copy size={12} />} {answerCopied ? 'Copied' : 'Copy'}</button>}
          </div>
          <div data-scroll style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.55, color: C.text2, maxHeight: 320, overflowY: 'auto' }}>
            {answer || (run.loading ? 'Thinking…' : '')}{run.loading && <span style={{ animation: 'c4ai-node 1.1s ease-in-out infinite' }}>▍</span>}
          </div>
        </Card>
      )}

      {run.loading && intent === 'new' && streamText && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Loader2 size={13} className="animate-spin" color={C.accent} />
            <span style={kicker}>Generating diagram…</span>
            <button onClick={run.cancel} className="c4ai-ghost" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 9px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><X size={12} /> Stop</button>
          </div>
          <pre ref={streamRef} data-scroll style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '10px 0 0', fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.55, color: C.text2, maxHeight: 220, overflowY: 'auto' }}>
            {streamText}<span style={{ animation: 'c4ai-node 1.1s ease-in-out infinite' }}>▍</span>
          </pre>
        </Card>
      )}

      {parsed && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span style={kicker}>Preview</span>
            <span style={{ fontSize: 12, color: C.muted }}>{summarize(parsed.workspace)}</span>
          </div>
          <div style={{ ...kicker, marginTop: 14 }}>Elements</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
            {parsedElements.slice(0, 6).map((el) => <span key={el.id} style={chipBlue}>{el.name}</span>)}
            {parsedElements.length > 6 && <span style={{ ...chipBlue, color: C.muted, borderColor: C.border, background: 'rgba(255,255,255,0.04)' }}>+{parsedElements.length - 6} more</span>}
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
            <button className="c4ai-pri" style={primaryBtn} disabled={!planLines.length}
              onClick={() => { if (workspace) { setApplied(runApply(plan, workspace)); setPlan(null); setText('') } }}>Apply changes</button>
            <button className="c4ai-sec" style={secondaryBtn} onClick={() => setPlan(null)}>Discard</button>
          </Actions>
        </Card>
      )}

      {applied && (
        <AppliedSummary
          info={applied} liveWs={workspace}
          onUndo={() => { useWorkspaceStore.getState().undo(); setPlan(applied.plan); setApplied(null) }}
          hint="Describe another change to keep going."
        />
      )}
    </>
  )
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
