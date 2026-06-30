import { useEffect, useRef, useState } from 'react'

// Voice-to-text for AI text inputs, using the browser's Web Speech API
// (SpeechRecognition). No API key and no request from our code — recognition is
// handled by the browser. Unavailable in some browsers (the mic button hides
// itself there). Requires a secure context (HTTPS); dev-app and prod both are.

/** Append a dictated chunk to existing text, inserting a space when needed.
 *  Pure + unit-tested. */
export function appendDictation(existing: string, chunk: string): string {
  const piece = chunk.trim()
  if (!piece) return existing
  if (!existing) return piece
  return /\s$/.test(existing) ? existing + piece : `${existing} ${piece}`
}

function getRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  return window.SpeechRecognition ?? window.webkitSpeechRecognition
}

export interface Dictation {
  supported: boolean
  listening: boolean
  toggle: () => void
  stop: () => void
}

/** Manage a SpeechRecognition session, delivering finalized transcript segments
 *  to `onFinalText`. The callback is held in a ref so the latest closure (with
 *  current field value) is always used without re-subscribing handlers. */
export function useDictation(onFinalText: (text: string) => void): Dictation {
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRecognitionInstance | null>(null)
  const callbackRef = useRef(onFinalText)
  const supported = !!getRecognitionCtor()

  useEffect(() => { callbackRef.current = onFinalText }, [onFinalText])

  useEffect(() => {
    return () => {
      try { recRef.current?.abort() } catch { /* ignore */ }
      recRef.current = null
    }
  }, [])

  function ensure(): SpeechRecognitionInstance | null {
    if (recRef.current) return recRef.current
    const Ctor = getRecognitionCtor()
    if (!Ctor) return null
    const rec = new Ctor()
    rec.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US'
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) callbackRef.current(result[0].transcript)
      }
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recRef.current = rec
    return rec
  }

  function stop() {
    try { recRef.current?.stop() } catch { /* ignore */ }
    setListening(false)
  }

  function toggle() {
    if (listening) { stop(); return }
    const rec = ensure()
    if (!rec) return
    try {
      rec.start()
      setListening(true)
    } catch (err) {
      // start() throws InvalidStateError when it's already running — that's a
      // benign re-entry, so treat it as listening. Any other error (e.g. not
      // allowed / insecure context) is a real failure: stay not-listening so the
      // button doesn't get stuck showing "Listening…" while nothing is captured.
      setListening((err as { name?: string })?.name === 'InvalidStateError')
    }
  }

  return { supported, listening, toggle, stop }
}
