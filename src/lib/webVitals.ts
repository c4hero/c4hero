// Reports Core Web Vitals through the existing structured logger so they
// land in whatever transport the operator has configured (console in dev,
// VITE_LOG_ENDPOINT in production, or a future Sentry/web-vitals provider).
//
// Metrics surfaced: LCP (Largest Contentful Paint), INP (Interaction to
// Next Paint), CLS (Cumulative Layout Shift), FCP, TTFB. See
// https://web.dev/articles/vitals for definitions.

import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'
import { createLogger } from './logger'

const log = createLogger('web-vitals')

/** Subscribe to all Core Web Vitals. Call once at app boot. */
export function reportWebVitals(): void {
  const handler = (metric: Metric) => {
    // Use info level — these are observability data, not errors.
    log.info(metric.name, {
      value: Math.round(metric.value * 100) / 100,
      rating: metric.rating,
      id: metric.id,
      navigationType: metric.navigationType,
    })
  }
  onCLS(handler)
  onFCP(handler)
  onINP(handler)
  onLCP(handler)
  onTTFB(handler)
}
