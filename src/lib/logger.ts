// ─── Structured logger with pluggable transports ─────────────────────
//
// Every log call flows through:  createLogger() → emit() → [console + registered transports]
//
// Quick start:
//
//   import { createLogger } from '@/lib/logger'
//   const log = createLogger('myModule')
//   log.info('loaded')
//   log.error('request failed', { status: 500 })
//
// ─── Adding a custom transport ───────────────────────────────────────
//
// Call addTransport() early in your app (e.g. in main.tsx before createRoot).
// Each transport is a function that receives a LogEntry for every log that
// passes the minimum level filter. addTransport returns an unregister function.
//
// Sentry:
//
//   import * as Sentry from '@sentry/react'
//   import { addTransport, type LogEntry } from '@/lib/logger'
//
//   Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN })
//
//   addTransport((entry: LogEntry) => {
//     if (entry.level === 'error') {
//       Sentry.captureException(
//         entry.data instanceof Error ? entry.data : new Error(entry.message),
//         { tags: { component: entry.component } },
//       )
//     } else if (entry.level === 'warn') {
//       Sentry.addBreadcrumb({
//         category: entry.component,
//         message: entry.message,
//         level: 'warning',
//       })
//     }
//   })
//
// Datadog Browser Logs:
//
//   import { datadogLogs } from '@datadog/browser-logs'
//   import { addTransport, type LogEntry } from '@/lib/logger'
//
//   datadogLogs.init({ clientToken: '...', site: 'datadoghq.com', service: 'c4hero' })
//
//   addTransport((entry: LogEntry) => {
//     datadogLogs.logger[entry.level]?.(entry.message, {
//       component: entry.component,
//       data: entry.data,
//     })
//   })
//
// Remote HTTP endpoint:
//
//   import { addTransport, type LogEntry } from '@/lib/logger'
//
//   const buffer: LogEntry[] = []
//   const FLUSH_INTERVAL = 5_000
//
//   addTransport((entry: LogEntry) => {
//     if (entry.level === 'warn' || entry.level === 'error') {
//       buffer.push(entry)
//     }
//   })
//
//   setInterval(() => {
//     if (buffer.length === 0) return
//     const batch = buffer.splice(0)
//     navigator.sendBeacon('/api/logs', JSON.stringify(batch))
//   }, FLUSH_INTERVAL)
//
// Filtering by level in a transport:
//
//   The built-in min-level filter runs before transports. If you need a
//   transport to only handle certain levels, filter inside your function:
//
//   addTransport((entry) => {
//     if (entry.level !== 'error') return
//     // ...handle errors only
//   })
//
// ─────────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  level: LogLevel
  component: string
  message: string
  data?: unknown
  timestamp: string
}

/** A transport receives every log entry that passes the minimum level filter. */
export type LogTransport = (entry: LogEntry) => void

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const minLevel: LogLevel = import.meta.env.DEV ? 'debug' : 'warn'
const transports: LogTransport[] = []

// ─── Transport management ────────────────────────────────────────────

/** Register an additional log transport (e.g. Sentry, Datadog, remote endpoint).
 *  Returns an unregister function. */
export function addTransport(transport: LogTransport): () => void {
  transports.push(transport)
  return () => {
    const idx = transports.indexOf(transport)
    if (idx >= 0) transports.splice(idx, 1)
  }
}

// ─── Built-in console transport ──────────────────────────────────────

function consoleTransport(entry: LogEntry) {
  const prefix = `[c4hero][${entry.component}]`
  const consoleFn = entry.level === 'error' ? console.error
    : entry.level === 'warn' ? console.warn
    : entry.level === 'info' ? console.info
    : console.debug

  if (entry.data !== undefined) {
    consoleFn(prefix, entry.message, entry.data)
  } else {
    consoleFn(prefix, entry.message)
  }
}

// ─── Core emit ───────────────────────────────────────────────────────

function emit(entry: LogEntry) {
  if (LEVEL_PRIORITY[entry.level] < LEVEL_PRIORITY[minLevel]) return
  consoleTransport(entry)
  for (const transport of transports) {
    try { transport(entry) } catch { /* don't let a transport crash the app */ }
  }
}

// ─── Logger factory ──────────────────────────────────────────────────

/** Create a namespaced logger. The `component` string is included in every log entry
 *  so you can filter by source in the console or in your transport. */
export function createLogger(component: string) {
  function log(level: LogLevel, message: string, data?: unknown) {
    emit({ level, component, message, data, timestamp: new Date().toISOString() })
  }

  return {
    debug: (message: string, data?: unknown) => log('debug', message, data),
    info: (message: string, data?: unknown) => log('info', message, data),
    warn: (message: string, data?: unknown) => log('warn', message, data),
    error: (message: string, data?: unknown) => log('error', message, data),
  }
}
