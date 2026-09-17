import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Download, Save, Stethoscope } from 'lucide-react'
import { draftAdr, buildDocsContext, type AdrSeed, type AiProvider } from '@/lib/ai'
import { downloadFile } from '@/lib/exportUtils'
import { getCurrentDirHandle } from '@/lib/folderIO'
import { useDocsStore } from '@/store/docs'
import { firstHeading } from '@/lib/docs/bundle'
import { announce } from '@/lib/announce'
import type { Workspace } from '@/types/model'
import { C, blurb, miniBtn } from './aiTheme'
import { useAiRun } from './aiHelpers'
import { usePersistentState } from './sessionCache'
import { Field, RunButton, ErrorLine, Card } from './aiPrimitives'

export function AdrBody({ provider, workspace, seed }: {
  provider: AiProvider
  workspace: Workspace | null
  /** Set when the Review tab handed a finding over (TEA-43). */
  seed?: AdrSeed | null
}) {
  // Persisted across tab switches: arriving from a finding means leaving the
  // Review tab, and a draft that evaporates on the way back would make the
  // handoff worse than copy/paste.
  const [topic, setTopic] = usePersistentState('adr.topic', '')
  const [background, setBackground] = usePersistentState<string | null>('adr.background', null)
  const [md, setMd] = usePersistentState<string | null>('adr.md', null)
  const [savedPath, setSavedPath] = usePersistentState<string | null>('adr.savedPath', null)
  /** The seed already drafted for — so re-entering the tab doesn't re-spend. */
  const [seededKey, setSeededKey] = usePersistentState<string | null>('adr.seededKey', null)
  const run = useAiRun()
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const createDoc = useDocsStore((s) => s.create)

  /** Draft for `t`, grounded in `bg` when this came from a finding. */
  const draft = (t: string, bg: string | null) => {
    if (!t.trim() || run.loading) return
    run.go(
      () => draftAdr(provider, workspace, t, workspace ? buildDocsContext(useDocsStore.getState().bundles, workspace) : null, bg),
      (m) => { setMd(m); setSavedPath(null) },
    )
  }
  // Typing a topic by hand replaces whatever finding seeded the field — the
  // background belongs to the finding, not to the field.
  const submit = () => draft(topic, background)

  // A finding handed over: fill the field and draft it, once. `run.go` is
  // stable across renders but `draft` is not, so the effect keys on the seed.
  const draftRef = useRef(draft)
  draftRef.current = draft
  // Guarded by a ref as well as the persisted key: React re-runs a mount effect
  // under StrictMode with the same closure, and state set inside it isn't
  // visible to that second run — without the ref the hand-off drafts twice.
  // The ref seeds from the persisted key, so a re-mount still doesn't re-spend.
  const seededRef = useRef(seededKey)
  useEffect(() => {
    if (!seed || seed.sourceKey === seededRef.current) return
    seededRef.current = seed.sourceKey
    setSeededKey(seed.sourceKey)
    setTopic(seed.topic)
    setBackground(seed.background)
    setMd(null)
    setSavedPath(null)
    draftRef.current(seed.topic, seed.background)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])

  // Only offered when the workspace came from a folder: the record lands in
  // its `!adrs` bundle (created, and linked from the DSL, when there is none).
  const canSave = !!workspace && !!getCurrentDirHandle()
  async function save() {
    if (!md || saving) return
    setSaving(true)
    try {
      const path = await createDoc('adrs', {}, { title: adrTitle(md, topic), body: md })
      if (path) { setSavedPath(path); announce(`Saved ${path}`) } else announce('Could not save the decision record')
    } finally {
      setSaving(false)
    }
  }

  function copy() { if (md) navigator.clipboard?.writeText(md).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }

  return (
    <>
      <p style={blurb}>Capture an architecture decision as a Markdown record, grounded in the current model.</p>
      <Field value={topic} onChange={(v) => { setTopic(v); setBackground(null) }} grow={!md} onSubmit={submit}
        placeholder="e.g. Adopt event-driven messaging between the Orders and Payments services" />
      {background && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 7, fontSize: 11.5, lineHeight: 1.45, color: C.muted2 }}>
          <Stethoscope size={12} style={{ flex: 'none', marginTop: 1 }} />
          <span>Grounded in the review finding this came from. Editing the topic drops that context.</span>
        </div>
      )}
      <RunButton label="Draft ADR" loading={run.loading} disabled={!topic.trim()} onClick={submit} />
      <ErrorLine error={run.error} />
      {md && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>ADR</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="c4ai-sec" style={{ ...miniBtn, border: `1px solid ${C.border}`, background: 'transparent', color: C.text }} onClick={copy}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}</button>
              <button className="c4ai-sec" style={{ ...miniBtn, border: `1px solid ${C.border}`, background: 'transparent', color: C.text }} onClick={() => downloadFile(md, adrFilename(topic), 'text/markdown')}><Download size={12} /> .md</button>
              {canSave && (
                <button className="c4ai-sec" style={{ ...miniBtn, border: `1px solid ${C.border}`, background: 'transparent', color: C.text }} onClick={() => void save()} disabled={saving || !!savedPath} title={savedPath ? `Saved to ${savedPath}` : 'Save into the workspace\'s decision records'}>
                  {savedPath ? <Check size={12} /> : <Save size={12} />} {savedPath ? 'Saved' : saving ? 'Saving…' : 'Save to decisions'}
                </button>
              )}
            </div>
          </div>
          <pre data-scroll style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '10px 0 0', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.55, color: C.text2, maxHeight: 280, overflowY: 'auto' }}>{md}</pre>
        </Card>
      )}
    </>
  )
}

/** The drafted record's own heading, falling back to the topic the user typed. */
function adrTitle(md: string, topic: string): string {
  return firstHeading(md) || topic.trim() || 'Decision'
}

function adrFilename(topic: string): string {
  const slug = topic.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'decision'
  return `adr-${slug}.md`
}
