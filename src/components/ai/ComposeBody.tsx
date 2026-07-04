import { useState, useMemo } from 'react'
import { Sparkles, Pencil, SquarePen, Wand2, ArrowRight, Layers, AlertCircle } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace'
import { parseDSL } from '@/lib/dsl'
import {
  generateDiagram, planEdit, detectComposeMode, describeOps, flattenElements,
  type AiProvider, type EditPlan,
} from '@/lib/ai'
import type { Workspace } from '@/types/model'
import { C, kicker, chipBlue, primaryBtn, secondaryBtn } from './aiTheme'
import { useAiRun, runApply, plural, type AppliedInfo } from './aiHelpers'
import { Field, RunButton, ErrorLine, Card, Actions, PlanList, AppliedSummary } from './aiPrimitives'

const DESCRIBE_EXAMPLES = [
  'Add a Redis cache between the Web App and the database',
  'Split the monolith into separate Orders and Payments services',
  'Add Stripe as an external payment system the API calls',
]

export function ComposeBody({ provider, workspace, onClose }: { provider: AiProvider; workspace: Workspace | null; onClose: () => void }) {
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)
  const undoLen = useWorkspaceStore((s) => s.undoStack.length)
  const lastSaved = useWorkspaceStore((s) => s.lastSavedUndoLength)
  const hasUnsaved = !!workspace && undoLen !== lastSaved

  const [text, setText] = useState('')
  const run = useAiRun()
  const [dsl, setDsl] = useState<string | null>(null)
  const [plan, setPlan] = useState<EditPlan | null>(null)
  // Post-apply summary. The panel stays open (the moment after an apply is when
  // follow-up changes are most likely), with a one-shot Undo.
  const [applied, setApplied] = useState<AppliedInfo | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const parsed = useMemo(() => (dsl ? parseDSL(dsl) : null), [dsl])
  // Flatten the parsed preview once (the chip row read it three times per render).
  const parsedElements = useMemo(() => (parsed ? flattenElements(parsed.workspace) : []), [parsed])
  const planLines = plan && workspace ? describeOps(plan, workspace) : []

  // Auto-detect intent. Without a workspace there's nothing to change → "new".
  const detected: 'new' | 'change' = !workspace ? 'new' : detectComposeMode(text)
  const DetIcon = detected === 'new' ? Sparkles : Pencil
  const detectedHint = !text.trim()
    ? 'Intent is detected automatically as you type.'
    : detected === 'new' ? 'Detected: new model — opens in a new workspace.' : `Detected: change to ${workspace?.name || 'the current model'}.`

  function reset() { setDsl(null); setPlan(null); setApplied(null); setConfirmReplace(false) }
  const canRun = !!text.trim() && (detected === 'new' || !!workspace)

  function submit() {
    if (!canRun || run.loading) return
    reset()
    if (detected === 'new') run.go(() => generateDiagram(provider, text), setDsl)
    else run.go(() => planEdit(provider, workspace!, text), setPlan)
  }
  function load() { if (parsed) { loadWorkspace(parsed.workspace); onClose() } }
  const done = !!parsed || !!plan || !!applied

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
