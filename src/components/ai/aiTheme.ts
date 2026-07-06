import type { CSSProperties } from 'react'

// ─── Palette (the "AI Assistant Hybrid" design) ─────────────────────

export const C = {
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


export const STYLE = `
.c4ai [data-scroll]{scrollbar-width:thin;scrollbar-color:rgba(88,166,255,0.28) transparent}
.c4ai [data-scroll]::-webkit-scrollbar{width:10px;height:10px}
.c4ai [data-scroll]::-webkit-scrollbar-thumb{background:rgba(88,166,255,0.22);border-radius:999px;border:3px solid transparent;background-clip:padding-box}
.c4ai-pri:hover{background:${C.accentHover}!important}
.c4ai-ghost:hover{background:rgba(255,255,255,0.06)!important;color:${C.text}!important}
.c4ai-sec:hover{background:rgba(255,255,255,0.05)!important}
.c4ai-card:hover{border-color:${C.borderStrong}!important;background:#1c2128!important}
.c4ai-chip:hover{color:${C.text2}!important}
.c4ai-link:hover{text-decoration:underline}
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
@keyframes c4ai-dot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
.c4ai-msg{animation:c4ai-rise .22s cubic-bezier(0.16,1,0.3,1) both}
@media (prefers-reduced-motion:reduce){.c4ai .c4ai-msg{animation:none}}
.c4ai-node{transform-box:fill-box;transform-origin:center;animation:c4ai-node 1.7s ease-in-out infinite}
.c4ai-edge{stroke-dasharray:3 5;animation:c4ai-flow .9s linear infinite}
.c4ai-ping{transform-box:fill-box;transform-origin:center;animation:c4ai-ping 2.8s cubic-bezier(.4,0,.2,1) infinite}
.c4ai-pop{transform-box:fill-box;transform-origin:center;animation:c4ai-pop .5s cubic-bezier(.34,1.56,.64,1) both}
`

// ─── style objects ──────────────────────────────────────────────────

export const headerRow: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px 13px', borderBottom: `1px solid ${C.border}`, flex: 'none' }
export const iconBtn: CSSProperties = { width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', color: C.muted, cursor: 'pointer' }
export const blurb: CSSProperties = { fontSize: 12, color: C.muted2, margin: '0 0 12px' }
export const kicker: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted2 }
export const fieldLabel: CSSProperties = { fontSize: 13, fontWeight: 600, color: C.text }
export const liStyle: CSSProperties = { fontSize: 13, color: C.text, lineHeight: 1.45 }
export const primaryBtn: CSSProperties = { height: 32, padding: '0 14px', borderRadius: 10, border: 'none', background: C.accent, color: C.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }
export const secondaryBtn: CSSProperties = { height: 32, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontSize: 13, fontWeight: 500, cursor: 'pointer' }
export const miniBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 11px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }
export const keyInput: CSSProperties = { flex: 1, minWidth: 0, width: '100%', height: 38, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontFamily: 'ui-monospace, monospace', fontSize: 13 }
