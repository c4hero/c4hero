import { Activity } from 'lucide-react'
import { C } from './aiTheme'
import { useAiUsage, usageSummary } from './aiUsage'

// BYOK cost visibility (TEA-47): a session meter of how many provider calls the
// assistant has fired (an Improve run alone is 3+), plus token totals where the
// provider exposed them. BYOK users pay per call, so this builds trust with the
// exact audience that chose to bring their own key.

/** Small header pill showing the session call count. Hidden until the first call
 *  so it never clutters an untouched panel. Hover/focus reveals the full summary
 *  (calls + tokens) via the title. */
export function UsageCounterPill() {
  const u = useAiUsage()
  if (u.calls === 0) return null
  const title = usageSummary(u)
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, height: 28, padding: '0 8px',
        borderRadius: 999, background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.22)',
        fontSize: 11, fontWeight: 600, color: C.accent, cursor: 'default', flex: 'none',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <Activity size={11} style={{ flex: 'none' }} />
      {u.calls}
    </span>
  )
}
