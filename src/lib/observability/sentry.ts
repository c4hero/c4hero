import * as Sentry from '@sentry/react'
import type { ErrorEvent } from '@sentry/react'
import { hasHostedObservabilityOptOut } from './privacySignals'

let initialized = false

function getRelease(): string | undefined {
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : undefined
  const hash = typeof __COMMIT_HASH__ === 'string' ? __COMMIT_HASH__ : undefined
  if (version && hash) return `${version}+${hash}`
  return version ?? hash
}

function getEnvironment(): string {
  const configured = (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined)?.trim()
  if (configured) return configured
  return import.meta.env.PROD ? 'production' : 'development'
}

export function scrubAppRouteUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, window.location.origin)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] === 'collection') {
      if (parts.length <= 1) return `${url.origin}/collection`
      if (parts.length === 2) return `${url.origin}/collection/[collection]`
      if (parts.length === 3) return `${url.origin}/collection/[collection]/[workspace]`
      return `${url.origin}/collection/[collection]/[workspace]/[view]`
    }
    return `${url.origin}${url.pathname}`
  } catch {
    return '[unparseable-url]'
  }
}

function scrubBreadcrumbMessage(message: string | undefined): string | undefined {
  if (!message) return message
  return message.replace(/([?&][^=\s]*(?:token|key|secret|password|auth|code)[^=\s]*=)[^&\s]*/gi, '$1[redacted]')
}

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent | null {
  event.user = undefined

  if (event.request) {
    event.request = {
      ...event.request,
      url: event.request.url ? scrubAppRouteUrl(event.request.url) : undefined,
      query_string: undefined,
      cookies: undefined,
      headers: undefined,
      data: undefined,
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => ({
      ...breadcrumb,
      message: scrubBreadcrumbMessage(breadcrumb.message),
      data: undefined,
    }))
  }

  return event
}

function sanitizeExtraContext(context: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!context) return undefined
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context)) {
    if (/password|token|secret|authorization|cookie|dsn|key/i.test(key)) continue
    if (key === 'componentStack' && typeof value === 'string') {
      sanitized.componentStack = value
    } else if ((key === 'component' || key === 'source') && typeof value === 'string') {
      sanitized[key] = value
    } else if ((key === 'line' || key === 'col') && typeof value === 'number') {
      sanitized[key] = value
    } else if (value instanceof Error) {
      sanitized[key] = { name: value.name, message: value.message }
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

export function initSentry(): boolean {
  if (initialized) return true

  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim()
  if (!dsn || hasHostedObservabilityOptOut()) return false

  Sentry.init({
    dsn,
    environment: getEnvironment(),
    release: getRelease(),
    // Sentry v11 replaced `sendDefaultPii: false` with per-category opt-outs
    // whose defaults are all permissive, so each one is switched off here.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0,
    beforeSend: scrubSentryEvent,
    ignoreErrors: [/ResizeObserver loop/i],
  })
  initialized = true
  return true
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const extra = sanitizeExtraContext(context)
  Sentry.captureException(error, extra ? { extra } : undefined)
}

export function resetSentryForTests(): void {
  initialized = false
}
