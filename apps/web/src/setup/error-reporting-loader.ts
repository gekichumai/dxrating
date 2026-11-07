import type { AnyRouter } from '@tanstack/react-router'
import { attachTelemetrySdk, discardTelemetryQueue } from '@/lib/telemetry'

/**
 * Loads Sentry in the browser once the page has hydrated. Ad-block lists that block every URL containing "sentry" used
 * to block the SDK's chunk, and since the router imported it statically, the page never hydrated. Now the SDK is a
 * lazy chunk: if it fails to load, the app works without error reporting.
 *
 * Errors thrown before the SDK loads (including React hydration errors, which React reports on window) are kept and
 * sent once it does. Metrics and logs queue in src/lib/telemetry.ts the same way.
 */

const MAX_EARLY_ERRORS = 20
// Long enough to stay off the hydration path, short enough to catch most early interactions (INP)
const IDLE_TIMEOUT_MS = 3000
const NO_IDLE_CALLBACK_DELAY_MS = 1000

let scheduled = false
let earlyErrors: ReturnType<typeof bufferEarlyErrors> | undefined

/**
 * Starts keeping uncaught errors for Sentry. Called first thing in the client entry (src/client.tsx): the router, which
 * schedules the SDK, is created later, after hydration has started.
 */
export function startEarlyErrorBuffer() {
  if (earlyErrors || typeof window === 'undefined' || !import.meta.env.VITE_SENTRY_RELEASE) return
  earlyErrors = bufferEarlyErrors()
}

export function scheduleErrorReporting(router: AnyRouter) {
  if (scheduled || typeof window === 'undefined') return
  scheduled = true

  // Only CI release and preview builds have a release; local builds never initialise Sentry
  if (!import.meta.env.VITE_SENTRY_RELEASE) {
    discardTelemetryQueue()
    return
  }

  startEarlyErrorBuffer()
  const buffer = earlyErrors
  // The router is created before any client-side navigation, so this is the document's own URL
  const documentLocation = { pathname: window.location.pathname, search: window.location.search }

  const load = () => {
    import('./error-reporting')
      .then(({ initErrorReporting }) => {
        const pending = buffer?.stop() ?? []
        const sdk = initErrorReporting(router, documentLocation)
        attachTelemetrySdk(sdk)
        for (const error of pending) {
          sdk.captureException(error, { mechanism: { type: 'auto.browser.early_error_buffer', handled: false } })
        }
      })
      .catch(() => {
        // Blocked or offline: keep working without Sentry
        buffer?.stop()
        discardTelemetryQueue()
      })
  }

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(load, { timeout: IDLE_TIMEOUT_MS })
  } else {
    setTimeout(load, NO_IDLE_CALLBACK_DELAY_MS)
  }
}

function bufferEarlyErrors() {
  const errors: unknown[] = []
  const keep = (error: unknown) => {
    if (errors.length < MAX_EARLY_ERRORS) errors.push(error)
  }
  const onError = (event: ErrorEvent) => keep(event.error ?? event.message)
  const onRejection = (event: PromiseRejectionEvent) => keep(event.reason)

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)

  return {
    stop() {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      return errors.splice(0)
    },
  }
}