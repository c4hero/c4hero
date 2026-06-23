import { useMemo, useState } from 'react'
import { X, Settings, Loader2, Sparkles, Check, Copy, Download, AlertCircle, Pencil } from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import { useWorkspaceStore, getActiveView } from '@/store/workspace'
import { useAiSettingsStore, isAiReady, activeAiConfig } from '@/store/ai-settings'
import { parseDSL } from '@/lib/dsl'
import { downloadFile } from '@/lib/exportUtils'
import type { View, Workspace } from '@/types/model'
import {
  createProvider, aiErrorMessage,
  generateDiagram, planEdit, autoDescribe, reviewArchitecture, applyReview, draftAdr,
  interviewAsk, interviewKickoffMessage, interviewBuildPlan,
  applyEditPlan, describeOps, elementIdSet, viewLabel,
  buildDescribePreview, applyDescribePreview, countMissingDescriptions,
  type AiProvider, type EditActions, type DescribeActions,
  type EditPlan, type DescribePreview, type AiFeatureId, type AiChatTurn,
} from '@/lib/ai'
import { AI_FEATURES } from './aiFeatureMeta'
import { MicButton } from './dictation'

export default function AiPanel({ onClose }: { onClose: () => void }) {
  const initialFeature = useWorkspaceStore((s) => s.aiPanelFeature)
  const setAiSettingsOpen = useWorkspaceStore((s) => s.setAiSettingsOpen)
  const workspace = useWorkspaceStore((s) => s.workspace)
  const settings = useAiSettingsStore()

  const [active, setActive] = useState<AiFeatureId>(initialFeature ?? 'generate')
  const ready = isAiReady(settings)
  const { provider: providerId, apiKey, model } = activeAiConfig(settings)

  const provider = useMemo(
    () => (ready ? createProvider(providerId, { apiKey, model }) : null),
    [ready, providerId, apiKey, model],
  )

  const activeMeta = AI_FEATURES.find((f) => f.id === active)!

  return (
    <DialogShell
      onClose={onClose}
      ariaLabel="AI assistant"
      style={{
        width: 'min(760px, 94vw)',
        maxHeight: '88dvh',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-border)',
        background: 'var(--glass-bg-heavy)',
        boxShadow: '0 16px 64px rgba(0,0,0,0.6)',
      }}
    >
      <div style={headerStyle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          <Sparkles size={16} /> AI assistant
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setAiSettingsOpen(true)} className="btn-icon" aria-label="AI settings" title="AI settings" style={iconBtn}>
            <Settings size={14} />
          </button>
          <button onClick={onClose} className="btn-icon" aria-label="Close dialog" style={iconBtn}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={tabsStyle} role="tablist" aria-label="AI features">
        {AI_FEATURES.map((f) => {
          const Icon = f.icon
          const selected = f.id === active
          return (
            <button
              key={f.id}
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(f.id)}
              style={{
                ...tabBtn,
                color: selected ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                borderBottomColor: selected ? 'var(--color-accent)' : 'transparent',
                background: selected ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)' : 'transparent',
              }}
            >
              <Icon size={14} /> {f.label}
            </button>
          )
        })}
      </div>

      {/* Body */}
      <div style={{ padding: '16px 20px 20px', overflowY: 'auto' }}>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: '0 0 12px' }}>{activeMeta.blurb}</p>

        {!ready ? (
          <SetupNotice onOpenSettings={() => setAiSettingsOpen(true)} />
        ) : activeMeta.needsWorkspace && !workspace ? (
          <Empty>Open or create a workspace to use this feature.</Empty>
        ) : (
          <FeatureBody key={active} feature={active} provider={provider!} onClose={onClose} />
        )}
      </div>
    </DialogShell>
  )
}

// ─── Per-feature bodies ─────────────────────────────────────────────

function FeatureBody({ feature, provider, onClose }: { feature: AiFeatureId; provider: AiProvider; onClose: () => void }) {
  switch (feature) {
    case 'generate': return <GenerateBody provider={provider} onClose={onClose} />
    case 'interview': return <InterviewBody provider={provider} onClose={onClose} />
    case 'edit': return <EditBody provider={provider} onClose={onClose} />
    case 'describe': return <DescribeBody provider={provider} onClose={onClose} />
    case 'review': return <ReviewBody provider={provider} onClose={onClose} />
    case 'adr': return <AdrBody provider={provider} />
  }
}

function GenerateBody({ provider, onClose }: { provider: AiProvider; onClose: () => void }) {
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)
  const [text, setText] = useState('')
  const run = useAiRun<string>()
  const [dsl, setDsl] = useState<string | null>(null)
  const parsed = useMemo(() => (dsl ? parseDSL(dsl) : null), [dsl])

  return (
    <>
      <Prompt
        value={text}
        onChange={setText}
        placeholder="e.g. A food-delivery platform with a customer mobile app, a restaurant web portal, an API gateway, an orders service using Kafka, a payments service using Stripe, and a Postgres database."
        rows={5}
      />
      <RunButton
        label="Generate diagram"
        loading={run.loading}
        disabled={!text.trim()}
        onClick={() => run.run(() => generateDiagram(provider, text), setDsl)}
      />
      <ErrorLine error={run.error} />

      {parsed && (
        <div style={resultBox}>
          <div style={resultTitle}>Preview</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
            {summarize(parsed.workspace)}
          </div>
          {parsed.errors.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 'var(--text-xs)', color: 'var(--color-warning, #d97706)' }}>
              {parsed.errors.length} parser warning(s) — the diagram may be partial.
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button
              className="btn-primary"
              disabled={!hasContent(parsed.workspace)}
              onClick={() => { loadWorkspace(parsed.workspace); onClose() }}
            >
              Load diagram
            </button>
            <button className="btn-secondary" onClick={() => setDsl(null)}>Discard</button>
          </div>
        </div>
      )}
    </>
  )
}

function InterviewBody({ provider, onClose }: { provider: AiProvider; onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const view = workspace && activeViewKey ? getActiveView(workspace, activeViewKey) : undefined

  const [history, setHistory] = useState<AiChatTurn[]>([])
  const [qa, setQa] = useState<{ q: string; a: string }[]>([])
  const [question, setQuestion] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [plan, setPlan] = useState<EditPlan | null>(null)
  const run = useAiRun<void>()
  const started = history.length > 0

  if (!workspace || !view) return <Empty>Open a view to start an interview.</Empty>
  const ws = workspace
  const v: View = view

  async function start() {
    await run.run(async () => {
      const kickoff = interviewKickoffMessage(v)
      const q = await interviewAsk(provider, ws, v, [], kickoff)
      setHistory([{ role: 'user', content: kickoff }, { role: 'assistant', content: q }])
      setQuestion(q)
    }, () => {})
  }

  async function answerAndNext() {
    if (!question || !answer.trim()) return
    const a = answer.trim()
    const baseHistory: AiChatTurn[] = [...history, { role: 'user', content: a }]
    setQa((prev) => [...prev, { q: question, a }])
    setAnswer('')
    await run.run(async () => {
      const q = await interviewAsk(provider, ws, v, history, a)
      setHistory([...baseHistory, { role: 'assistant', content: q }])
      setQuestion(q)
    }, () => {})
  }

  async function finish() {
    // Fold in a pending answer, if any, before building the plan.
    let finalHistory = history
    if (question && answer.trim()) {
      const a = answer.trim()
      finalHistory = [...history, { role: 'user', content: a }]
      setQa((prev) => [...prev, { q: question, a }])
      setAnswer('')
      setQuestion(null)
    }
    await run.run(async () => {
      const built = await interviewBuildPlan(provider, ws, v, finalHistory)
      setPlan(built)
    }, () => {})
  }

  function apply() {
    if (!plan) return
    applyPlanToStore(plan, ws)
    onClose()
  }

  const planLines = plan ? describeOps(plan, ws) : []

  return (
    <>
      <p style={mutedSmall}>
        Interviewing about the <strong>{viewLabel(v)}</strong>. Answer the questions (type or use
        the mic); when you’re done, c4hero turns your answers into model updates.
      </p>

      {/* Completed exchanges */}
      {qa.length > 0 && (
        <div style={{ ...resultBox, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {qa.map((x, i) => (
            <div key={i}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>Q: {x.q}</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 2 }}>A: {x.a}</div>
            </div>
          ))}
        </div>
      )}

      {!started ? (
        <RunButton label="Start interview" loading={run.loading} onClick={start} />
      ) : plan ? null : (
        <div style={{ marginTop: 14 }}>
          {question && (
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>
              {question}
            </div>
          )}
          <Prompt value={answer} onChange={setAnswer} placeholder="Type or dictate your answer…" rows={3} />
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-secondary" disabled={run.loading || !answer.trim()} onClick={answerAndNext}>
              {run.loading ? 'Thinking…' : 'Answer & next question'}
            </button>
            <button className="btn-primary" disabled={run.loading || qa.length === 0 && !answer.trim()} onClick={finish}>
              Finish & update model
            </button>
          </div>
        </div>
      )}

      <ErrorLine error={run.error} />

      {plan && (
        <div style={resultBox}>
          <div style={resultTitle}>{planLines.length} proposed change(s) from your answers</div>
          {planLines.length === 0 ? (
            <div style={mutedSmall}>No changes proposed — your answers matched the current model.</div>
          ) : (
            <ul style={listStyle}>{planLines.map((l, i) => <li key={i} style={listItem}>{l}</li>)}</ul>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn-primary" disabled={planLines.length === 0} onClick={apply}>Apply changes</button>
            <button className="btn-secondary" onClick={() => setPlan(null)}>Back</button>
          </div>
        </div>
      )}
    </>
  )
}

function EditBody({ provider, onClose }: { provider: AiProvider; onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const [text, setText] = useState('')
  const run = useAiRun<EditPlan>()
  const [plan, setPlan] = useState<EditPlan | null>(null)
  const lines = useMemo(() => (plan ? describeOps(plan, workspace) : []), [plan, workspace])

  function apply() {
    if (!plan || !workspace) return
    applyPlanToStore(plan, workspace)
    onClose()
  }

  return (
    <>
      <Prompt
        value={text}
        onChange={setText}
        placeholder="e.g. Add a Redis cache between the Web App and the Database, and connect the Admin to the Web App."
        rows={4}
      />
      <RunButton
        label="Plan changes"
        loading={run.loading}
        disabled={!text.trim()}
        onClick={() => run.run(() => planEdit(provider, workspace!, text), setPlan)}
      />
      <ErrorLine error={run.error} />

      {plan && (
        <div style={resultBox}>
          <div style={resultTitle}>{lines.length} proposed change(s)</div>
          {lines.length === 0 ? (
            <div style={mutedSmall}>No changes proposed.</div>
          ) : (
            <ul style={listStyle}>{lines.map((l, i) => <li key={i} style={listItem}>{l}</li>)}</ul>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn-primary" disabled={lines.length === 0} onClick={apply}>Apply changes</button>
            <button className="btn-secondary" onClick={() => setPlan(null)}>Discard</button>
          </div>
        </div>
      )}
    </>
  )
}

function DescribeBody({ provider, onClose }: { provider: AiProvider; onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const missing = workspace ? countMissingDescriptions(workspace) : 0
  const run = useAiRun<DescribePreview>()
  const [preview, setPreview] = useState<DescribePreview | null>(null)

  async function generate() {
    if (!workspace) return
    await run.run(async () => {
      const result = await autoDescribe(provider, workspace)
      return buildDescribePreview(result, workspace)
    }, setPreview)
  }

  function apply() {
    if (!preview) return
    const s = useWorkspaceStore.getState()
    const actions: DescribeActions = {
      updateElement: (id, patch) => s.updateElement(id, patch),
      updateRelationship: (id, patch) => s.updateRelationship(id, patch),
    }
    applyDescribePreview(preview, actions)
    onClose()
  }

  const count = preview ? preview.elements.length + preview.relationships.length : 0

  return (
    <>
      <p style={mutedSmall}>
        {missing === 0
          ? 'Every element and relationship already has a description.'
          : `${missing} element(s)/relationship(s) are missing a description.`}
      </p>
      <RunButton
        label="Suggest descriptions"
        loading={run.loading}
        disabled={missing === 0}
        onClick={generate}
      />
      <ErrorLine error={run.error} />

      {preview && (
        <div style={resultBox}>
          <div style={resultTitle}>{count} suggested description(s)</div>
          {count === 0 ? (
            <div style={mutedSmall}>No applicable suggestions.</div>
          ) : (
            <ul style={listStyle}>
              {preview.elements.map((p) => (
                <li key={`e-${p.id}`} style={listItem}><strong>{p.label}</strong>: {p.description}</li>
              ))}
              {preview.relationships.map((p) => (
                <li key={`r-${p.id}`} style={listItem}><strong>{p.label}</strong>: {p.description}</li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn-primary" disabled={count === 0} onClick={apply}>Apply descriptions</button>
            <button className="btn-secondary" onClick={() => setPreview(null)}>Discard</button>
          </div>
        </div>
      )}
    </>
  )
}

function ReviewBody({ provider, onClose }: { provider: AiProvider; onClose: () => void }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const reviewRun = useAiRun<string>()
  const planRun = useAiRun<EditPlan>()
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [plan, setPlan] = useState<EditPlan | null>(null)
  const planLines = plan && workspace ? describeOps(plan, workspace) : []

  function applyPlan() {
    if (!plan || !workspace) return
    applyPlanToStore(plan, workspace)
    onClose()
  }

  return (
    <>
      <RunButton
        label="Review architecture"
        loading={reviewRun.loading}
        onClick={() => reviewRun.run(() => reviewArchitecture(provider, workspace!), (md) => { setMarkdown(md); setPlan(null) })}
      />
      <ErrorLine error={reviewRun.error} />

      {markdown && (
        <>
          <MarkdownResult title="Review" text={markdown} />

          {!plan && (
            <div style={{ marginTop: 12 }}>
              <button
                className="btn-primary"
                disabled={planRun.loading}
                onClick={() => planRun.run(() => applyReview(provider, workspace!, markdown), setPlan)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {planRun.loading ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
                {planRun.loading ? 'Preparing changes…' : 'Turn suggestions into changes'}
              </button>
              <p style={{ ...mutedSmall, marginTop: 6 }}>
                Converts the concrete, structural suggestions above into model edits you review before applying.
              </p>
            </div>
          )}
          <ErrorLine error={planRun.error} />

          {plan && (
            <div style={resultBox}>
              <div style={resultTitle}>{planLines.length} proposed change(s) from the review</div>
              {planLines.length === 0 ? (
                <div style={mutedSmall}>The review had no suggestions that map to concrete model edits.</div>
              ) : (
                <ul style={listStyle}>{planLines.map((l, i) => <li key={i} style={listItem}>{l}</li>)}</ul>
              )}
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button className="btn-primary" disabled={planLines.length === 0} onClick={applyPlan}>Apply changes</button>
                <button className="btn-secondary" onClick={() => setPlan(null)}>Discard</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}

function AdrBody({ provider }: { provider: AiProvider }) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const [topic, setTopic] = useState('')
  const run = useAiRun<string>()
  const [markdown, setMarkdown] = useState<string | null>(null)

  return (
    <>
      <Prompt
        value={topic}
        onChange={setTopic}
        placeholder="e.g. Adopt event-driven messaging between the Orders and Payments services"
        rows={3}
      />
      <RunButton
        label="Draft ADR"
        loading={run.loading}
        disabled={!topic.trim()}
        onClick={() => run.run(() => draftAdr(provider, workspace, topic), setMarkdown)}
      />
      <ErrorLine error={run.error} />
      {markdown && (
        <MarkdownResult
          title="ADR"
          text={markdown}
          download={{ filename: adrFilename(topic), content: markdown }}
        />
      )}
    </>
  )
}

// ─── Shared building blocks ─────────────────────────────────────────

interface RunState<T> {
  loading: boolean
  error: string | null
  run: (fn: () => Promise<T>, onResult: (value: T) => void) => Promise<void>
}

function useAiRun<T>(): RunState<T> {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<T>, onResult: (value: T) => void) => {
    setLoading(true)
    setError(null)
    try {
      onResult(await fn())
    } catch (err) {
      setError(aiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  return { loading, error, run }
}

function Prompt({ value, onChange, placeholder, rows }: { value: string; onChange: (v: string) => void; placeholder: string; rows: number }) {
  return (
    <div style={{ position: 'relative' }}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={{
          width: '100%', resize: 'vertical', padding: '10px 40px 10px 12px', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)',
          color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', lineHeight: 1.5,
        }}
      />
      <MicButton value={value} onChange={onChange} style={{ position: 'absolute', top: 6, right: 6 }} />
    </div>
  )
}

function RunButton({ label, loading, disabled, onClick }: { label: string; loading: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      className="btn-primary"
      disabled={loading || disabled}
      onClick={onClick}
      style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
      {loading ? 'Thinking…' : label}
    </button>
  )
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 10, fontSize: 'var(--text-xs)', color: 'var(--color-danger, #dc2626)' }}>
      <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
    </div>
  )
}

function MarkdownResult({ title, text, download }: { title: string; text: string; download?: { filename: string; content: string } }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }
  return (
    <div style={resultBox}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={resultTitle}>{title}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-secondary" onClick={copy} style={smallBtn}>
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
          </button>
          {download && (
            <button className="btn-secondary" onClick={() => downloadFile(download.content, download.filename, 'text/markdown')} style={smallBtn}>
              <Download size={12} /> .md
            </button>
          )}
        </div>
      </div>
      <pre style={{
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '10px 0 0',
        fontFamily: 'inherit', fontSize: 'var(--text-sm)', lineHeight: 1.55,
        color: 'var(--color-text-primary)', maxHeight: '46dvh', overflowY: 'auto',
      }}>{text}</pre>
    </div>
  )
}

function SetupNotice({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div style={resultBox}>
      <div style={resultTitle}>Set up your API key</div>
      <p style={{ ...mutedSmall, marginTop: 6 }}>
        AI features are bring-your-own-key. Add your Anthropic API key to get started — it stays
        in this browser and is sent only to Anthropic.
      </p>
      <button className="btn-primary" onClick={onOpenSettings} style={{ marginTop: 10 }}>Open AI settings</button>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ ...mutedSmall, padding: '8px 0' }}>{children}</div>
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Apply an EditPlan through the workspace store actions (shared by Edit and
 *  Interview). Each add/update is an undoable store step. */
function applyPlanToStore(plan: EditPlan, ws: Workspace) {
  const s = useWorkspaceStore.getState()
  const actions: EditActions = {
    addPerson: (name) => s.addPerson(name),
    addSoftwareSystem: (name) => s.addSoftwareSystem(name),
    addContainer: (systemId, name) => s.addContainer(systemId, name),
    addComponent: (containerId, name) => s.addComponent(containerId, name),
    addRelationship: (src, dst, desc, tech) => s.addRelationship(src, dst, desc, tech),
    updateElement: (id, patch) => s.updateElement(id, patch),
    updateRelationship: (id, patch) => s.updateRelationship(id, patch),
    deleteElement: (id) => s.deleteElement(id),
  }
  applyEditPlan(plan, actions, elementIdSet(ws))
}

function summarize(ws: Workspace): string {
  const systems = ws.model.softwareSystems.length
  const containers = ws.model.softwareSystems.reduce((n, s) => n + s.containers.length, 0)
  const components = ws.model.softwareSystems.reduce((n, s) => n + s.containers.reduce((m, c) => m + c.components.length, 0), 0)
  const parts = [
    plural(ws.model.people.length, 'person', 'people'),
    plural(systems, 'system', 'systems'),
    plural(containers, 'container', 'containers'),
  ]
  if (components > 0) parts.push(plural(components, 'component', 'components'))
  parts.push(plural(ws.model.relationships.length, 'relationship', 'relationships'))
  return parts.join(', ')
}

function hasContent(ws: Workspace): boolean {
  return ws.model.people.length > 0 || ws.model.softwareSystems.length > 0
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function adrFilename(topic: string): string {
  const slug = topic.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'decision'
  return `adr-${slug}.md`
}

// ─── Styles ─────────────────────────────────────────────────────────

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 20px 12px', borderBottom: '1px solid var(--color-border)',
}
const iconBtn: React.CSSProperties = { minWidth: 28, minHeight: 28, padding: 4 }
const tabsStyle: React.CSSProperties = {
  display: 'flex', gap: 2, padding: '0 12px', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap',
}
const tabBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 12px',
  fontSize: 'var(--text-sm)', fontWeight: 600, border: 'none', borderBottom: '2px solid transparent',
  background: 'transparent', cursor: 'pointer',
}
const resultBox: React.CSSProperties = {
  marginTop: 14, padding: '12px 14px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)',
}
const resultTitle: React.CSSProperties = { fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }
const mutedSmall: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }
const listStyle: React.CSSProperties = { margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }
const listItem: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', lineHeight: 1.45 }
const smallBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', padding: '4px 8px' }
