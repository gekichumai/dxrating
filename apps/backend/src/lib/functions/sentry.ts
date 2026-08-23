import * as Sentry from '@sentry/node'
import type { ErrorEvent, Event, Scope } from '@sentry/node'
import { ORPCError } from '@orpc/server'
import { NetImportError } from './client.js'

// Export types for use in other files
export type { Scope }

const ADMIN_ERROR_MESSAGE = 'Administrator request failed'
const ADMIN_SAFE_TAGS = ['orpc.procedure', 'orpc.surface', 'requestId'] as const

export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  stackFrameVariables: false,
  frameContextLines: 0,
}

export function scrubAdminSentryEvent(event: ErrorEvent): ErrorEvent
export function scrubAdminSentryEvent(event: Event): Event
export function scrubAdminSentryEvent(event: Event): Event {
  if (event.tags?.['orpc.surface'] !== 'admin') return event

  const tags = Object.fromEntries(
    ADMIN_SAFE_TAGS.flatMap((key) => {
      const value = event.tags?.[key]
      return typeof value === 'string' ? [[key, value]] : []
    }),
  )

  // Administrator events use an allowlist instead of trying to enumerate all
  // PII-bearing Sentry fields. In particular this discards the active HTTP
  // request, cookies, user, breadcrumbs, extras, and integration contexts.
  return {
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    message: ADMIN_ERROR_MESSAGE,
    release: event.release,
    environment: event.environment,
    tags,
  }
}

export function isAdminSentryRequest(name: string | undefined, requestUrl?: string) {
  if (name && (name.includes('/api/admin/') || name.endsWith('/api/admin'))) return true
  if (!requestUrl) return false

  try {
    const pathname = new URL(requestUrl, 'https://dxrating.invalid').pathname
    return pathname === '/api/admin' || pathname.startsWith('/api/admin/')
  } catch {
    return false
  }
}

export function isAdminSentryTransaction(event: Event) {
  if (event.tags?.['orpc.surface'] === 'admin') return true
  return isAdminSentryRequest(event.transaction, event.request?.url)
}

export function shouldCaptureSentryError(error: unknown) {
  if (error instanceof ORPCError && error.status >= 400 && error.status < 500) {
    return false
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
  const release = process.env.SENTRY_RELEASE || 'unknown'

  Sentry.init({
    dsn,
    environment,
    release,
    sendDefaultPii: false,
    dataCollection: SENTRY_DATA_COLLECTION,
    enableLogs: true,
    integrations: [
      // HTTP integration for tracking HTTP requests
      Sentry.httpIntegration(),
      // Send console.log, console.warn, and console.error calls as logs to Sentry
      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    ],
    // Performance monitoring
    tracesSampler({ name, normalizedRequest }) {
      if (isAdminSentryRequest(name, normalizedRequest?.url)) return 0
      return environment === 'production' ? 0.1 : 1.0
    },
    // Configure which errors to capture
    beforeSend(event, hint) {
      return shouldCaptureSentryError(hint.originalException) ? scrubAdminSentryEvent(event) : null
    },
    // Configure which transactions to capture
    beforeSendTransaction(event) {
      if (isAdminSentryTransaction(event)) return null
      // Filter out health check transactions
      if (event.transaction === 'GET /') {
        return null
      }
      return event
    },
  })

  console.log(`Sentry initialized with environment: ${environment}, release: ${release}`)
}

// Export Sentry for direct access
export { Sentry }