import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useAnchoredPopover } from '@/hooks/useAnchoredPopover'

/** Shared color-picker component used by the tag manager surfaces. Constants
 *  live in `tagStyleConstants.ts` so this file exports only components and
 *  keeps React Fast Refresh boundaries clean. */

export function ColorPicker({ value, onChange, presets }: {
  value: string; onChange: (value: string) => void; presets: string[]
}) {
  // Popup dimensions: 6 items per row × 22px + gaps + padding
  const POPUP_W = 158
  const POPUP_H = 64
  const { open: showPresets, toggle, setOpen: setShowPresets, triggerRef, popupRef, coords } =
    useAnchoredPopover<HTMLButtonElement, HTMLDivElement>({
      width: POPUP_W,
      height: POPUP_H,
      side: 'auto',
      gap: 4,
    })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, position: 'relative' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#hex or name"
        style={{ flex: 1, height: 26, padding: '0 8px', paddingLeft: 26, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', fontSize: 'var(--text-xs)', outline: 'none' }}
      />
      <button
        ref={triggerRef}
        onClick={toggle}
        style={{ position: 'absolute', left: 5, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, borderRadius: 3, border: '1px solid var(--color-border)', background: value || 'transparent', cursor: 'pointer', padding: 0 }}
      />
      {showPresets && coords && createPortal(
        <div ref={popupRef} style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
          zIndex: 9999,
          padding: 6,
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface-1)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 22px)',
          gap: 4,
        }}>
          {presets.map((c) => (
            <button key={c} onClick={() => { onChange(c); setShowPresets(false) }}
              style={{ width: 22, height: 22, borderRadius: 'var(--radius-sm)', border: value === c ? '2px solid var(--color-accent)' : '1px solid var(--color-border)', background: c, cursor: 'pointer', padding: 0 }}
            />
          ))}
          <button onClick={() => { onChange(''); setShowPresets(false) }}
            style={{ width: 22, height: 22, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={10} />
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
