import type { MiddlewareHandler } from 'hono'

/**
 * Credential hygiene (design §7.2). SEGA IDs and passwords are used for one request and must never reach a log line
 * (evlog), Sentry (events, breadcrumbs, logs), PostHog, an error message or the database; nor may LXNS tokens,
 * cookies or Authorization headers reach telemetry.
 *
 * Two layers:
 * - By key, everywhere: values under a credential key (`password`, `access_token`, `cookie`, ...) are replaced, and
 *   on the maimai NET routes also `id`, `segaId` and `sid` (the SEGA ID fields of their bodies and login forms).
 * - By value: while a NET request runs (and for a grace period after it, as Sentry processes events
 *   asynchronously), the SEGA ID and password it carries are held in an in-memory registry, and every string sent to
 *   telemetry has them replaced, wherever they appear (an upstream error message, an exception, a breadcrumb).
 *   The registry is memory only and never persisted.
 */

export const FILTERED = '[Filtered]'

/** Keys whose values are credentials on every route (compared lower-cased, without `-` and `_`) */
const CREDENTIAL_KEYS = new Set([
  'password',
  'passwd',
  'segaid',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'clientsecret',
  'authorization',
  'proxyauthorization',
  'cookie',
  'cookies',
  'setcookie',
])

/** Keys that hold the SEGA ID on the maimai NET routes (`id` in their bodies, `sid` in the intl login form) */
const NET_ROUTE_CREDENTIAL_KEYS = new Set(['id', 'sid'])

/**
 * Query parameters whose values are secrets: the LXNS OAuth callback's `code` and `state`, tokens, and `ssid`, the
 * session hand-off token of the intl maimai NET login redirect
 */
const CREDENTIAL_QUERY_PARAMETERS = new Set([
  'code',
  'state',
  'password',
  'access_token',
  'refresh_token',
  'token',
  'ssid',
])

/**
 * A credential query parameter inside any string: a URL (`url.full`, `http.target`, a span description, an error
 * message quoting a URL) or a bare query, with or without its `?` (`http.query`, `url.query`). The value runs to the
 * next `&`, `#`, quote, angle bracket or whitespace.
 */
const CREDENTIAL_QUERY_PATTERN = new RegExp(
  `(^|[?&])(${[...CREDENTIAL_QUERY_PARAMETERS].map((name) => name.replace(/_/g, '(?:_|%5F)')).join('|')})=[^&#\\s"'<>]*`,
  'gi',
)

const normalizeKey = (key: string) => key.toLowerCase().replace(/[-_]/g, '')

const NET_ROUTE_PATTERNS = [
  /^\/functions\/fetch-net-records(?:\/|$)/,
  /^\/api\/v1\/io\/import\/maimai-net\/?$/,
  /^\/api\/v1\/saves\/[^/]+\/imports\/maimai-net\/?$/,
]
const TOKEN_ROUTE_PATTERNS = [/^\/api\/v1\/io\/import\/lxns(?:\/|$)/, /^\/api\/v1\/saves\/[^/]+\/imports\/lxns\/?$/]

/** The path of a URL, a path with a query, or a transaction name like `POST /functions/...` */
export function pathOf(urlOrPath: string | undefined): string {
  if (!urlOrPath) return ''
  const value = urlOrPath.replace(/^[A-Z]+ /, '')
  try {
    return new URL(value, 'http://localhost').pathname
  } catch {
    return value.split('?')[0] ?? ''
  }
}

/** The maimai NET routes, whose bodies carry a SEGA ID and password (new and legacy) */
export const isNetCredentialPath = (path: string) => NET_ROUTE_PATTERNS.some((pattern) => pattern.test(path))

/** Routes whose request bodies must never be attached to telemetry */
export const isCredentialPath = (path: string) =>
  isNetCredentialPath(path) || TOKEN_ROUTE_PATTERNS.some((pattern) => pattern.test(path))

// --- Registry of the credentials of running requests ---

/** Shorter values are not matched by value (they would filter unrelated text); their keys still are */
const MIN_SECRET_LENGTH = 3
/** How long a credential stays registered after its request let go of it (Sentry sends events asynchronously) */
const RELEASE_GRACE_MS = 30_000
/** The longest a credential stays registered, even if its request never let go (an abandoned stream) */
const MAX_HOLD_MS = 20 * 60_000

const activeSecrets = new Map<string, number>()

/**
 * Registers credential values so telemetry filters them; returns the release function (idempotent). The values stay
 * registered for a grace period after the release, and at most {@link MAX_HOLD_MS}.
 */
export function holdCredentials(values: Iterable<string | undefined | null>): () => void {
  const held = [...new Set([...values].filter((value): value is string => typeof value === 'string'))].filter(
    (value) => value.length >= MIN_SECRET_LENGTH,
  )
  for (const value of held) activeSecrets.set(value, (activeSecrets.get(value) ?? 0) + 1)
  let released = false
  const drop = () => {
    for (const value of held) {
      const count = (activeSecrets.get(value) ?? 1) - 1
      if (count > 0) activeSecrets.set(value, count)
      else activeSecrets.delete(value)
    }
  }
  const ceiling = setTimeout(() => release(), MAX_HOLD_MS)
  ceiling.unref?.()
  const release = () => {
    if (released) return
    released = true
    clearTimeout(ceiling)
    const timer = setTimeout(drop, RELEASE_GRACE_MS)
    timer.unref?.()
  }
  return release
}

/** Number of credential values registered right now (tests) */
export const heldCredentialCount = () => activeSecrets.size

/** `value` with every registered credential and the values of credential query parameters replaced */
export function scrubString(value: string): string {
  let result = value.includes('=') ? value.replace(CREDENTIAL_QUERY_PATTERN, `$1$2=${FILTERED}`) : value
  if (activeSecrets.size === 0) return result
  // longest first, so a password containing the SEGA ID is replaced whole
  for (const secret of [...activeSecrets.keys()].sort((a, b) => b.length - a.length)) {
    if (result.includes(secret)) result = result.split(secret).join(FILTERED)
  }
  return result
}

/** A URL (or path) with the values of its credential query parameters replaced */
export function scrubUrl(value: string): string {
  const scrubbed = scrubString(value)
  const query = scrubbed.indexOf('?')
  if (query < 0) return scrubbed
  const params = scrubbed.slice(query + 1).split('&')
  return (
    scrubbed.slice(0, query + 1) +
    params
      .map((param) => {
        const [key = ''] = param.split('=', 1)
        return CREDENTIAL_QUERY_PARAMETERS.has(decodeSafe(key).toLowerCase()) ? `${key}=${FILTERED}` : param
      })
      .join('&')
  )
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export interface ScrubOptions {
  /** Also treat `id` / `sid` as credentials (maimai NET routes) */
  netRoute?: boolean
}

const MAX_DEPTH = 24

/**
 * A deep copy of `value` with credential keys and registered credential values replaced. Errors become plain
 * errors with scrubbed messages and stacks. Cycles and very deep values are cut.
 */
export function scrubValue<T>(value: T, options: ScrubOptions = {}): T {
  const seen = new WeakSet<object>()
  const isCredentialKey = (key: string) => {
    const normalized = normalizeKey(key)
    return CREDENTIAL_KEYS.has(normalized) || (options.netRoute === true && NET_ROUTE_CREDENTIAL_KEYS.has(normalized))
  }
  const walk = (current: unknown, depth: number): unknown => {
    if (typeof current === 'string') return scrubString(current)
    if (current === null || typeof current !== 'object') return current
    if (depth > MAX_DEPTH || seen.has(current)) return FILTERED
    seen.add(current)
    if (current instanceof Error) {
      const copy = new Error(scrubString(current.message))
      copy.name = current.name
      copy.stack = current.stack === undefined ? undefined : scrubString(current.stack)
      return copy
    }
    if (current instanceof Date) return current
    if (Array.isArray(current)) return current.map((item) => walk(item, depth + 1))
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(current)) {
      result[key] = isCredentialKey(key) && item !== null && item !== undefined ? FILTERED : walk(item, depth + 1)
    }
    return result
  }
  return walk(value, 0) as T
}

// --- Sentry ---

interface SentryRequestLike {
  url?: string
  data?: unknown
  cookies?: unknown
  headers?: Record<string, string>
  query_string?: unknown
}

interface SentryEventLike {
  request?: SentryRequestLike
  transaction?: string
  breadcrumbs?: SentryBreadcrumbLike[]
  [key: string]: unknown
}

interface SentryBreadcrumbLike {
  message?: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

/** Scrubs a Sentry event (an error or a transaction) in place and returns it (`beforeSend`) */
export function scrubSentryEvent<T extends object>(input: T): T {
  const event = input as unknown as SentryEventLike
  const path = pathOf(event.request?.url ?? event.transaction)
  const netRoute = isNetCredentialPath(path)
  if (event.request) {
    if (isCredentialPath(path)) delete event.request.data
    delete event.request.cookies
    if (typeof event.request.url === 'string') event.request.url = scrubUrl(event.request.url)
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = scrubUrl(`?${event.request.query_string}`).slice(1)
    } else if (event.request.query_string !== undefined) {
      event.request.query_string = FILTERED
    }
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map((crumb) => scrubSentryBreadcrumb(crumb, netRoute))
  for (const key of Object.keys(event)) {
    if (key === 'breadcrumbs') continue
    event[key] = scrubValue(event[key], { netRoute })
  }
  return input
}

/** Scrubs a breadcrumb in place and returns it (`beforeBreadcrumb`) */
export function scrubSentryBreadcrumb<T extends object>(input: T, netRoute = false): T {
  const breadcrumb = input as unknown as SentryBreadcrumbLike
  if (typeof breadcrumb.message === 'string') breadcrumb.message = scrubString(breadcrumb.message)
  if (breadcrumb.data) {
    const data = scrubValue(breadcrumb.data, { netRoute })
    if (typeof data.url === 'string') data.url = scrubUrl(data.url)
    breadcrumb.data = data
  }
  return input
}

/** Scrubs a Sentry log (console integration, evlog's Sentry drain) in place and returns it (`beforeSendLog`) */
export function scrubSentryLog<T extends { message?: unknown; attributes?: Record<string, unknown> }>(log: T): T {
  if (typeof log.message === 'string') log.message = scrubString(log.message)
  if (log.attributes) log.attributes = scrubValue(log.attributes)
  return log
}

// --- evlog ---

type LoggerLike = object

/**
 * The request logger with every argument scrubbed before it reaches evlog: on the credential routes nothing logged
 * through `c.get('log')` (fields, errors, messages) can carry a credential.
 */
export function scrubbingLogger<T extends LoggerLike>(logger: T, options: ScrubOptions): T {
  const wrapped = new Set(['set', 'error', 'info', 'warn', 'emit'])
  return new Proxy(logger, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof property !== 'string' || !wrapped.has(property) || typeof value !== 'function') return value
      return (...args: unknown[]) => (value as (...a: unknown[]) => unknown).apply(target, scrubValue(args, options))
    },
  })
}

// --- PostHog ---

/** A PostHog event without credential properties (the backend never sends any; this keeps it so) */
export function scrubAnalyticsEvent<T>(event: T): T {
  return scrubValue(event)
}

// --- Hono middleware ---

/** Bodies larger than this are not read ahead (the NET bodies are a few hundred bytes) */
const MAX_PEEKED_BODY_BYTES = 16 * 1024

/** String values of the SEGA ID and password fields of a JSON body */
function credentialValuesOf(body: unknown): string[] {
  if (body === null || typeof body !== 'object') return []
  const values: string[] = []
  for (const [key, value] of Object.entries(body)) {
    const normalized = normalizeKey(key)
    if (typeof value !== 'string') continue
    if (CREDENTIAL_KEYS.has(normalized) || NET_ROUTE_CREDENTIAL_KEYS.has(normalized)) values.push(value)
  }
  return values
}

async function peekCredentials(request: Request): Promise<string[]> {
  if (request.method !== 'POST' || !request.body) return []
  const length = Number.parseInt(request.headers.get('content-length') ?? '', 10)
  if (!Number.isFinite(length) || length > MAX_PEEKED_BODY_BYTES) return []
  try {
    return credentialValuesOf(await request.clone().json())
  } catch {
    return []
  }
}

/**
 * Hono middleware of the credential routes (the NET routes, new and legacy, and the LXNS routes). Register it after
 * evlog. It registers the request's SEGA ID and password (read ahead from a small JSON body) for value scrubbing
 * while the handler runs, and replaces the request logger with a scrubbing one, so no field, error or message the
 * route logs carries a credential. Request bodies are never logged by evlog itself; Sentry is told not to attach
 * them (`ignoreIncomingRequestBody`) and drops them in `beforeSend`.
 *
 * Streaming handlers (SSE) hold their own credentials for the stream's lifetime: this middleware lets go when the
 * handler returns its response.
 */
export const credentialHygiene: MiddlewareHandler = async (c, next) => {
  const release = holdCredentials(await peekCredentials(c.req.raw))
  const netRoute = isNetCredentialPath(c.req.path)
  const log = c.get('log') as LoggerLike | undefined
  if (log) c.set('log', scrubbingLogger(log, { netRoute }))
  try {
    await next()
  } finally {
    release()
  }
}