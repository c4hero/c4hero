import { useEffect, useRef } from 'react'
import { Mic } from 'lucide-react'
import { useDictation, appendDictation } from './useDictation'

/** Ref that always holds the latest value (read inside async speech callbacks). */
function useLatest<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => { ref.current = value }, [value])
  return ref
}

/** Mic toggle button that appends dictated speech to a text value. Hidden when
 *  the browser doesn't support the Web Speech API. */
export function MicButton({
  value, onChange, style,
}: {
  value: string
  onChange: (next: string) => void
  style?: React.CSSProperties
}) {
  const valueRef = useLatest(value)
  const dictation = useDictation((text) => {
    // Update the ref synchronously: a single recognition event can fire this more
    // than once, and reading the render-synced ref each time would overwrite all
    // but the last segment. Appending to (and re-storing) the ref accumulates them.
    const next = appendDictation(valueRef.current, text)
    valueRef.current = next
    onChange(next)
  })

  if (!dictation.supported) return null

  const listening = dictation.listening

  return (
    <button
      type="button"
      onClick={dictation.toggle}
      aria-pressed={listening}
      title={listening ? 'Listening… click to stop' : 'Dictate (voice to text)'}
      aria-label={listening ? 'Listening — click to stop dictation' : 'Dictate (voice to text)'}
      className="btn-icon"
      style={{
        position: 'relative',
        minWidth: 28,
        minHeight: 28,
        padding: 4,
        borderRadius: 8,
        color: listening ? '#ef4444' : 'var(--color-text-muted)',
        background: listening ? 'rgba(239,68,68,0.14)' : undefined,
        border: `1px solid ${listening ? 'rgba(239,68,68,0.5)' : 'transparent'}`,
        ...style,
      }}
    >
      {/* expanding "recording" ring */}
      {listening && (
        <span aria-hidden className="animate-ping"
          style={{ position: 'absolute', inset: -1, borderRadius: 9, border: '1.5px solid #ef4444', opacity: 0.5, pointerEvents: 'none' }} />
      )}
      <Mic size={14} className={listening ? 'animate-pulse' : undefined} />
      {/* live recording dot */}
      {listening && (
        <span aria-hidden
          style={{ position: 'absolute', top: 1, right: 1, width: 5, height: 5, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 5px #ef4444' }} />
      )}
    </button>
  )
}
