// Small presentational atoms used by the welcome / collection screens.
// Extracted out of WelcomeScreen.tsx to keep that file focused on the
// route-level state machine.

import { FileText, ChevronRight } from 'lucide-react'

export function C4Mark({ compact }: { compact?: boolean }) {
  return (
    <img
      className={compact ? 'welcome-mark compact' : 'welcome-mark'}
      src="/c4-logo.svg"
      alt=""
      aria-hidden="true"
    />
  )
}

export function LifecycleButton({
  children,
  onClick,
  variant = 'ghost',
  ariaLabel,
}: {
  children: React.ReactNode
  onClick: () => void
  variant?: 'primary' | 'ghost'
  ariaLabel?: string
}) {
  return (
    <button
      className="welcome-button"
      data-variant={variant}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function WelcomeFooter() {
  return (
    <div className="welcome-footer">
      <a href="https://github.com/c4hero/c4hero" target="_blank" rel="noopener noreferrer">GitHub</a>
      <a href="https://c4hero.com" target="_blank" rel="noopener noreferrer">c4hero.com</a>
    </div>
  )
}

export function ArchitectureArtwork() {
  return (
    <div className="welcome-art" aria-hidden="true">
      <svg viewBox="0 0 220 140" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="welcome-edge-gradient" x1="0" x2="1">
            <stop offset="0" stopColor="var(--color-accent-hover)" stopOpacity="0.7" />
            <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <g stroke="url(#welcome-edge-gradient)" strokeWidth="1" fill="none" strokeDasharray="2 4">
          <rect x="20" y="40" width="60" height="36" rx="8" />
          <rect x="100" y="20" width="60" height="36" rx="8" />
          <rect x="100" y="84" width="60" height="36" rx="8" />
          <rect x="180" y="52" width="32" height="36" rx="8" />
          <path d="M80 58 L100 38 M80 58 L100 102 M160 38 L180 70 M160 102 L180 70" />
        </g>
        <g fill="var(--color-accent-hover)" opacity="0.85">
          <circle cx="80" cy="58" r="2" />
          <circle cx="100" cy="38" r="2" />
          <circle cx="100" cy="102" r="2" />
          <circle cx="160" cy="38" r="2" />
          <circle cx="160" cy="102" r="2" />
          <circle cx="180" cy="70" r="2" />
        </g>
        <g stroke="var(--color-accent-hover)" strokeWidth="1.4" strokeLinecap="round" opacity="0.65">
          <path d="M130 42 v8 M126 46 h8" />
        </g>
      </svg>
    </div>
  )
}

export function EmptyWorkspaceArtwork() {
  return (
    <div className="workspace-empty-art" aria-hidden="true">
      <svg viewBox="0 0 110 70" xmlns="http://www.w3.org/2000/svg">
        <g stroke="rgba(121,184,255,0.72)" strokeWidth="1" fill="none" strokeDasharray="2 4">
          <rect x="6" y="22" width="32" height="22" rx="6" />
          <rect x="72" y="22" width="32" height="22" rx="6" />
          <path d="M38 33 H72" />
        </g>
        <g fill="var(--color-accent-hover)" opacity="0.85">
          <circle cx="38" cy="33" r="2" />
          <circle cx="72" cy="33" r="2" />
        </g>
        <g stroke="var(--color-accent-hover)" strokeWidth="1.4" strokeLinecap="round">
          <path d="M55 28 v10 M50 33 h10" />
        </g>
      </svg>
    </div>
  )
}

function GridIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  )
}

function ExportIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 18l5-5 4 4 7-9" />
      <path d="M15 8h5v5" />
    </svg>
  )
}

function OpenSourceIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3v18" />
      <path d="M7 8l5-5 5 5" />
      <path d="M7 16l5 5 5-5" />
    </svg>
  )
}

export function FeatureStrip() {
  const features = [
    { icon: <FileText size={13} />, label: '.dsl files' },
    { icon: <ChevronRight size={13} />, label: 'Git-friendly' },
    { icon: <GridIcon />, label: 'C4 model' },
    { icon: <ExportIcon />, label: 'Export PNG/SVG' },
    { icon: <OpenSourceIcon />, label: 'Open-source · MIT' },
  ]

  return (
    <div className="welcome-features">
      {features.map(({ icon, label }) => (
        <span key={label}>
          {icon}
          {label}
        </span>
      ))}
    </div>
  )
}
