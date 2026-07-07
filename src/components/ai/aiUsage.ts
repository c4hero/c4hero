import { useSyncExternalStore } from 'react'
import { getAiUsage, subscribeAiUsage, type AiUsage } from '@/lib/ai'

// BYOK cost visibility (TEA-47): read-side helpers for the session usage meter,
// consumed by SettingsView. Kept in a .ts module (no JSX) so hooks/formatters
// stay importable without pulling in a component.

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
