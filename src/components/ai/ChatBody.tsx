import { useEffect, useMemo, useRef } from 'react'
import { Check, CheckCircle2, MessagesSquare, SendHorizontal, Wand2, X, AlertCircle, Loader2 } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace'
import { parseDSL } from '@/lib/dsl'
import {
  answerQuestionStream, planEdit, generateDiagramStream,
  detectComposeMode, isQuestion, describeOps, flattenElements,
  type AiProvider, type EditPlan, type EditOp, type AiChatTurn,
} from '@/lib/ai'
import type { Workspace } from '@/types/model'
import { C } from './aiTheme'
import { useAiRun, runApply, plural } from './aiHelpers'
import { ErrorLine } from './aiPrimitives'
import { usePersistentState, clearAiSession } from './sessionCache'
import { MicButton } from './dictation'
import { Md } from './markdown'

// ─── The Chat tab: a request/response thread over the model ─────────
//
// Questions stream a grounded answer; change requests return a plan-preview
// card the user approves (Apply) or reverts (Undo) before anything mutates the
// model; without a workspace (or on an explicit "new model" ask) the reply is
// a generated diagram with a load preview. The thread survives close→reopen
// via the session cache.

type ChatMsg =
  | { kind: 'user'; text: string }
  | { kind: 'answer'; text: string; done: boolean }
  | {
      kind: 'plan'; plan: EditPlan; state: 'open' | 'applied' | 'discarded'
      appliedCount: number; skipText: string | null
      /** Workspace ref right after apply — Undo is offered only while the live
       *  workspace is still this exact ref (see AppliedInfo.undoTarget). */
      undoTarget: Workspace | null
    }
  | { kind: 'gen'; stream: string; dsl: string | null; done: boolean; loaded: boolean; confirmReplace: boolean }

// Static fallbacks for an empty/new model (nothing to reference yet).
const DESCRIBE_EXAMPLES = [
  'A web shop with an API, a worker, and a Postgres database',
  'Split the monolith into separate Orders and Payments services',
  'Add Stripe as an external payment system the API calls',
]

// Datastore-ish elements make the most natural "what talks to X?" subject.
const DATASTORE_RE = /\b(database|db|datastore|store|cache|queue|bucket|warehouse|redis|postgres|mysql|mongo|kafka|s3|blob)\b/i

/** A grounded starter question + change suggestion mix, templated from the
 *  model's real element names (scoped to the active view when `ids` is given).
 *  No AI call — pure string assembly. */
function buildChips(ws: Workspace | null, ids?: ReadonlySet<string>): { question: boolean; label: string }[] {
  if (!ws) return DESCRIBE_EXAMPLES.map((label) => ({ question: false, label }))
  const els = flattenElements(ws).filter((e) => !ids || ids.has(e.id))
  const qs: string[] = []
  const store = els.find((e) => DATASTORE_RE.test(e.name) || ('technology' in e && DATASTORE_RE.test((e as { technology?: string }).technology ?? '')))
  if (store) qs.push(`What talks to ${store.name}?`)
  const systems = els.filter((e) => e.type === 'softwareSystem')
  if (systems.length >= 2) qs.push(`How does ${systems[0].name} interact with ${systems[1].name}?`)
  if (systems.length >= 1) qs.push(`What are the main responsibilities of ${systems[0].name}?`)
  qs.push('What are the biggest risks in this architecture?')
  const containers = els.filter((e) => e.type === 'container').map((e) => e.name)
  const change = containers.length >= 2
    ? `Add a Redis cache between ${containers[0]} and ${containers[1]}`
    : containers.length === 1 ? `Add a Redis cache in front of ${containers[0]}` : DESCRIBE_EXAMPLES[2]
  const uniq = [...new Set(qs)]
  const out: { question: boolean; label: string }[] = []
  if (uniq[0]) out.push({ question: true, label: uniq[0] })
  out.push({ question: false, label: change })
  if (uniq[1]) out.push({ question: true, label: uniq[1] })
  return out.slice(0, 3)
}

/** Sign chip semantics per operation kind: add / edit / remove. */
function opSign(op: EditOp): { sign: string; bg: string; color: string } {
  if (op.op === 'deleteElement') return { sign: '−', bg: 'rgba(239,68,68,0.14)', color: C.dangerText }
  if (op.op === 'updateElement' || op.op === 'updateRelationship') return { sign: '~', bg: 'rgba(88,166,255,0.14)', color: C.accent }
  return { sign: '+', bg: 'rgba(34,197,94,0.14)', color: C.greenText }
}

function summarize(ws: Workspace): string {
  const systems = ws.model.softwareSystems.length
  const containers = ws.model.softwareSystems.reduce((n, s) => n + s.containers.length, 0)
  const parts = [plural(ws.model.people.length, 'person', 'people'), plural(systems, 'system', 'systems'), plural(containers, 'container', 'containers'), plural(ws.model.relationships.length, 'relationship', 'relationships')]
  return parts.join(' · ')
}

const ASSISTANT_BUBBLE: React.CSSProperties = {
  maxWidth: '88%', padding: '11px 13px', borderRadius: '4px 13px 13px 13px',
  background: C.card, border: `1px solid ${C.border}`,
  fontSize: 13, lineHeight: 1.55, color: C.text2,
}

const CARD_BUBBLE: React.CSSProperties = {
  width: '100%', padding: 14, borderRadius: '4px 13px 13px 13px',
  background: C.card, border: `1px solid ${C.border}`,
}

// The full-width primary + ghost pair used by the plan and generated-diagram cards.
const CARD_PRIMARY_BTN: React.CSSProperties = {
  flex: 1, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  borderRadius: 11, border: 'none', background: C.accent, color: C.ink,
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
const CARD_GHOST_BTN: React.CSSProperties = {
  flex: 'none', height: 40, padding: '0 14px', borderRadius: 11,
  border: `1px solid ${C.border}`, background: 'transparent', color: C.muted,
  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
}

const EYEBROW: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted3,
}

export function ChatBody({ provider, workspace, scopeIds, onClose }: {
  provider: AiProvider
  workspace: Workspace | null
  /** Active-view ids — only used to ground the starter suggestions. */
  scopeIds?: ReadonlySet<string>
  onClose: () => void
}) {
  const [msgs, setMsgs] = usePersistentState<ChatMsg[]>('chat.msgs', [])
  const [input, setInput] = usePersistentState('chat.input', '')
  const run = useAiRun()
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)
  const undoLen = useWorkspaceStore((s) => s.undoStack.length)
  const lastSaved = useWorkspaceStore((s) => s.lastSavedUndoLength)
  const hasUnsaved = !!workspace && undoLen !== lastSaved

  const chips = useMemo(() => buildChips(workspace, scopeIds), [workspace, scopeIds])
  const showChips = msgs.length === 0 && !run.loading

  function patch(i: number, p: Partial<ChatMsg> | ((m: ChatMsg) => ChatMsg)) {
    setMsgs((m) => m.map((msg, j) => (j === i ? (typeof p === 'function' ? p(msg) : ({ ...msg, ...p } as ChatMsg)) : msg)))
  }

  function send(preset?: string) {
    const text = (preset ?? input).trim()
    if (!text || run.loading) return
    setInput('')
    const ws = workspace
    const intent: 'new' | 'change' | 'ask' = !ws ? 'new' : isQuestion(text) ? 'ask' : detectComposeMode(text)

    if (intent === 'ask' && ws) {
      const i = msgs.length + 1 // index of the answer placeholder appended below
      // Prior Q&A exchanges, so a follow-up resolves against the conversation.
      // Only settled (user → done answer) pairs, to keep strict role alternation.
      const history: AiChatTurn[] = []
      for (let k = 0; k < msgs.length - 1; k++) {
        const a = msgs[k], b = msgs[k + 1]
        if (a.kind === 'user' && b.kind === 'answer' && b.done) {
          history.push({ role: 'user', content: a.text }, { role: 'assistant', content: b.text })
        }
      }
      setMsgs((m) => [...m, { kind: 'user', text }, { kind: 'answer', text: '', done: false }])
      run.go(
        async (signal) => {
          try {
            return await answerQuestionStream(provider, ws, null, text, history, (d) => patch(i, (msg) => ({ ...msg, text: (msg as { text: string }).text + d } as ChatMsg)), signal)
          } finally {
            // A Stop (or error) still settles the bubble — no stuck caret.
            patch(i, { done: true })
          }
        },
        (full) => patch(i, { text: full, done: true }),
      )
      return
    }

    if (intent === 'change' && ws) {
      setMsgs((m) => [...m, { kind: 'user', text }])
      run.go(
        () => planEdit(provider, ws, text),
        (plan) => setMsgs((m) => [...m, { kind: 'plan', plan, state: 'open', appliedCount: 0, skipText: null, undoTarget: null }]),
      )
      return
    }

    // 'new' — generate a whole diagram (streams DSL into the thread).
    const i = msgs.length + 1
    setMsgs((m) => [...m, { kind: 'user', text }, { kind: 'gen', stream: '', dsl: null, done: false, loaded: false, confirmReplace: false }])
    run.go(
      async (signal) => {
        try {
          return await generateDiagramStream(provider, text, (d) => patch(i, (msg) => ({ ...msg, stream: (msg as { stream: string }).stream + d } as ChatMsg)), signal)
        } finally {
          patch(i, { done: true })
        }
      },
      (dsl) => patch(i, { dsl, done: true }),
    )
  }

  function applyPlan(i: number, msg: Extract<ChatMsg, { kind: 'plan' }>) {
    const ws = useWorkspaceStore.getState().workspace
    if (!ws) return
    const info = runApply(msg.plan, ws)
    patch(i, { state: 'applied', appliedCount: info.appliedCount, skipText: info.skipText, undoTarget: info.undoTarget })
  }
  function undoPlan(i: number) {
    useWorkspaceStore.getState().undo()
    patch(i, { state: 'open', undoTarget: null, skipText: null })
  }
  function loadGen(i: number, ws: Workspace) {
    // A generated model replaces the current one in place (same route), so the
    // route-keyed session cache wouldn't reset on its own. Drop the review
    // baseline/ledger/findings from the old model, or a later "Undo last" in the
    // Review tab would replay the old baseline over this fresh diagram.
    clearAiSession('review.')
    loadWorkspace(ws)
    patch(i, { loaded: true, confirmReplace: false })
    onClose()
  }

  // Keep the thread pinned to the newest message / streamed tokens.
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight }, [msgs, run.loading])

  // Auto-grow the composer with its content (52px → 120px, then scroll) so a
  // wrapped line never shows a scrollbar inside the fixed-height field.
  const taRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = '52px'
    const next = Math.min(Math.max(el.scrollHeight, 52), 120)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden'
  }, [input])

  // Typing indicator: a response is in flight and nothing streams yet (planEdit
  // has no streamed placeholder; ask/gen show progress inside their bubble).
  const last = msgs[msgs.length - 1]
  const showTyping = run.loading && (!last || last.kind === 'user')

  const sendActive = input.trim().length > 0 && !run.loading

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div ref={scrollRef} data-scroll style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* greeting */}
        <div className="c4ai-msg" style={ASSISTANT_BUBBLE}>
          {workspace
            ? <>Ask me anything about this model, or tell me what to change — I’ll always show a preview before applying.</>
            : <>No model is open yet — describe a system and I’ll generate a starting diagram, with a preview before anything loads.</>}
        </div>

        {msgs.map((m, i) => {
          if (m.kind === 'user') {
            return (
              <div key={i} className="c4ai-msg" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ maxWidth: '82%', padding: '10px 13px', borderRadius: '13px 13px 4px 13px', background: 'rgba(88,166,255,0.14)', border: '1px solid rgba(88,166,255,0.28)', fontSize: 13, lineHeight: 1.5, color: C.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
              </div>
            )
          }
          if (m.kind === 'answer') {
            return (
              <div key={i} className="c4ai-msg" style={{ ...ASSISTANT_BUBBLE, maxWidth: '92%', padding: '12px 14px', lineHeight: 1.6 }}>
                {m.text === '' && !m.done
                  ? <TypingDots />
                  : <Md text={m.text} caret={!m.done} />}
              </div>
            )
          }
          if (m.kind === 'plan') return <PlanMsg key={i} msg={m} workspace={workspace} onApply={() => applyPlan(i, m)} onUndo={() => undoPlan(i)} onDiscard={() => patch(i, { state: 'discarded' })} />
          return (
            <GenMsg key={i} msg={m} workspace={workspace} hasUnsaved={hasUnsaved}
              onStop={run.cancel} onLoad={(ws) => loadGen(i, ws)}
              onConfirm={(v) => patch(i, { confirmReplace: v })} onDiscard={() => patch(i, { dsl: null })} />
          )
        })}

        {showTyping && (
          <div className="c4ai-msg" style={{ ...ASSISTANT_BUBBLE, width: 'fit-content', padding: '11px 14px' }}>
            <TypingDots />
          </div>
        )}

        {showChips && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: C.muted3, padding: '0 2px 5px' }}>Try asking</div>
            {chips.map((ch, i) => {
              const Icon = ch.question ? MessagesSquare : Wand2
              return (
                <button key={i} onClick={() => send(ch.label)} className="c4ai-chip"
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 2px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', color: C.muted }}>
                  <Icon size={12} color={ch.question ? '#a78bfa' : C.accent} style={{ flex: 'none', opacity: 0.85 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'currentcolor' }}>{ch.label}</span>
                </button>
              )
            })}
          </div>
        )}

        <ErrorLine error={run.error} onRetry={run.retry} />
      </div>

      {/* composer */}
      <div style={{ flex: 'none', padding: '12px 16px 9px', borderTop: '1px solid rgba(88,166,255,0.1)' }}>
        <div style={{ position: 'relative' }}>
          <textarea ref={taRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={workspace ? 'Ask, or describe a change…' : 'Describe a system to generate…'}
            aria-label="Message the AI assistant"
            rows={1}
            style={{ display: 'block', width: '100%', height: 52, resize: 'none', overflowY: 'hidden', padding: '15px 76px 13px 14px', borderRadius: 12, border: '1px solid rgba(88,166,255,0.3)', background: C.card, color: C.text, fontSize: 13, lineHeight: 1.5, outline: 'none', fontFamily: 'inherit' }} />
          <MicButton value={input} onChange={setInput} style={{ position: 'absolute', top: 13, right: 46, color: C.muted2 }} />
          <button onClick={() => send()} disabled={!sendActive} aria-label="Send"
            className={sendActive ? 'c4ai-pri' : undefined}
            style={{ position: 'absolute', top: 9, right: 9, width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: 'none', background: sendActive ? C.accent : 'rgba(88,166,255,0.16)', color: sendActive ? C.ink : C.muted3, cursor: sendActive ? 'pointer' : 'default' }}>
            <SendHorizontal size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} aria-label="Thinking…">
      {[0, 0.18, 0.36].map((d) => (
        <span key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, animation: `c4ai-dot 1.1s infinite ${d}s` }} />
      ))}
    </span>
  )
}

// ─── plan preview card ───────────────────────────────────────────────

function PlanMsg({ msg, workspace, onApply, onUndo, onDiscard }: {
  msg: Extract<ChatMsg, { kind: 'plan' }>
  workspace: Workspace | null
  onApply: () => void; onUndo: () => void; onDiscard: () => void
}) {
  const lines = useMemo(() => describeOps(msg.plan, workspace), [msg.plan, workspace])
  const n = msg.plan.operations.length
  const canUndo = msg.undoTarget !== null && msg.undoTarget === workspace
  const status = msg.state === 'applied' ? 'applied' : msg.state === 'discarded' ? 'discarded' : 'nothing applied yet'
  return (
    <div className="c4ai-msg" style={CARD_BUBBLE}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={EYEBROW}>Plan · {plural(n, 'change', 'changes')}</span>
        <span style={{ fontSize: 11, color: msg.state === 'applied' ? C.greenText : C.muted3 }}>{status}</span>
      </div>
      <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {msg.plan.operations.map((op, j) => {
          const s = opSign(op)
          return (
            <div key={j} style={{ display: 'flex', gap: 9, fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>
              <span style={{ width: 17, height: 17, flex: 'none', borderRadius: 5, background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{s.sign}</span>
              <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{lines[j] ?? ''}</span>
            </div>
          )
        })}
        {n === 0 && <div style={{ fontSize: 12.5, color: C.muted2 }}>No changes proposed.</div>}
      </div>
      {msg.state === 'applied' && (
        <>
          <div style={{ marginTop: 13, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 10, border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.06)', fontSize: 12, color: C.text2 }}>
            <CheckCircle2 size={14} color={C.green} style={{ flex: 'none' }} />
            <span style={{ flex: 1 }}>{plural(msg.appliedCount, 'change', 'changes')} applied</span>
            {canUndo && (
              <button onClick={onUndo} style={{ border: 'none', background: 'transparent', color: C.accent, fontWeight: 600, fontSize: 12, cursor: 'pointer', padding: 0 }}>Undo</button>
            )}
          </div>
          {msg.skipText && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11.5, color: C.warnText }}>
              <AlertCircle size={12} style={{ flex: 'none', marginTop: 1 }} /> {msg.skipText}
            </div>
          )}
        </>
      )}
      {msg.state === 'open' && n > 0 && (
        <div style={{ marginTop: 14, display: 'flex', gap: 9 }}>
          <button onClick={onApply} className="c4ai-pri" style={CARD_PRIMARY_BTN}>
            <Check size={15} /> Apply {plural(n, 'change', 'changes')}
          </button>
          <button onClick={onDiscard} className="c4ai-ghost" style={CARD_GHOST_BTN}>
            Discard
          </button>
        </div>
      )}
    </div>
  )
}

// ─── generated-diagram card ──────────────────────────────────────────

function GenMsg({ msg, workspace, hasUnsaved, onStop, onLoad, onConfirm, onDiscard }: {
  msg: Extract<ChatMsg, { kind: 'gen' }>
  workspace: Workspace | null
  hasUnsaved: boolean
  onStop: () => void
  onLoad: (ws: Workspace) => void
  onConfirm: (v: boolean) => void
  onDiscard: () => void
}) {
  const parsed = useMemo(() => (msg.dsl ? parseDSL(msg.dsl) : null), [msg.dsl])
  const preRef = useRef<HTMLPreElement>(null)
  useEffect(() => { const el = preRef.current; if (el) el.scrollTop = el.scrollHeight }, [msg.stream])

  if (!msg.done) {
    return (
      <div className="c4ai-msg" style={CARD_BUBBLE}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader2 size={13} className="animate-spin" color={C.accent} />
          <span style={EYEBROW}>Generating diagram…</span>
          <button onClick={onStop} className="c4ai-ghost" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 9px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><X size={12} /> Stop</button>
        </div>
        {msg.stream && (
          <pre ref={preRef} data-scroll style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '10px 0 0', fontFamily: 'ui-monospace, monospace', fontSize: 11.5, lineHeight: 1.5, color: C.text2, maxHeight: 180, overflowY: 'auto' }}>
            {msg.stream}<span style={{ animation: 'c4ai-node 1.1s ease-in-out infinite' }}>▍</span>
          </pre>
        )}
      </div>
    )
  }

  if (msg.loaded) {
    return (
      <div className="c4ai-msg" style={{ ...CARD_BUBBLE, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px', fontSize: 12.5, color: C.text2 }}>
        <CheckCircle2 size={14} color={C.green} style={{ flex: 'none' }} /> Diagram loaded.
      </div>
    )
  }

  if (!msg.dsl || !parsed) {
    return (
      <div className="c4ai-msg" style={{ ...ASSISTANT_BUBBLE, color: C.muted2 }}>
        Generation stopped — nothing was loaded.
      </div>
    )
  }

  return (
    <div className="c4ai-msg" style={CARD_BUBBLE}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={EYEBROW}>Preview</span>
        <span style={{ fontSize: 11, color: C.muted }}>{summarize(parsed.workspace)}</span>
      </div>
      {parsed.errors.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: C.warnText }}>{parsed.errors.length} parser warning(s) — the diagram may be partial.</div>
      )}
      {!msg.confirmReplace ? (
        <div style={{ marginTop: 13, display: 'flex', gap: 9 }}>
          <button onClick={() => { if (workspace) onConfirm(true); else onLoad(parsed.workspace) }} className="c4ai-pri" style={CARD_PRIMARY_BTN}>
            <Check size={15} /> Load diagram
          </button>
          <button onClick={onDiscard} className="c4ai-ghost" style={CARD_GHOST_BTN}>
            Discard
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 13, padding: '11px 12px', borderRadius: 10, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fed7aa' }}>Replace {workspace?.name || 'the current model'}?</div>
          <div style={{ fontSize: 11.5, lineHeight: 1.45, color: C.warnText, marginTop: 3 }}>
            {hasUnsaved
              ? 'It has unsaved changes — loading the new model discards them and can’t be undone.'
              : 'Loading the new model replaces your current diagram. This can’t be undone.'}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button onClick={() => onLoad(parsed.workspace)} className="c4ai-sec"
              style={{ height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: C.dangerText, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Replace anyway</button>
            <button onClick={() => onConfirm(false)} className="c4ai-sec"
              style={{ height: 30, padding: '0 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
