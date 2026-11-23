import * as Sentry from '@sentry/node'
import type { Scope } from '@sentry/node'
import { COMMON_ERROR_STATUS_MAP, ORPCError } from '@orpc/server'
import { databaseErrorTags } from '../../db/errors'
import { NetImportError } from './client'
import {
  isCredentialPath,
  pathOf,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryLog,
} from '../credential-hygiene'

// Export types for use in other files
export type { Scope }

/**
 * Sentry tags of a maimai NET import failure: our code, the request that failed and the ERROR CODE NET showed. None
 * holds a URL, credential or anything of the page beyond its error code.
 */
export function netErrorTags(error: unknown): Record<string, string> {
  if (!(error instanceof NetImportError)) return {}
  return {
    'net.code': error.code,
    ...(error.step ? { 'net.step': error.step } : {}),
    ...(error.netErrorCode ? { 'net.error_code': error.netErrorCode } : {}),
  }
}

export function shouldCaptureSentryError(error: unknown) {
  if (error instanceof ORPCError) {
    const status = COMMON_ERROR_STATUS_MAP[error.code as keyof typeof COMMON_ERROR_STATUS_MAP] ?? 500
    if (status >= 400 && status < 500) return false
  }

  if (
    error instanceof NetImportError &&
    ['INVALID_CREDENTIALS', 'NET_MAINTENANCE', 'AIME_CARD_UNAVAILABLE'].includes(error.code)
  ) {
    return false
  }

  if (error instanceof Error) {
    if (
      error.message.includes('Invalid parameters') ||
      error.message.includes('QQ parameter is required') ||
      error.message.includes('Friend code parameter is required')
    ) {
      return false
    }

    if (error.message.includes('invalid credentials') || error.message.includes('Failed to fetch')) {
      return false
    }
  }

  return true
}

/**
 * Routes whose request body carries credentials. `sendDefaultPii` lets the HTTP integration attach request bodies to
 * events and transactions; for these routes the body never leaves the process, whatever Sentry's server-side
 * scrubbing would catch. Entries ending in `/` match every path below them.
 */
export const CREDENTIAL_BODY_ROUTES = [
  // LXNS OAuth code and state
  '/api/v1/io/import/lxns/complete',
  // SEGA ID and password (maimai.fetchRecords, and the NET record functions)
  '/api/v1/io/import/maimai-net',
  '/functions/fetch-net-records/',
  // Better Auth: sign-in and sign-up passwords, password changes and resets, OAuth and passkey payloads
  '/api/auth/',
]

const routePath = (value: string | undefined) => {
  if (!value) return undefined
  // Transaction names look like `POST /api/v1/...`
  const target = value.includes(' ') ? value.slice(value.indexOf(' ') + 1) : value
  try {
    return new URL(target, 'http://localhost').pathname.replace(/\/+$/, '')
  } catch {
    return undefined
  }
}

const isCredentialRoute = (value: string | undefined) => {
  const path = routePath(value)
  return (
    path !== undefined &&
    CREDENTIAL_BODY_ROUTES.some((route) => (route.endsWith('/') ? `${path}/`.startsWith(route) : path === route))
  )
}

function withoutBody<T extends Record<string, unknown>>(data: T | undefined): T | undefined {
  if (!data) return data
  const copy = { ...data }
  for (const key of Object.keys(copy)) {
    if (/body|payload|request\.data/i.test(key)) delete copy[key]
  }
  return copy
}

type ScrubbableEvent = Pick<Sentry.Event, 'request' | 'transaction' | 'contexts' | 'spans' | 'breadcrumbs'>

/** Drops request bodies (and body-like span or breadcrumb attributes) of `CREDENTIAL_BODY_ROUTES` from an event. */
export function scrubCredentialBodies<E extends ScrubbableEvent>(event: E): E {
  const traceData = event.contexts?.trace?.data as Record<string, unknown> | undefined
  const sensitive =
    isCredentialRoute(event.request?.url) ||
    isCredentialRoute(event.transaction) ||
    isCredentialRoute(typeof traceData?.['url.path'] === 'string' ? traceData['url.path'] : undefined) ||
    isCredentialRoute(typeof traceData?.['http.target'] === 'string' ? traceData['http.target'] : undefined)
  if (!sensitive) return event
  const scrubbed = { ...event }
  if (scrubbed.request) {
    const { data: _data, ...request } = scrubbed.request
    scrubbed.request = request
  }
  if (scrubbed.contexts?.trace) {
    scrubbed.contexts = {
      ...scrubbed.contexts,
      trace: { ...scrubbed.contexts.trace, data: withoutBody(traceData) },
    } as typeof scrubbed.contexts
  }
  if (scrubbed.spans) scrubbed.spans = scrubbed.spans.map((span) => ({ ...span, data: withoutBody(span.data) ?? {} }))
  if (scrubbed.breadcrumbs) {
    scrubbed.breadcrumbs = scrubbed.breadcrumbs.map((breadcrumb) => ({
      ...breadcrumb,
      data: withoutBody(breadcrumb.data),
    }))
  }
  return scrubbed
}

/** The backend's Sentry options; `initSentry` uses them in production, tests with an in-memory transport. */
export function sentryOptions({
  dsn,
  environment,
  release,
}: {
  dsn: string
  environment: string
  release: string | undefined
}): Sentry.NodeOptions {
  return buildSentryOptions(environment, { dsn, release })
}

/**
 * The Sentry options of the backend. Credential hygiene (design §7.2): request bodies of the credential routes are
 * never attached (`ignoreIncomingRequestBody`), and every event, breadcrumb and log is scrubbed of credential keys
 * (`password`, tokens, cookies, Authorization, the SEGA ID on the NET routes) and of the credentials of running NET
 * requests before it leaves the process.
 */
export function buildSentryOptions(
  environment: string,
  overrides: Partial<Sentry.NodeOptions> = {},
): Sentry.NodeOptions {
  return {
    environment,
    sendDefaultPii: true,
    enableLogs: true,
    integrations: [
      // HTTP integration for tracking HTTP requests; never attach the body of a credential route
      Sentry.httpIntegration({
        ignoreIncomingRequestBody: (url) => isCredentialPath(pathOf(url)) || isCredentialRoute(url),
      }),
      // Send console.log, console.warn, and console.error calls as logs to Sentry
      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    ],
    // Performance monitoring
    // Every MCP request is traced (a span per MCP message); the rest at 10%
    tracesSampler: ({ name, inheritOrSampleWith }) =>
      /\/mcp(?:\?|$|\s)/.test(name) ? 1.0 : inheritOrSampleWith(environment === 'production' ? 0.1 : 1.0),
    // Configure which errors to capture; whatever is sent is scrubbed of credentials
    // A database failure also names its operation and SQL error reason, whichever path captured it
    beforeSend(event, hint) {
      if (!shouldCaptureSentryError(hint.originalException)) return null
      const tags = databaseErrorTags(hint.originalException)
      if (Object.keys(tags).length > 0) event.tags = { ...event.tags, ...tags }
      return scrubCredentialBodies(scrubSentryEvent(event))
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubSentryBreadcrumb(breadcrumb)
    },
    beforeSendLog(log) {
      return scrubSentryLog(log)
    },
    // Configure which transactions to capture
    beforeSendTransaction(event) {
      // Filter out health check transactions
      if (event.transaction === 'GET /') {
        return null
      }
      return scrubCredentialBodies(scrubSentryEvent(event))
    },
    ...overrides,
  }
}

// Initialize Sentry configuration
export function initSentry() {
  const environment = process.env.NODE_ENV || 'development'

  if (environment !== 'production') {
    console.log(`Sentry disabled in ${environment} environment`)
    return
  }

  const dsn =
    process.env.SENTRY_DSN ||
    'https://e5561152e48961e6e43918588a750ebb@o4506648698683392.ingest.us.sentry.io/4511009913765888'
  const release =
    process.env.SENTRY_RELEASE ||
    (process.env.GIT_COMMIT && process.env.GIT_COMMIT !== 'unknown'
      ? `dxrating-backend@${process.env.GIT_COMMIT}`
      : undefined)

  Sentry.init(buildSentryOptions(environment, { dsn, release }))

  console.log(`Sentry initialized with environment: ${environment}, release: ${release}`)
}

// Export Sentry for direct access
export { Sentry }