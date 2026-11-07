import type * as SentrySdk from '@sentry/tanstackstart-react'

/**
 * The app's handle on Sentry metrics and logs. Nothing here imports the SDK at runtime: in the browser the SDK loads
 * after hydration (src/setup/error-reporting-loader.ts), so an ad blocker that blocks it can't stop the page from
 * hydrating. Calls made before it loads wait in a short queue and are sent once it does; if it never loads, they're
 * dropped. On the server, server.ts attaches the SDK at startup.
 */
export type TelemetrySdk = Pick<typeof SentrySdk, 'metrics' | 'logger' | 'captureException'>

type Call = (sdk: TelemetrySdk) => void

const MAX_QUEUED_CALLS = 200

let sdk: TelemetrySdk | undefined
let queue: Call[] | undefined = []

function run(call: Call) {
  if (sdk) {
    call(sdk)
  } else if (queue && queue.length < MAX_QUEUED_CALLS) {
    queue.push(call)
  }
}

/** Sends the queued calls to the loaded SDK, and every later call straight to it */
export function attachTelemetrySdk(loaded: TelemetrySdk) {
  sdk = loaded
  const pending = queue ?? []
  queue = undefined
  for (const call of pending) {
    try {
      call(loaded)
    } catch {
      // Telemetry must never break the app
    }
  }
}

/** Sentry won't load (blocked, offline, or off in this build): stop queueing */
export function discardTelemetryQueue() {
  if (!sdk) queue = undefined
}

type Metrics = TelemetrySdk['metrics']
// The SDK's log methods are overloaded (plain message or message template); the app only passes a plain message
type LogAttributes = Record<string, unknown>

export const metrics = {
  count: (...args: Parameters<Metrics['count']>) => run((s) => s.metrics.count(...args)),
  distribution: (...args: Parameters<Metrics['distribution']>) => run((s) => s.metrics.distribution(...args)),
  gauge: (...args: Parameters<Metrics['gauge']>) => run((s) => s.metrics.gauge(...args)),
}

export const logger = {
  info: (message: string, attributes?: LogAttributes) => run((s) => s.logger?.info?.(message, attributes)),
  warn: (message: string, attributes?: LogAttributes) => run((s) => s.logger?.warn?.(message, attributes)),
  error: (message: string, attributes?: LogAttributes) => run((s) => s.logger?.error?.(message, attributes)),
}

export function captureException(...args: Parameters<TelemetrySdk['captureException']>) {
  run((s) => s.captureException(...args))
}

/** Test-only: back to the initial, not-yet-loaded state */
export function resetTelemetryForTests() {
  sdk = undefined
  queue = []
}