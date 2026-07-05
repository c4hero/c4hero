// Session-scoped BYOK usage meter. Every provider call flows through the shared
// HTTP layer (providers/http.ts), which is the single choke point that counts
// calls; providers additionally report token usage where their response exposes
// it. BYOK users pay per call, so surfacing this builds trust with exactly the
// audience that chose to bring their own key.
//
// Kept as a tiny framework-agnostic singleton (not a zustand store) so the pure
// `lib/ai` layer stays free of store/React imports. The UI subscribes via
// `useSyncExternalStore(subscribeAiUsage, getAiUsage)` — `getAiUsage` returns a
// stable reference between changes, so it's a valid snapshot source.

export interface AiUsage {
  /** Successful provider HTTP calls this session (JSON + streaming). */
  calls: number
  /** Prompt (input) tokens summed across calls whose response exposed usage. */
  inputTokens: number
  /** Completion (output) tokens summed across calls whose response exposed usage. */
  outputTokens: number
  /** Calls that actually reported token usage — so the UI can say "~N tokens"
   *  honestly when only some calls (e.g. non-streaming) carried counts. */
  measuredCalls: number
}

const ZERO: AiUsage = { calls: 0, inputTokens: 0, outputTokens: 0, measuredCalls: 0 }

// Reassigned (never mutated in place) on every change so the reference identity
// itself signals "changed" to useSyncExternalStore.
let usage: AiUsage = ZERO
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

/** Record one successful provider call. Called centrally from the HTTP layer. */
export function recordAiCall(): void {
  usage = { ...usage, calls: usage.calls + 1 }
  emit()
}

/** Record token usage for the most recent call, when the provider exposed it.
 *  A no-op for zero/absent counts so a provider without usage never inflates
 *  `measuredCalls`. */
export function recordAiTokens(inputTokens: number, outputTokens: number): void {
  if (!inputTokens && !outputTokens) return
  usage = {
    ...usage,
    inputTokens: usage.inputTokens + (inputTokens || 0),
    outputTokens: usage.outputTokens + (outputTokens || 0),
    measuredCalls: usage.measuredCalls + 1,
  }
  emit()
}

/** Reset the session meter (e.g. from a "reset" affordance in the counter UI). */
export function resetAiUsage(): void {
  if (usage === ZERO) return
  usage = ZERO
  emit()
}

/** Current snapshot. Stable reference between changes (safe for useSyncExternalStore). */
export function getAiUsage(): AiUsage {
  return usage
}

/** Subscribe to usage changes; returns an unsubscribe function. */
export function subscribeAiUsage(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
