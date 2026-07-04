import { useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { draftAdr, type AiProvider } from '@/lib/ai'
import { downloadFile } from '@/lib/exportUtils'
import type { Workspace } from '@/types/model'
import { C, blurb, miniBtn } from './aiTheme'
import { useAiRun } from './aiHelpers'
import { Field, RunButton, ErrorLine, Card } from './aiPrimitives'

export function AdrBody({ provider, workspace }: { provider: AiProvider; workspace: Workspace | null }) {
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

function adrFilename(topic: string): string {
  const slug = topic.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'decision'
  return `adr-${slug}.md`
}
