import { createHmac, randomBytes } from 'node:crypto'
import { isIP } from 'node:net'
import { Context, Effect, Layer } from 'effect'
import { classifyUserAgent } from '../api-usage'
import { boundedToolName, classifyMcpClient, truncateBytes } from './telemetry'

/**
 * Product analytics of the MCP endpoint, sent to PostHog (project 65078): one event per JSON-RPC message of a request,
 * `mcp_initialize`, `mcp_tools_list` and `mcp_tool_called`.
 *
 * What an event holds: the method or tool, a whitelist of its arguments (free text such as the search query cut to 64
 * characters with email addresses and runs of 6+ digits removed; enum-like arguments such as server or difficulty;
 * numbers such as limit; of calculate_best50 only how many scores were given, never the scores), the size of the
 * result, the duration and outcome, the client (clientInfo, User-Agent class), the `via` of the URL, the country of
 * CF-IPCountry (and CF-IPCity / CF-Region when Cloudflare sends them, which it does not now).
 *
 * What it never holds: an IP address (no `$ip`, `$geoip_disable` so PostHog does not look up the server's address),
 * headers other than the User-Agent class, tool results, scores. Events make no person profile
 * (`$process_person_profile: false`). The distinct_id groups the calls of one client for a day only:
 *
 *   salt        = HMAC-SHA256(MCP_ANALYTICS_SECRET, "mcp-analytics:" + UTC date YYYY-MM-DD)
 *   distinct_id = HMAC-SHA256(salt, IP prefix (/24 of IPv4, /48 of IPv6) + "\n" + User-Agent + "\n" + client name)
 *
 * so it changes every UTC day and cannot be turned back into an address without the secret. Without
 * MCP_ANALYTICS_SECRET a random secret of the process is used: ids then also change when the server restarts.
 *
 * Events are queued and sent in batches in the background; the request never waits for PostHog, and a failure or a
 * timeout of PostHog only drops events.
 */

/** The project API key of PostHog project 65078: public, the web app ships it to every browser */
export const POSTHOG_PUBLIC_PROJECT_KEY = 'phc_Hw7FM2D1vSwummp0D3O13Z6biV6udw5bKIcq4BJQxH7'
export const POSTHOG_DEFAULT_HOST = 'https://us.i.posthog.com'

const FREE_TEXT_ARGS = ['query', 'song'] as const
const ENUM_ARGS = ['type', 'difficulty', 'server', 'lang', 'version', 'combo', 'since'] as const
const NUMBER_ARGS = ['limit', 'days', 'internal_level', 'target_rating', 'suggestions'] as const
export const MAX_FREE_TEXT_CHARS = 64
const MAX_ENUM_CHARS = 32
const MAX_CLIENT_BYTES = 128

type JsonObject = Record<string, unknown>
const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g
const LONG_DIGITS = /\d{6,}/g

/** Free text for analytics: emails and runs of 6+ digits (phone numbers, friend codes, IDs) removed, then truncated */
export function scrubText(value: string, maxChars = MAX_FREE_TEXT_CHARS): string {
  const scrubbed = value.replace(EMAIL, '[email]').replace(LONG_DIGITS, '[number]').trim()
  return Array.from(scrubbed).slice(0, maxChars).join('')
}

/** `?via=` of the endpoint URL: which link installed the server. Absent: undefined; not [a-z0-9-_.]{1,32}: other */
export function sanitizeVia(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const lower = value.trim().toLowerCase()
  return /^[a-z0-9_.-]{1,32}$/.test(lower) ? lower : 'other'
}

/** The /24 of an IPv4 address or the /48 of an IPv6 address; undefined when it is not an address */
export function ipPrefix(address: string | undefined): string | undefined {
  if (!address) return undefined
  const family = isIP(address)
  if (family === 4) return `${address.split('.').slice(0, 3).join('.')}.0/24`
  if (family !== 6) return undefined
  const lower = address.toLowerCase()
  const [head = '', tail = ''] = lower.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups = lower.includes('::')
    ? [...left, ...Array.from({ length: Math.max(0, 8 - left.length - right.length) }, () => '0'), ...right]
    : left
  return `${groups
    .slice(0, 3)
    .map((g) => g.replace(/^0+(?=.)/, '') || '0')
    .join(':')}::/48`
}

const utcDate = (now: Date) => now.toISOString().slice(0, 10)

/** The pseudonymous id of a client for the UTC day of `now` (see the module comment) */
export function dailyDistinctId(
  secret: string,
  now: Date,
  client: { ipPrefix?: string; userAgent?: string; clientName?: string },
): string {
  const salt = createHmac('sha256', secret)
    .update(`mcp-analytics:${utcDate(now)}`)
    .digest()
  return createHmac('sha256', salt)
    .update([client.ipPrefix ?? '', client.userAgent ?? '', client.clientName ?? ''].join('\n'))
    .digest('hex')
    .slice(0, 32)
}

/** The whitelisted arguments of a tool call as `arg_*` properties */
export function argumentProperties(tool: string, args: unknown): JsonObject {
  if (!isObject(args)) return {}
  const properties: JsonObject = {}
  for (const name of FREE_TEXT_ARGS) {
    const value = args[name]
    if (typeof value === 'string') {
      properties[`arg_${name}`] = scrubText(value)
      properties[`arg_${name}_length`] = Array.from(value).length
    }
  }
  for (const name of ENUM_ARGS) {
    const value = args[name]
    if (typeof value === 'string') properties[`arg_${name}`] = scrubText(value, MAX_ENUM_CHARS)
  }
  for (const name of NUMBER_ARGS) {
    const value = args[name]
    if (typeof value === 'number' && Number.isFinite(value)) properties[`arg_${name}`] = value
  }
  // of the scores of calculate_best50, only how many; an achievement is a score, so only whether one was given
  if (Array.isArray(args.scores)) properties.arg_scores_count = args.scores.length
  if (tool === 'calculate_rating') properties.arg_has_achievement = args.achievement !== undefined
  return properties
}

/** The request around the messages: who sent it, from where, through which link */
export interface McpAnalyticsContext {
  readonly headers: Headers
  /** The address of the client, used only for the distinct_id */
  readonly clientAddress: string | undefined
  readonly via: string | undefined
  readonly durationMs: number
  readonly status: number
  readonly rateLimited?: boolean
  readonly deployment: string
}

export interface PostHogEvent {
  readonly event: string
  readonly distinct_id: string
  readonly timestamp: string
  readonly properties: JsonObject
}

const header = (headers: Headers, name: string) => headers.get(name)?.trim() || undefined

/** clientInfo of an initialize (or of params._meta) */
function clientInfo(params: JsonObject | undefined): { name?: string; version?: string } {
  for (const info of [params?.clientInfo, isObject(params?._meta) ? params._meta.clientInfo : undefined]) {
    if (isObject(info) && typeof info.name === 'string') {
      return {
        name: truncateBytes(info.name, MAX_CLIENT_BYTES),
        version: typeof info.version === 'string' ? truncateBytes(info.version, MAX_CLIENT_BYTES) : undefined,
      }
    }
  }
  return {}
}

const EVENT_OF_METHOD: Record<string, string> = {
  initialize: 'mcp_initialize',
  'tools/list': 'mcp_tools_list',
  'tools/call': 'mcp_tool_called',
}

const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value) ?? '').length

/**
 * The PostHog events of one exchange: one per initialize, tools/list or tools/call message (other methods and
 * notifications are left out). Of a tool call, the arguments are read through argumentProperties only.
 */
export function buildMcpAnalyticsEvents(
  context: McpAnalyticsContext,
  requestBody: unknown,
  responseBody: unknown,
  secret: string,
  now = new Date(),
): PostHogEvent[] {
  const messages = (Array.isArray(requestBody) ? requestBody : [requestBody]).filter(isObject)
  const responses = (Array.isArray(responseBody) ? responseBody : [responseBody]).filter(isObject)
  const responseOf = (id: unknown) =>
    id === undefined
      ? undefined
      : (responses.find((r) => r.id === id) ?? (messages.length === 1 ? responses[0] : undefined))
  const client = messages.map((m) => clientInfo(isObject(m.params) ? m.params : undefined)).find((c) => c.name) ?? {}
  const userAgent = header(context.headers, 'user-agent')
  const country = header(context.headers, 'cf-ipcountry')
  const city = header(context.headers, 'cf-ipcity')
  const region = header(context.headers, 'cf-region')
  const distinctId = dailyDistinctId(secret, now, {
    ipPrefix: ipPrefix(context.clientAddress),
    userAgent,
    clientName: client.name,
  })
  const common: JsonObject = {
    platform: 'mcp',
    deployment: context.deployment,
    client_name: client.name ?? null,
    client_version: client.version ?? null,
    client_class: classifyMcpClient(client.name, userAgent),
    ua_class: classifyUserAgent(userAgent),
    via: context.via ?? null,
    ...(country && country !== 'XX' ? { country } : {}),
    ...(city ? { city: truncateBytes(city, 64) } : {}),
    ...(region ? { region: truncateBytes(region, 64) } : {}),
    batch_size: messages.length,
    duration_ms: Math.round(context.durationMs),
    http_status: context.status,
    rate_limited: context.rateLimited ?? false,
    $geoip_disable: true,
    $process_person_profile: false,
  }
  const timestamp = now.toISOString()
  const events: PostHogEvent[] = []
  for (const message of messages) {
    const method = typeof message.method === 'string' ? message.method : ''
    const event = EVENT_OF_METHOD[method]
    if (!event) continue
    const params = isObject(message.params) ? message.params : undefined
    const response = responseOf(message.id)
    const error = isObject(response?.error) ? response.error : undefined
    const result = isObject(response?.result) ? response.result : undefined
    const properties: JsonObject = { ...common }
    if (method === 'initialize') {
      if (typeof params?.protocolVersion === 'string') {
        properties.protocol_version = truncateBytes(params.protocolVersion, 32)
      }
    } else {
      const protocol = header(context.headers, 'mcp-protocol-version')
      if (protocol) properties.protocol_version = truncateBytes(protocol, 32)
    }
    if (method === 'tools/list' && Array.isArray(result?.tools)) properties.result_count = result.tools.length
    if (method === 'tools/call') {
      const tool = boundedToolName(params?.name)
      properties.tool = tool
      Object.assign(properties, argumentProperties(tool, params?.arguments))
      if (isObject(result?.structuredContent)) {
        const list = Object.values(result.structuredContent).find(Array.isArray)
        if (list) properties.result_count = list.length
      }
    }
    if (result) properties.result_bytes = byteLength(result)
    properties.outcome = context.rateLimited
      ? 'rate_limited'
      : error || context.status >= 400
        ? 'rpc_error'
        : result?.isError === true
          ? 'tool_error'
          : 'ok'
    if (error && typeof error.code === 'number') properties.error_code = error.code
    events.push({ event, distinct_id: distinctId, timestamp, properties })
  }
  return events
}

export interface McpAnalyticsOptions {
  readonly apiKey: string | undefined
  readonly host?: string
  readonly secret?: string
  /** 0..1: the share of requests whose events are sent. Default 1 */
  readonly sampleRate?: number
  /** The most events sent per UTC day, 0 for no limit. Default 0 */
  readonly dailyCap?: number
  readonly deployment?: string
  readonly flushAt?: number
  readonly flushIntervalMs?: number
  readonly timeoutMs?: number
  readonly maxQueue?: number
  readonly fetch?: typeof fetch
  readonly random?: () => number
  readonly now?: () => Date
}

export interface McpAnalytics {
  readonly enabled: boolean
  /** Queues the events of one exchange; never throws, never waits */
  capture(context: McpAnalyticsContext, requestBody: unknown, responseBody: unknown): void
  /** Sends what is queued; resolves (never rejects) when the batch is sent, failed or timed out */
  flush(): Promise<void>
  shutdown(): Promise<void>
  readonly stats: { sent: number; dropped: number; failed: number }
}

/** A queue that sends to PostHog's /batch/ endpoint in the background */
export function createMcpAnalytics(options: McpAnalyticsOptions): McpAnalytics {
  const apiKey = options.apiKey
  const host = (options.host ?? POSTHOG_DEFAULT_HOST).replace(/\/$/, '')
  const secret = options.secret || randomBytes(32).toString('hex')
  const sampleRate = options.sampleRate ?? 1
  const dailyCap = options.dailyCap ?? 0
  const flushAt = options.flushAt ?? 50
  const timeoutMs = options.timeoutMs ?? 5_000
  const maxQueue = options.maxQueue ?? 2_000
  const doFetch = options.fetch ?? fetch
  const random = options.random ?? Math.random
  const now = options.now ?? (() => new Date())
  const stats = { sent: 0, dropped: 0, failed: 0 }
  let queue: PostHogEvent[] = []
  let day = ''
  let sentToday = 0
  let inFlight: Promise<void> = Promise.resolve()
  let timer: ReturnType<typeof setInterval> | undefined

  const send = async (batch: PostHogEvent[]) => {
    try {
      const response = await doFetch(`${host}/batch/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, historical_migration: false, batch }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (response.ok) stats.sent += batch.length
      else stats.failed += batch.length
    } catch {
      stats.failed += batch.length
    }
  }

  const flush = (): Promise<void> => {
    if (queue.length === 0) return inFlight
    const batch = queue
    queue = []
    inFlight = inFlight.then(() => send(batch))
    return inFlight
  }

  if (apiKey) {
    timer = setInterval(() => void flush(), options.flushIntervalMs ?? 10_000)
    timer.unref?.()
  }

  return {
    enabled: !!apiKey,
    stats,
    capture(context, requestBody, responseBody) {
      if (!apiKey) return
      try {
        if (sampleRate < 1 && random() >= sampleRate) return
        const at = now()
        const events = buildMcpAnalyticsEvents(
          { ...context, deployment: options.deployment ?? context.deployment },
          requestBody,
          responseBody,
          secret,
          at,
        )
        if (dailyCap > 0) {
          const today = utcDate(at)
          if (today !== day) {
            day = today
            sentToday = 0
          }
          const room = Math.max(0, dailyCap - sentToday)
          if (events.length > room) stats.dropped += events.length - room
          events.splice(room)
          sentToday += events.length
        }
        queue.push(...events)
        if (queue.length > maxQueue) {
          stats.dropped += queue.length - maxQueue
          queue = queue.slice(-maxQueue)
        }
        if (queue.length >= flushAt) void flush()
      } catch {
        // analytics never fails a request
      }
    },
    flush,
    async shutdown() {
      if (timer) clearInterval(timer)
      await flush()
    },
  }
}

const numberEnv = (value: string | undefined, fallback: number) => {
  const n = value === undefined || value === '' ? Number.NaN : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * The analytics of the environment:
 * - MCP_POSTHOG_KEY: project API key; default the public key of project 65078 in production, none elsewhere
 *   ("off" disables it)
 * - MCP_POSTHOG_HOST: default https://us.i.posthog.com
 * - MCP_ANALYTICS_SECRET: the secret of the daily distinct_id salt; default a random one per process
 * - MCP_ANALYTICS_SAMPLE_RATE: 0..1, default 1; MCP_ANALYTICS_DAILY_CAP: events per UTC day, default 0 (no cap)
 */
export function mcpAnalyticsFromEnv(env: NodeJS.ProcessEnv = process.env): McpAnalytics {
  const production = env.NODE_ENV === 'production'
  const configured = env.MCP_POSTHOG_KEY?.trim()
  const apiKey = configured === 'off' ? undefined : configured || (production ? POSTHOG_PUBLIC_PROJECT_KEY : undefined)
  if (production && !env.MCP_ANALYTICS_SECRET) {
    console.warn('MCP_ANALYTICS_SECRET is not set: MCP analytics ids use a random secret of this process')
  }
  return createMcpAnalytics({
    apiKey,
    host: env.MCP_POSTHOG_HOST?.trim() || undefined,
    secret: env.MCP_ANALYTICS_SECRET,
    sampleRate: Math.min(1, Math.max(0, numberEnv(env.MCP_ANALYTICS_SAMPLE_RATE, 1))),
    dailyCap: Math.max(0, Math.floor(numberEnv(env.MCP_ANALYTICS_DAILY_CAP, 0))),
    deployment: env.NODE_ENV ?? 'development',
  })
}

export class McpAnalyticsService extends Context.Service<McpAnalyticsService, McpAnalytics>()(
  'dxrating/McpAnalytics',
) {}

export const makeMcpAnalyticsLayer = (make: () => McpAnalytics = mcpAnalyticsFromEnv) =>
  Layer.effect(
    McpAnalyticsService,
    Effect.gen(function* () {
      const analytics = make()
      // flushed when the application shuts down, bounded by the timeout of a send
      yield* Effect.addFinalizer(() => Effect.promise(() => analytics.shutdown()))
      return analytics
    }),
  )

export const McpAnalyticsLive = makeMcpAnalyticsLayer()

const MAX_LOG_ARGUMENT_BYTES = 8 * 1024

/**
 * The fields of the wide event (Sentry logs) of an exchange, beyond those of telemetry.ts: the full address and its
 * prefix, the country (and ASN when a header carries it), the User-Agent, the via and the full arguments of each tool
 * call, under OpenTelemetry attribute names (client.address, gen_ai.tool.call.arguments, ...). These go to Sentry
 * only, never to PostHog.
 */
export function mcpLogFields(input: {
  readonly headers: Headers
  readonly clientAddress: string | undefined
  readonly via: string | undefined
  readonly requestBody?: unknown
}): JsonObject {
  const { headers } = input
  const messages = (Array.isArray(input.requestBody) ? input.requestBody : [input.requestBody]).filter(isObject)
  const calls = messages
    .filter((m) => m.method === 'tools/call' && isObject(m.params))
    .map((m) => truncateBytes(JSON.stringify((m.params as JsonObject).arguments ?? null), MAX_LOG_ARGUMENT_BYTES))
  const asn = header(headers, 'cf-ipasn') ?? header(headers, 'x-asn')
  const country = header(headers, 'cf-ipcountry')
  return {
    client: {
      ...(input.clientAddress ? { address: input.clientAddress } : {}),
      ...(ipPrefix(input.clientAddress) ? { address_prefix: ipPrefix(input.clientAddress) } : {}),
      ...(country ? { geo: { country_iso_code: country } } : {}),
    },
    ...(asn ? { network: { asn } } : {}),
    user_agent: { original: truncateBytes(header(headers, 'user-agent') ?? '', 512) },
    network_transport: 'http',
    mcp: { via: input.via ?? 'none' },
    ...(calls.length > 0 ? { gen_ai: { tool: { call: { arguments: calls.length === 1 ? calls[0] : calls } } } } : {}),
  }
}