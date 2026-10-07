import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as Sentry from '@sentry/react'
import { HOSTED_OBSERVABILITY_OPTOUT_KEY } from './privacySignals'
import {
  captureException,
  initSentry,
  resetSentryForTests,
  scrubAppRouteUrl,
  scrubSentryEvent,
} from './sentry'

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  init: vi.fn(),
}))

const DSN = 'https://public-key@o000000.ingest.us.sentry.io/000000'

describe('Sentry hosted error reporting', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
    resetSentryForTests()
    localStorage.clear()
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: undefined })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not initialize when no DSN is configured', () => {
    expect(initSentry()).toBe(false)
    expect(Sentry.init).not.toHaveBeenCalled()
  })

  it('initializes with privacy-preserving defaults when a DSN is configured', () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'production')

    expect(initSentry()).toBe(true)

    expect(Sentry.init).toHaveBeenCalledOnce()
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({
      dsn: DSN,
      environment: 'production',
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
      ignoreErrors: [expect.any(RegExp)],
    }))
  })

  it('is idempotent', () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)

    expect(initSentry()).toBe(true)
    expect(initSentry()).toBe(true)

    expect(Sentry.init).toHaveBeenCalledOnce()
  })

  it('respects the hosted observability opt-out', () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    localStorage.setItem(HOSTED_OBSERVABILITY_OPTOUT_KEY, 'true')

    expect(initSentry()).toBe(false)
    expect(Sentry.init).not.toHaveBeenCalled()
  })

  it('scrubs collection, workspace, view, query, and hash values from app URLs', () => {
    expect(scrubAppRouteUrl('https://app.c4hero.com/collection/Big%20Bank/ATM/Containers?token=abc#node')).toBe(
      'https://app.c4hero.com/collection/[collection]/[workspace]/[view]',
    )
    expect(scrubAppRouteUrl('https://app.c4hero.com/collection/Big%20Bank')).toBe(
      'https://app.c4hero.com/collection/[collection]',
    )
    expect(scrubAppRouteUrl('https://app.c4hero.com/')).toBe('https://app.c4hero.com/')
  })

  it('scrubs Sentry events before sending them', () => {
    const event = scrubSentryEvent({
      user: { id: 'user-1' },
      request: {
        url: 'https://app.c4hero.com/collection/Big%20Bank/ATM/Containers?token=abc#node',
        query_string: 'token=abc',
        cookies: 'sid=123',
        headers: { authorization: 'Bearer secret' },
        data: 'workspace text',
      },
      breadcrumbs: [
        {
          message: 'GET /api?token=abc',
          data: { workspace: 'Big Bank' },
        },
      ],
    })

    expect(event?.user).toBeUndefined()
    expect(event?.request).toMatchObject({
      url: 'https://app.c4hero.com/collection/[collection]/[workspace]/[view]',
      query_string: undefined,
      cookies: undefined,
      headers: undefined,
      data: undefined,
    })
    expect(event?.breadcrumbs?.[0]).toMatchObject({
      message: 'GET /api?token=[redacted]',
      data: undefined,
    })
  })

  it('captures exceptions with sanitized extra context', () => {
    const error = new Error('boom')

    captureException(error, {
      componentStack: 'at Widget',
      workspaceName: 'Big Bank',
      token: 'secret',
      nested: { unsafe: true },
    })

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      extra: {
        componentStack: 'at Widget',
      },
    })
  })
})
