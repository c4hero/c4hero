import { useState, type CSSProperties } from 'react'
import { X, KeyRound, ExternalLink, ArrowRight, ArrowLeft, Check, ShieldCheck, Activity } from 'lucide-react'
import { useAiSettingsStore } from '@/store/ai-settings'
import { AI_PROVIDER_META, AI_PROVIDER_IDS, type AiProviderId } from '@/lib/ai/providerMeta'
import { resetAiUsage } from '@/lib/ai'
import { C, iconBtn, fieldLabel, keyInput, headerRow, secondaryBtn, primaryBtn } from './aiTheme'
import { useAiUsage, formatTokens } from './aiUsage'

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

export function ByokWelcome({ onClose }: { onClose: () => void }) {
  const provider = useAiSettingsStore((s) => s.provider)
  const update = useAiSettingsStore((s) => s.update)
  const setApiKey = useAiSettingsStore((s) => s.setApiKey)
  const meta = AI_PROVIDER_META[provider]
  const [draft, setDraft] = useState('')
  const save = () => { if (draft.trim()) setApiKey(draft.trim()) }

  return (
    <div data-scroll style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '13px 14px 0' }}>
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

export function SettingsView({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const { enabled, provider, apiKeys, models, routeCheapDrafts, update, setApiKey } = useAiSettingsStore()
  const meta = AI_PROVIDER_META[provider]
  // Whether the cheap tier is a distinct model from the current selection — when
  // they're the same (e.g. OpenAI mini selected), routing changes nothing, so the
  // toggle explains that rather than implying a saving that won't happen.
  const cheapDiffers = meta.cheapModel !== (models[provider] || meta.defaultModel)
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
      <div style={headerRow}>
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

            <UsageRow />

            <Switch
              label="Show AI assistant"
              hint="Show the assistant button on the toolbar. It stays reachable from the command palette (press I) and the app menu either way."
              on={enabled} onToggle={() => update({ enabled: !enabled })}
            />
            <Switch
              label="Cheaper model for quick drafts"
              hint={cheapDiffers
                ? `Auto-describe, tech and tag suggestions use ${meta.cheapModel}; the deep review and interview use your selected model.`
                : `Routes quick drafts to ${meta.cheapModel} — the same as your current selection, so this has no effect until you pick a more capable model.`}
              on={routeCheapDrafts} onToggle={() => update({ routeCheapDrafts: !routeCheapDrafts })}
            />
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

// Session usage meter (TEA-47): calls fired this session (+ tokens where the
// provider reported them). BYOK is billed per call, so the number is here where
// the key lives. Hidden until the first call so a fresh session stays clean.
function UsageRow() {
  const usage = useAiUsage()
  if (usage.calls === 0) return null
  const tokens = usage.inputTokens + usage.outputTokens
  // Single compact line — the in/out split lives in the tooltip so the settings
  // screen stays short. The header pill carries the same count at a glance.
  const tokenTitle = usage.measuredCalls > 0
    ? `${formatTokens(usage.inputTokens)} in · ${formatTokens(usage.outputTokens)} out`
    : undefined
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card }}>
      <Activity size={13} color={C.accent} style={{ flex: 'none' }} />
      <span title={tokenTitle} style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.text2, fontVariantNumeric: 'tabular-nums' }}>
        <b style={{ color: C.text, fontWeight: 600 }}>{usage.calls}</b> {usage.calls === 1 ? 'call' : 'calls'} this session
        {usage.measuredCalls > 0 && <> · <b style={{ color: C.text, fontWeight: 600 }}>~{formatTokens(tokens)}</b> tokens</>}
      </span>
      <button onClick={resetAiUsage} className="c4ai-ghost" style={{ flex: 'none', height: 24, padding: '0 8px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>Reset</button>
    </div>
  )
}

// Labelled on/off switch — the settings toggles share this shape.
function Switch({ label, hint, on, onToggle }: { label: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div><div style={fieldLabel}>{label}</div><div style={{ fontSize: 12, color: C.muted2, marginTop: 2 }}>{hint}</div></div>
      <button role="switch" aria-checked={on} aria-label={label} onClick={onToggle} style={{ width: 36, height: 20, borderRadius: 999, background: on ? C.accent : 'rgba(255,255,255,0.16)', position: 'relative', flex: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <span style={{ position: 'absolute', top: 2, [on ? 'right' : 'left']: 2, width: 16, height: 16, borderRadius: '50%', background: on ? C.ink : C.text } as CSSProperties} />
      </button>
    </div>
  )
}

function SecurityNote({ style }: { style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)', ...style }}>
      <ShieldCheck size={14} color={C.accent} style={{ flex: 'none', marginTop: 1 }} />
      <span style={{ fontSize: 11.5, lineHeight: 1.45, color: C.text2 }}>Your key stays in this browser and is sent only to the provider. Anyone with access to this profile can read it.</span>
    </div>
  )
}
