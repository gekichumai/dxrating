import { NetImportError } from '../../../lib/functions/client'
import { Sentry } from '../../../lib/functions/sentry'

// Metrics and logs of maimai NET imports, the same on every route (the SSE and JSON functions and the oRPC API).
//
// - net_fetch.success (counter) per import that returned records: the success baseline, and what the per-region
//   "no successes" alert watches. net_fetch.duration / music_records / recent_records (distributions) as before.
// - net_fetch.failure (counter) per failed import, with `outcome`: a slug of our error code. error_code stays for old
//   queries, but Sentry scrubs its INVALID_CREDENTIALS value to [Filtered] (it contains "credentials"), so group by
//   outcome instead.
// - A warning log per failure with the step, NET's ERROR CODE and what SEGA's page said (pageSignals in client.ts).
//
// None of it holds a URL, an address or anything the person typed.

export type NetRoute = 'sse' | 'json' | 'api'

/** Our error codes as words Sentry's scrubber leaves alone */
const OUTCOMES: Record<string, string> = {
  NET_MAINTENANCE: 'maintenance',
  INVALID_CREDENTIALS: 'login_rejected',
  AIME_CARD_UNAVAILABLE: 'no_aime_card',
  TOKEN_ERROR: 'login_page_changed',
  UNKNOWN_ERROR: 'net_error_page',
  INTERNAL_ERROR: 'internal',
}

export const netOutcome = (error: unknown) =>
  error instanceof NetImportError ? (OUTCOMES[error.code] ?? 'other') : 'unexpected'

export function recordNetSuccess(
  region: string,
  route: NetRoute,
  result: { durationMs: number; recent: number; music: number },
) {
  const attributes = { region, route }
  Sentry.metrics.count('net_fetch.success', 1, { attributes })
  Sentry.metrics.distribution('net_fetch.duration', result.durationMs, { unit: 'millisecond', attributes })
  Sentry.metrics.distribution('net_fetch.music_records', result.music, { unit: 'none', attributes })
  Sentry.metrics.distribution('net_fetch.recent_records', result.recent, { unit: 'none', attributes })
}

export function recordNetFailure(region: string, route: NetRoute, error: unknown) {
  const net = error instanceof NetImportError ? error : undefined
  const outcome = netOutcome(error)
  Sentry.metrics.count('net_fetch.failure', 1, {
    attributes: {
      region,
      route,
      outcome,
      error_code: net?.code ?? 'unknown',
      step: net?.step ?? 'unknown',
      net_error_code: net?.netErrorCode ?? 'none',
    },
  })
  Sentry.logger.warn('maimai NET import failed', {
    region,
    route,
    outcome,
    step: net?.step ?? 'unknown',
    net_error_code: net?.netErrorCode ?? 'none',
    upstream_message: net?.upstreamMessage ?? 'none',
  })
}