import { useState } from 'react'
import { ExternalLink, Megaphone, X } from 'lucide-react'
import DialogShell from '@/components/shared/DialogShell'
import { WHATS_NEW, unseenRelease, dismissRelease, type WhatsNewRelease } from '@/lib/whatsNew'

/** Subtle what's-new affordance: a small pill that appears when a release the
 *  user hasn't dismissed is available. Clicking it opens the details dialog;
 *  dismissing (pill ✕ or the dialog's Got it) hides it until a new release id
 *  ships. Renders nothing at all when there's nothing unseen.
 *
 *  `release` is injectable for tests; production mounts read WHATS_NEW. */
export default function WhatsNewPill({ release = WHATS_NEW }: { release?: WhatsNewRelease | null }) {
  const [unseen, setUnseen] = useState(() => unseenRelease(release))
  const [open, setOpen] = useState(false)

  if (!unseen) return null

  const dismiss = () => {
    dismissRelease(unseen)
    setOpen(false)
    setUnseen(null)
  }

  return (
    <>
      <div
        className="glass-flyout"
        style={{
          position: 'fixed',
          top: 'max(14px, env(safe-area-inset-top, 0px))',
          right: 14,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 6px 4px 10px',
        }}
      >
        <button
          onClick={() => setOpen(true)}
          aria-label="What's new in c4hero"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: 'none',
            padding: 0,
            fontSize: 12,
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
          }}
        >
          <Megaphone size={13} style={{ color: 'var(--color-accent)' }} />
          What's new
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss what's new"
          className="btn-icon !min-h-6 !min-w-6 !p-1"
        >
          <X size={12} />
        </button>
      </div>

      {open && (
        <DialogShell
          onClose={() => setOpen(false)}
          ariaLabel="What's new in c4hero"
          className="w-full max-w-md rounded-xl border p-5 shadow-2xl"
          style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Megaphone size={14} style={{ color: 'var(--color-accent)' }} /> What's new
            </h2>
            <button onClick={() => setOpen(false)} className="btn-icon !min-h-7 !min-w-7 !p-1" aria-label="Close dialog">
              <X size={14} />
            </button>
          </div>
          <div className="mb-3 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{unseen.date}</div>

          <ul style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: 0, padding: 0, listStyle: 'none' }}>
            {unseen.items.map((item) => (
              <li key={item.title}>
                <div className="text-[13px] font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.title}</div>
                <div className="text-[12px]" style={{ color: 'var(--color-text-muted)', marginTop: 2 }}>{item.body}</div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between">
            {unseen.link ? (
              <a
                href={unseen.link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px]"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-accent)' }}
              >
                {unseen.link.label} <ExternalLink size={11} />
              </a>
            ) : <span />}
            <button onClick={dismiss} className="btn-surface">
              Got it
            </button>
          </div>
        </DialogShell>
      )}
    </>
  )
}
