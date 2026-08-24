import { randomUUID } from 'node:crypto'
import { z } from 'zod'

export const CHART_REPORT_TURNSTILE_ACTION = 'chart-report' as const
export const CHART_REPORT_TURNSTILE_SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify' as const
export const CHART_REPORT_TURNSTILE_TOKEN_MAX_LENGTH = 2_048
export const CHART_REPORT_TURNSTILE_TOKEN_MAX_AGE_MS = 300_000
export const CHART_REPORT_TURNSTILE_FUTURE_SKEW_MS = 30_000
export const CHART_REPORT_TURNSTILE_TIMEOUT_MS = 5_000
export const CHART_REPORT_TURNSTILE_MAX_ATTEMPTS = 2

const PROVIDER_RESPONSE_MAX_BYTES = 16 * 1_024
const MAX_CONFIGURED_ATTEMPTS = 3
const MAX_CONFIGURED_TIMEOUT_MS = 30_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const SiteverifyTimestampSchema = z.iso.datetime({ offset: true })
const SiteverifySuccessSchema = z
  .object({
    success: z.literal(true),
    challenge_ts: SiteverifyTimestampSchema,
    hostname: z.string().min(1).max(253),
    action: z.string().min(1).max(32),
    'error-codes': z.array(z.string().min(1).max(128)).max(32).optional(),
  })
  .passthrough()
const SiteverifyRejectionSchema = z
  .object({
    success: z.literal(false),
    challenge_ts: SiteverifyTimestampSchema.optional(),
    hostname: z.string().min(1).max(253).optional(),
    action: z.string().min(1).max(32).optional(),
    'error-codes': z.array(z.string().min(1).max(128)).max(32).optional(),
  })
  .passthrough()
const SiteverifyResponseSchema = z.discriminatedUnion('success', [SiteverifySuccessSchema, SiteverifyRejectionSchema])

export type ChartReportTurnstileConfiguration = {
  readonly secretKey: string | undefined
  readonly allowedHostnames: readonly string[]
}

export type ChartReportTurnstileVerificationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly category: 'REJECTED' | 'UNAVAILABLE' }

export type ChartReportTurnstileVerifier = {
  verify(token: unknown): Promise<ChartReportTurnstileVerificationResult>
}

type FetchImplementation = typeof fetch

type ChartReportTurnstileVerifierOptions = {
  readonly fetchImplementation?: FetchImplementation
  readonly generateIdempotencyKey?: () => string
  readonly nowMilliseconds?: () => number
  readonly timeoutMilliseconds?: number
  readonly maximumAttempts?: number
}

type AttemptOutcome =
  | { readonly kind: 'complete'; readonly result: ChartReportTurnstileVerificationResult }
  | { readonly kind: 'retryable' }

const rejected = (): ChartReportTurnstileVerificationResult => ({ ok: false, category: 'REJECTED' })
const unavailable = (): ChartReportTurnstileVerificationResult => ({ ok: false, category: 'UNAVAILABLE' })
const retryable = (): AttemptOutcome => ({ kind: 'retryable' })
const complete = (result: ChartReportTurnstileVerificationResult): AttemptOutcome => ({ kind: 'complete', result })

const isSafeToken = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= CHART_REPORT_TURNSTILE_TOKEN_MAX_LENGTH &&
  value === value.trim() &&
  value.isWellFormed() &&
  !value.includes('\0')

const hasSafeSecretConfiguration = (secretKey: string | undefined): secretKey is string =>
  typeof secretKey === 'string' && secretKey.length > 0 && secretKey.length <= 4_096 && secretKey.isWellFormed()

const isSafeHostname = (hostname: string): boolean => {
  if (hostname.length === 0 || hostname.length > 253 || hostname !== hostname.toLowerCase()) return false
  try {
    const parsed = new URL(`https://${hostname}/`)
    return parsed.hostname === hostname && parsed.port === '' && parsed.pathname === '/'
  } catch {
    return false
  }
}

const readProviderJson = async (
  response: Response,
): Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false }> => {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > PROVIDER_RESPONSE_MAX_BYTES)) {
    return { ok: false }
  }

  let body: string
  try {
    body = await response.text()
  } catch {
    return { ok: false }
  }
  if (Buffer.byteLength(body, 'utf8') > PROVIDER_RESPONSE_MAX_BYTES) return { ok: false }

  try {
    return { ok: true, value: JSON.parse(body) as unknown }
  } catch {
    return { ok: false }
  }
}

const runWithTimeout = async (
  timeoutMilliseconds: number,
  operation: (signal: AbortSignal) => Promise<AttemptOutcome>,
): Promise<AttemptOutcome> => {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<AttemptOutcome>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort()
      resolve(retryable())
    }, timeoutMilliseconds)
  })

  try {
    return await Promise.race([operation(controller.signal).catch(retryable), timedOut])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export const createCloudflareChartReportTurnstileVerifier = (
  configuration: ChartReportTurnstileConfiguration,
  options: ChartReportTurnstileVerifierOptions = {},
): ChartReportTurnstileVerifier => {
  const fetchImplementation = options.fetchImplementation ?? fetch
  const generateIdempotencyKey = options.generateIdempotencyKey ?? randomUUID
  const nowMilliseconds = options.nowMilliseconds ?? Date.now
  const timeoutMilliseconds = options.timeoutMilliseconds ?? CHART_REPORT_TURNSTILE_TIMEOUT_MS
  const maximumAttempts = options.maximumAttempts ?? CHART_REPORT_TURNSTILE_MAX_ATTEMPTS
  const allowedHostnames = new Set(configuration.allowedHostnames)
  const verifierOptionsAreValid =
    Number.isInteger(timeoutMilliseconds) &&
    timeoutMilliseconds > 0 &&
    timeoutMilliseconds <= MAX_CONFIGURED_TIMEOUT_MS &&
    Number.isInteger(maximumAttempts) &&
    maximumAttempts > 0 &&
    maximumAttempts <= MAX_CONFIGURED_ATTEMPTS
  const hostnameConfigurationIsValid =
    allowedHostnames.size > 0 &&
    allowedHostnames.size === configuration.allowedHostnames.length &&
    [...allowedHostnames].every(isSafeHostname)

  return {
    async verify(token) {
      if (!isSafeToken(token)) return rejected()
      if (
        !hasSafeSecretConfiguration(configuration.secretKey) ||
        !hostnameConfigurationIsValid ||
        !verifierOptionsAreValid
      ) {
        return unavailable()
      }

      let idempotencyKey: string
      try {
        idempotencyKey = generateIdempotencyKey()
      } catch {
        return unavailable()
      }
      if (!UUID_PATTERN.test(idempotencyKey)) return unavailable()

      const encodedRequest = new URLSearchParams({
        secret: configuration.secretKey,
        response: token,
        idempotency_key: idempotencyKey,
      }).toString()

      const attempt = async (signal: AbortSignal): Promise<AttemptOutcome> => {
        let response: Response
        try {
          response = await fetchImplementation(CHART_REPORT_TURNSTILE_SITEVERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: encodedRequest,
            cache: 'no-store',
            credentials: 'omit',
            redirect: 'error',
            signal,
          })
        } catch {
          return retryable()
        }

        if (response.status >= 500 && response.status <= 599) return retryable()
        if (!response.ok) return complete(unavailable())

        const providerJson = await readProviderJson(response)
        if (!providerJson.ok) return complete(unavailable())
        const parsed = SiteverifyResponseSchema.safeParse(providerJson.value)
        if (!parsed.success) return complete(unavailable())
        if (!parsed.data.success) return complete(rejected())

        const challengeTimestamp = Date.parse(parsed.data.challenge_ts)
        const now = nowMilliseconds()
        if (!Number.isFinite(challengeTimestamp) || !Number.isFinite(now)) return complete(unavailable())
        const age = now - challengeTimestamp
        if (
          parsed.data.action !== CHART_REPORT_TURNSTILE_ACTION ||
          !allowedHostnames.has(parsed.data.hostname) ||
          age > CHART_REPORT_TURNSTILE_TOKEN_MAX_AGE_MS ||
          age < -CHART_REPORT_TURNSTILE_FUTURE_SKEW_MS
        ) {
          return complete(rejected())
        }

        return complete({ ok: true })
      }

      for (let attemptNumber = 1; attemptNumber <= maximumAttempts; attemptNumber += 1) {
        const outcome = await runWithTimeout(timeoutMilliseconds, attempt)
        if (outcome.kind === 'complete') return outcome.result
      }
      return unavailable()
    },
  }
}