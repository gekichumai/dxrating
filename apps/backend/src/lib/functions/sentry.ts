import * as Sentry from '@sentry/node'
import type { Scope } from '@sentry/node'
import { COMMON_ERROR_STATUS_MAP, ORPCError } from '@orpc/server'
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
        ignoreIncomingRequestBody: (url) => isCredentialPath(pathOf(url)),
      }),
      // Send console.log, console.warn, and console.error calls as logs to Sentry
      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    ],
    // Performance monitoring
    // Every MCP request is traced (a span per MCP message); the rest at 10%
    tracesSampler: ({ name, inheritOrSampleWith }) =>
      /\/mcp(?:\?|$|\s)/.test(name) ? 1.0 : inheritOrSampleWith(environment === 'production' ? 0.1 : 1.0),
    // Configure which errors to capture; whatever is sent is scrubbed of credentials
    beforeSend(event, hint) {
      return shouldCaptureSentryError(hint.originalException) ? scrubSentryEvent(event) : null
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
      return scrubSentryEvent(event)
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