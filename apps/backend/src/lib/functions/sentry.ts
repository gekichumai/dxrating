import * as Sentry from '@sentry/node'
import type { Scope } from '@sentry/node'

// Export types for use in other files
export type { Scope }

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
    sendDefaultPii: true,
    enableLogs: true,
    integrations: [
      // HTTP integration for tracking HTTP requests
      Sentry.httpIntegration(),
      // Send console.log, console.warn, and console.error calls as logs to Sentry
      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    ],
    // Performance monitoring
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    // Configure which errors to capture
    beforeSend(event, hint) {
      // Don't capture certain expected errors
      const error = hint.originalException
      if (error instanceof Error) {
        // Skip validation errors as they're user input issues, not bugs
        if (
          error.message.includes('Invalid parameters') ||
          error.message.includes('QQ parameter is required') ||
          error.message.includes('Friend code parameter is required')
        ) {
          return null
        }

        // Skip authentication errors as they're user credential issues
        if (error.message.includes('invalid credentials') || error.message.includes('Failed to fetch')) {
          return null
        }
      }

      return event
    },
    // Configure which transactions to capture
    beforeSendTransaction(event) {
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