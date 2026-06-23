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
  const dictation = useDictation((text) => onChange(appendDictation(valueRef.current, text)))

  if (!dictation.supported) return null

  return (
    <button
      type="button"
      onClick={dictation.toggle}
      aria-pressed={dictation.listening}
      title={dictation.listening ? 'Stop dictation' : 'Dictate (voice to text)'}
      aria-label={dictation.listening ? 'Stop dictation' : 'Dictate (voice to text)'}
      className="btn-icon"
      style={{
        minWidth: 28,
        minHeight: 28,
        padding: 4,
        color: dictation.listening ? 'var(--color-danger, #dc2626)' : 'var(--color-text-muted)',
        ...style,
      }}
    >
      <Mic size={14} className={dictation.listening ? 'animate-pulse' : undefined} />
    </button>
  )
}
