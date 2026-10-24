import { getOpenAPIMeta } from '@orpc/openapi'
import { Context, Effect, Layer, Schedule } from 'effect'
import { Sentry } from '../lib/functions/sentry'

/**
 * Server-side usage accounting for the public API (miruku).
 *
 * Every request is classified by route template and caller. The classification
 * is attached to the existing evlog wide event, and an in-process rollup is
 * flushed to Sentry metrics once per minute: one counter per distinct
 * (route, status, caller) bucket instead of one item per request. Nothing is
 * sent to PostHog.
 */

export const API_CLIENT_HEADER = 'X-DXRating-Client'
export const API_USAGE_FLUSH_INTERVAL = '1 minute'
export const MAX_API_USAGE_BUCKETS = 500

const API_PREFIX = '/api/v1'
const UNTRACKED_PATHS = new Set(['/health', '/api/v1/monitoring/tunnel'])

export type UserAgentClass = 'dxrating_ios' | 'browser' | 'ai_agent' | 'bot' | 'cli' | 'script' | 'other' | 'none'

export interface ApiRequestClassification {
  readonly route: string
  readonly method: string
  readonly status: number
  readonly caller: string
  readonly userAgentClass: UserAgentClass
  readonly clientId: string
}

const OVERFLOW = 'overflow'

type ApiUsageBucketKey =
  | ApiRequestClassification
  | {
      readonly route: typeof OVERFLOW
      readonly method: typeof OVERFLOW
      readonly status: typeof OVERFLOW
      readonly caller: typeof OVERFLOW
      readonly userAgentClass: typeof OVERFLOW
      readonly clientId: typeof OVERFLOW
    }

/** Once the rollup is full, every new combination folds into this single bucket. */
const OVERFLOW_BUCKET_KEY = {
  route: OVERFLOW,
  method: OVERFLOW,
  status: OVERFLOW,
  caller: OVERFLOW,
  userAgentClass: OVERFLOW,
  clientId: OVERFLOW,
} as const satisfies ApiUsageBucketKey

export type ApiUsageBucket = ApiUsageBucketKey & {
  readonly count: number
  readonly errorCount: number
  readonly durationMsSum: number
  readonly durationMsMax: number
}

const AI_AGENT_PATTERN =
  /GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai|PerplexityBot|Perplexity-User|Google-Extended|CCBot|Bytespider|Amazonbot|meta-externalagent/i
const BOT_PATTERN =
  /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|monitor|uptime|pingdom|validator/i
const CLI_PATTERN = /^(curl|wget|httpie|xh)\//i
const SCRIPT_PATTERN =
  /python|aiohttp|httpx|node-fetch|undici|axios|\bgot\b|go-http-client|okhttp|java\/|apache-httpclient|ruby|php|guzzle|deno\/|bun\/|reqwest|dart|postman|insomnia|rest-client|powershell|^node$/i

export const classifyUserAgent = (userAgent: string | undefined): UserAgentClass => {
  const value = userAgent?.trim()
  if (!value) return 'none'
  // The native app uses URLSession's default agent: `dxrating-ios/<build> CFNetwork/... Darwin/...`.
  if (/^dxrating-ios\//i.test(value)) return 'dxrating_ios'
  if (AI_AGENT_PATTERN.test(value)) return 'ai_agent'
  if (BOT_PATTERN.test(value)) return 'bot'
  if (CLI_PATTERN.test(value)) return 'cli'
  if (SCRIPT_PATTERN.test(value)) return 'script'
  if (/^Mozilla\/5\.0/.test(value)) return 'browser'
  return 'other'
}

const parseHostname = (value: string | undefined) => {
  if (!value || value === 'null') return undefined
  try {
    return new URL(value).hostname.toLowerCase() || undefined
  } catch {
    return undefined
  }
}

/**
 * Identifies the calling site from Origin, falling back to Referer. Only the
 * hostname is kept so paths and query strings never reach telemetry.
 */
export const classifyCaller = (origin: string | undefined, referer: string | undefined) => {
  const hostname = parseHostname(origin) ?? parseHostname(referer)
  if (!hostname) return 'none'
  if (hostname === 'dxrating.net' || hostname === 'www.dxrating.net') return 'dxrating_web'
  if (hostname.endsWith('.dxrating.pages.dev') || hostname.endsWith('.galvin.workers.dev')) return 'dxrating_preview'
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return 'localhost'
  return hostname.slice(0, 100)
}

/** Optional self-reported client identifier, e.g. `X-DXRating-Client: mai-tools/2.1`. */
export const readClientId = (value: string | undefined) => {
  const clientId = value?.trim().toLowerCase()
  if (!clientId) return 'none'
  return /^[a-z0-9][a-z0-9._@/-]{0,63}$/.test(clientId) ? clientId : 'invalid'
}

interface RouteMatcher {
  readonly method: string
  readonly template: string
  readonly pattern: RegExp
  readonly parameterCount: number
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const collectRouteMatchers = (router: unknown, matchers: RouteMatcher[] = []) => {
  if (typeof router !== 'object' || router === null) return matchers
  if ('~orpc' in router) {
    const meta = getOpenAPIMeta(router as Parameters<typeof getOpenAPIMeta>[0])
    if (meta?.path) {
      const template = `${API_PREFIX}${meta.path}`
      const segments = template.split(/(\{[^}]+\})/)
      matchers.push({
        method: meta.method ?? 'POST',
        template,
        pattern: new RegExp(`^${segments.map((s) => (s.startsWith('{') ? '[^/]+' : escapeRegExp(s))).join('')}$`),
        parameterCount: segments.filter((s) => s.startsWith('{')).length,
      })
    }
    return matchers
  }
  for (const child of Object.values(router)) collectRouteMatchers(child, matchers)
  return matchers
}

/**
 * Resolves request paths to bounded route templates. oRPC procedures are all
 * mounted behind one `/api/v1/*` Hono route, so their templates come from the
 * contract; other routes use the Hono route pattern.
 */
export const createRouteResolver = (contract: unknown) => {
  const matchers = collectRouteMatchers(contract).sort((a, b) => a.parameterCount - b.parameterCount)

  return (method: string, path: string, honoRoute: string | undefined) => {
    if (path === API_PREFIX || path.startsWith(`${API_PREFIX}/`)) {
      const lookupMethod = method === 'HEAD' ? 'GET' : method
      const matched =
        matchers.find((m) => m.method === lookupMethod && m.pattern.test(path)) ??
        matchers.find((m) => m.pattern.test(path))
      if (matched) return matched.template
    }
    if (!honoRoute || honoRoute === '*' || honoRoute === '/*' || honoRoute === `${API_PREFIX}/*`) return 'unmatched'
    return honoRoute
  }
}

export const isTrackedApiPath = (path: string) => !UNTRACKED_PATHS.has(path)

/**
 * Mutable per-process aggregate; drained once per flush interval. Holds at
 * most `maxBuckets` distinct combinations plus one overflow bucket, which
 * keeps request, error and timing totals for everything that did not fit.
 */
const OVERFLOW_KEY = JSON.stringify(OVERFLOW_BUCKET_KEY)

export const createApiUsageRollup = (maxBuckets = MAX_API_USAGE_BUCKETS) => {
  let buckets = new Map<string, ApiUsageBucket>()

  const record = (request: ApiRequestClassification, durationMs: number) => {
    let classification: ApiUsageBucketKey = request
    let key = JSON.stringify(classification)
    if (!buckets.has(key) && buckets.size >= maxBuckets) {
      // Cap cardinality (e.g. arbitrary third-party hostnames or client ids).
      classification = OVERFLOW_BUCKET_KEY
      key = OVERFLOW_KEY
    }
    const previous = buckets.get(key)
    const isError = request.status >= 500
    buckets.set(key, {
      ...classification,
      count: (previous?.count ?? 0) + 1,
      errorCount: (previous?.errorCount ?? 0) + (isError ? 1 : 0),
      durationMsSum: (previous?.durationMsSum ?? 0) + durationMs,
      durationMsMax: Math.max(previous?.durationMsMax ?? 0, durationMs),
    })
  }

  const drain = (): ApiUsageBucket[] => {
    const drained = [...buckets.values()]
    buckets = new Map()
    return drained
  }

  return { record, drain }
}

export const emitApiUsageBuckets = (buckets: readonly ApiUsageBucket[]) => {
  for (const bucket of buckets) {
    const attributes = {
      route: bucket.route,
      method: bucket.method,
      status: String(bucket.status),
      status_class: bucket.status === OVERFLOW ? OVERFLOW : `${Math.floor(bucket.status / 100)}xx`,
      caller: bucket.caller,
      ua_class: bucket.userAgentClass,
      client_id: bucket.clientId,
    }
    Sentry.metrics.count('api.requests', bucket.count, { attributes })
    if (bucket.errorCount > 0) Sentry.metrics.count('api.requests.server_error', bucket.errorCount, { attributes })
    Sentry.metrics.count('api.request.duration_ms_sum', Math.round(bucket.durationMsSum), {
      unit: 'millisecond',
      attributes,
    })
    Sentry.metrics.gauge('api.request.duration_ms_max', Math.round(bucket.durationMsMax), {
      unit: 'millisecond',
      attributes,
    })
  }
}

export class ApiUsage extends Context.Service<
  ApiUsage,
  {
    readonly record: (request: ApiRequestClassification, durationMs: number) => Effect.Effect<void>
  }
>()('dxrating/ApiUsage') {}

export const makeApiUsageLayer = (emit: (buckets: readonly ApiUsageBucket[]) => void = emitApiUsageBuckets) =>
  Layer.effect(
    ApiUsage,
    Effect.gen(function* () {
      const rollup = createApiUsageRollup()
      const flush = Effect.sync(() => {
        const buckets = rollup.drain()
        if (buckets.length > 0) emit(buckets)
      })

      yield* Effect.addFinalizer(() => flush)
      yield* Effect.forkScoped(Effect.repeat(flush, Schedule.spaced(API_USAGE_FLUSH_INTERVAL)))

      return {
        record: (request, durationMs) => Effect.sync(() => rollup.record(request, durationMs)),
      }
    }),
  )

export const ApiUsageLive = makeApiUsageLayer()