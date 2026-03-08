import * as Sentry from '@sentry/node'
import type { Scope } from '@sentry/node'

// Export types for use in other files
export type { Scope }

// Initialize Sentry configuration
export function initSentry() {
  const dsn = process.env.SENTRY_DSN
  const environment = process.env.NODE_ENV || 'development'
  const release = process.env.SENTRY_RELEASE || 'unknown'

  if (!dsn) {
    console.warn('SENTRY_DSN not configured, Sentry will not be initialized')
    return
  }

  Sentry.init({
    dsn,
    environment,
    release,
    integrations: [
      // HTTP integration for tracking HTTP requests
      Sentry.httpIntegration(),
    ],
    // Performance monitoring
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    // Configure which errors to capture
    beforeSend(event, hint) {
      // Don't capture certain expected errors
      const error = hint.originalException
      if (error instanceof Error) {
        // Skip validation errors as they're user input issues, not bugs
        if (error.message.includes('Invalid parameters') || 
            error.message.includes('QQ parameter is required') ||
            error.message.includes('Friend code parameter is required')) {
          return null
        }
        
        // Skip authentication errors as they're user credential issues
        if (error.message.includes('invalid credentials') ||
            error.message.includes('Failed to fetch')) {
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
