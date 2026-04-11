import { useState, useRef, useEffect } from 'react'
import type { WorkspaceScope } from '@/types/model'
import { X } from 'lucide-react'
import { slugifyName } from '@/lib/folderIO'

// ─── Animated diagrams ───────────────────────────────────────────────

function SystemDiagram({ name }: { name: string }) {
  const filename = `${slugifyName(name) || 'workspace'}.dsl`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', opacity: 0.7, textAlign: 'center' }}>
        System — 3 diagram levels
      </div>
      <svg width="180" height="120" viewBox="0 0 180 120">
        {/* L1: System Context */}
        <rect x="50" y="4" width="80" height="22" rx="6" fill="none" stroke="#a78bfa" strokeWidth="1.5">
          <animate attributeName="opacity" values="0;1" dur="0.4s" fill="freeze" />
        </rect>
        <text x="90" y="18" textAnchor="middle" fontSize="9" fill="#a78bfa" fontWeight="600">
          <animate attributeName="opacity" values="0;1" dur="0.4s" begin="0.15s" fill="freeze" />
          System Context
        </text>

        {/* L2: Containers */}
        <rect x="6" y="42" width="60" height="22" rx="6" fill="none" stroke="#38bdf8" strokeWidth="1.5">
          <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.3s" fill="freeze" />
        </rect>
        <text x="36" y="56" textAnchor="middle" fontSize="8" fill="#38bdf8" fontWeight="600" opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.4s" fill="freeze" />
          API Container
        </text>
        <rect x="78" y="42" width="60" height="22" rx="6" fill="none" stroke="#38bdf8" strokeWidth="1.5" opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.35s" fill="freeze" />
        </rect>
        <text x="108" y="56" textAnchor="middle" fontSize="8" fill="#38bdf8" fontWeight="600" opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.45s" fill="freeze" />
          DB Container
        </text>

        {/* L3: Components */}
        <rect x="4" y="80" width="40" height="18" rx="5" fill="none" stroke="#22c55e" strokeWidth="1.2" opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.55s" fill="freeze" />
        </rect>
        <text x="24" y="92" textAnchor="middle" fontSize="7" fill="#22c55e" fontWeight="600" opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.6s" fill="freeze" />
          Auth
        </text>
        <rect x="50" y="80" width="40" height="18" rx="5" fill="none" stroke="#22c55e" strokeWidth="1.2" opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.6s" fill="freeze" />
        </rect>
        <text x="70" y="92" textAnchor="middle" fontSize="7" fill="#22c55e" fontWeight="600" opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.65s" fill="freeze" />
          User
        </text>
        <rect x="96" y="80" width="48" height="18" rx="5" fill="none" stroke="#22c55e" strokeWidth="1.2" opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.65s" fill="freeze" />
        </rect>
        <text x="120" y="92" textAnchor="middle" fontSize="7" fill="#22c55e" fontWeight="600" opacity="0">
          <animate attributeName="opacity" values="0;1" dur="0.3s" begin="0.7s" fill="freeze" />
          PostgreSQL
        </text>

        {/* Legend */}
        <text x="4" y="112" fontSize="7" fill="#a78bfa" fontWeight="500" opacity="0">
          <animate attributeName="opacity" values="0;0.7" dur="0.2s" begin="0.8s" fill="freeze" />L1 Context</text>
        <text x="4" y="119" fontSize="7" fill="#38bdf8" fontWeight="500" opacity="0">
          <animate attributeName="opacity" values="0;0.7" dur="0.2s" begin="0.85s" fill="freeze" />L2 Container</text>
        <text x="60" y="112" fontSize="7" fill="#22c55e" fontWeight="500" opacity="0">
          <animate attributeName="opacity" values="0;0.7" dur="0.2s" begin="0.9s" fill="freeze" />L3 Component</text>
      </svg>
      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', opacity: 0.5 }}>{filename}</div>
    </div>
  )
}

function LandscapeDiagram({ name }: { name: string }) {
  const filename = `${slugifyName(name) || 'workspace'}.dsl`
  const systems = ['Payment', 'Auth', 'Inventory', 'Notify']
  const colors = ['#f59e0b', '#a78bfa', '#38bdf8', '#22c55e']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', opacity: 0.7, textAlign: 'center' }}>
        Landscape — systems map
      </div>
      <svg width="180" height="100" viewBox="0 0 180 100">
        {systems.map((sys, i) => {
          const col = i % 2
          const row = Math.floor(i / 2)
          const x = 20 + col * 80
          const y = 8 + row * 48
          const color = colors[i]
          return (
            <g key={sys}>
              <rect x={x} y={y} width="68" height="36" rx="8" fill="none" stroke={color} strokeWidth="1.5" opacity="0">
                <animate attributeName="opacity" values="0;1" dur="0.3s" begin={`${0.15 + i * 0.12}s`} fill="freeze" />
              </rect>
              <text x={x + 34} y={y + 17} textAnchor="middle" fontSize="10" fill={color} fontWeight="700" opacity="0">
                <animate attributeName="opacity" values="0;1" dur="0.3s" begin={`${0.25 + i * 0.12}s`} fill="freeze" />
                {sys}
              </text>
              <text x={x + 34} y={y + 28} textAnchor="middle" fontSize="7" fill={color} fontWeight="500" opacity="0">
                <animate attributeName="opacity" values="0;0.6" dur="0.3s" begin={`${0.3 + i * 0.12}s`} fill="freeze" />
                System
              </text>
            </g>
          )
        })}
      </svg>
      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', opacity: 0.5 }}>{filename}</div>
    </div>
  )
}

// ─── Main dialog ─────────────────────────────────────────────────────

const TYPE_DESCRIPTIONS: Record<string, string> = {
  softwaresystem: 'One system, multiple levels of detail: context → containers → components.',
  landscape: 'Multiple systems on one canvas — relationships and boundaries across your estate.',
}

export default function ScopePickerDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (scope: WorkspaceScope, name: string, openAfter: boolean, description: string) => void
  onCancel: () => void
}) {
  const [scope, setScope] = useState<'softwaresystem' | 'landscape'>('softwaresystem')
  const [name, setName] = useState('My Architecture')
  const [description, setDescription] = useState('')
  const [openAfter, setOpenAfter] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const slug = slugifyName(name)
  const canSubmit = name.trim().length > 0

  useEffect(() => {
    setTimeout(() => inputRef.current?.select(), 50)
  }, [])

  function handleCreate() {
    if (!canSubmit) return
    onConfirm(scope, name.trim(), openAfter, description)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: 600, maxWidth: '95vw', borderRadius: 16,
          background: 'var(--color-bg-panel, #0f1923)',
          border: '1px solid var(--color-border)',
          padding: '24px 28px',
          display: 'flex', flexDirection: 'column', gap: 0,
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            New Workspace
          </span>
          <button
            onClick={onCancel}
            aria-label="Close dialog"
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 6, border: 'none', background: 'transparent',
              color: 'var(--color-text-muted)', cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — 2 columns */}
        <div style={{ display: 'flex', gap: 24 }}>

          {/* Left column */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>
                Workspace name
              </label>
              <input
                ref={inputRef}
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') onCancel() }}
                placeholder="My Architecture"
                style={{
                  width: '100%', padding: '10px 14px',
                  borderRadius: 10, fontSize: 14, fontWeight: 500,
                  background: 'var(--glass-overlay-xs)',
                  border: '1px solid var(--color-border-hover, rgba(88,166,255,0.25))',
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', opacity: 0.6, fontFamily: 'monospace' }}>
                {slug || 'workspace'}.dsl
              </span>
            </div>

            {/* Type toggle */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>
                Type
              </label>
              <div style={{
                display: 'flex', borderRadius: 10, overflow: 'hidden',
                border: '1px solid var(--color-border)',
              }}>
                <button
                  onClick={() => setScope('softwaresystem')}
                  style={{
                    flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600,
                    background: scope === 'softwaresystem' ? 'var(--color-accent)' : 'transparent',
                    color: scope === 'softwaresystem' ? '#0d1117' : 'var(--color-text-muted)',
                    transition: 'background 150ms, color 150ms',
                  }}
                >
                  System
                </button>
                <button
                  onClick={() => setScope('landscape')}
                  style={{
                    flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600,
                    background: scope === 'landscape' ? 'var(--color-accent)' : 'transparent',
                    color: scope === 'landscape' ? '#0d1117' : 'var(--color-text-muted)',
                    transition: 'background 150ms, color 150ms',
                    borderLeft: '1px solid var(--color-border)',
                  }}
                >
                  Landscape
                </button>
              </div>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                {TYPE_DESCRIPTIONS[scope]}
              </span>
            </div>

            {/* Description */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>
                Description <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Briefly describe this workspace..."
                rows={3}
                style={{
                  width: '100%', padding: '10px 14px',
                  borderRadius: 10, fontSize: 13,
                  background: 'var(--glass-overlay-xs)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  outline: 'none', resize: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </div>

          {/* Right column — animated diagram preview */}
          <div style={{
            width: 210, flexShrink: 0,
            background: 'var(--color-backdrop)',
            borderRadius: 12,
            border: '1px solid var(--color-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 14,
          }}>
            {scope === 'softwaresystem'
              ? <SystemDiagram key="sys" name={name} />
              : <LandscapeDiagram key="land" name={name} />
            }
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={openAfter}
              onChange={e => setOpenAfter(e.target.checked)}
              style={{ accentColor: 'var(--color-accent)', width: 14, height: 14 }}
            />
            Open workspace after creating
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-surface" onClick={onCancel} style={{ padding: '8px 18px' }}>
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!canSubmit}
              style={{
                padding: '8px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: canSubmit ? 'var(--color-accent)' : 'var(--color-accent-glow)',
                color: canSubmit ? '#0d1117' : 'var(--color-text-muted)',
                border: 'none', cursor: canSubmit ? 'pointer' : 'default',
                transition: 'background 150ms',
              }}
            >
              Create Workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
