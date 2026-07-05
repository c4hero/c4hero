import { useSyncExternalStore } from 'react'
import { getAiUsage, subscribeAiUsage, type AiUsage } from '@/lib/ai'

// BYOK cost visibility (TEA-47): read-side helpers for the session usage meter.
// Kept in a .ts module (no JSX) so the component file can export only its
// component — see UsageCounter.tsx.

/** Subscribe a component to the session usage meter. */
export function useAiUsage(): AiUsage {
  return useSyncExternalStore(subscribeAiUsage, getAiUsage, getAiUsage)
}

/** Compact token count, e.g. 940, 3.2k, 48k. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  return `${Math.round(n / 1000)}k`
}

/** One-line human summary of the session's usage, for a tooltip / settings row. */
export function usageSummary(u: AiUsage): string {
  const calls = `${u.calls} AI ${u.calls === 1 ? 'call' : 'calls'} this session`
  const tokens = u.measuredCalls > 0
    ? ` · ~${formatTokens(u.inputTokens + u.outputTokens)} tokens`
    : ''
  return `${calls}${tokens} — billed to your key`
}
