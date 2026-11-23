import * as Sentry from '@sentry/node'
import { COMMON_ERROR_STATUS_MAP, ORPCError } from '@orpc/server'
import { Cause } from 'effect'
import { isSqlError } from 'effect/sql/SqlError'
import { DatabaseError } from '../../db/errors'
import { isExpectedRequestEnd } from '../../request-runner'
import { NetImportError, type NetImportErrorCode } from './client'
import {
  isCredentialPath,
  pathOf,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryLog,
} from '../credential-hygiene'

export type FailureClass = { readonly report: false } | { readonly report: true; readonly tags: Record<string, string> }

const EXPECTED_NET_CODES: ReadonlySet<NetImportErrorCode> = new Set<NetImportErrorCode>([
  'INVALID_CREDENTIALS',
  'NET_MAINTENANCE',
  'AIME_CARD_UNAVAILABLE',
])
const EXPECTED_MESSAGES = [
  'Invalid parameters',
  'QQ parameter is required',
  'Friend code parameter is required',
  'invalid credentials',
  'Failed to fetch',
]

/** An error and its causes, outermost first: `.cause` links and the squashed failure of an Effect `Cause`. */
const causeChain = (error: unknown): unknown[] => {
  const chain: unknown[] = []
  for (let link = error; link !== null && link !== undefined && chain.length < 8; ) {
    chain.push(link)
    link = Cause.isCause(link)
      ? Cause.squash(link)
      : typeof link === 'object'
        ? (link as { cause?: unknown }).cause
        : undefined
  }
  return chain
}

const isExpectedLink = (link: unknown) =>
  isExpectedRequestEnd(link) ||
  (link instanceof NetImportError && EXPECTED_NET_CODES.has(link.code)) ||
  (link instanceof Error && EXPECTED_MESSAGES.some((message) => link.message.includes(message)))

/**
 * Decides whether a failure reaches Sentry. The outermost error is what the client was answered, so an `ORPCError`
 * with a 4xx status is not reported. Neither is a failure with an expected one anywhere in its cause chain: the client
 * left, the server is shutting down, a maimai NET account state, invalid input. A reported failure is tagged with the
 * database operation and SQL error reason and with the maimai NET code, step and error code found down its chain. No
 * tag holds query text, parameters, URLs or credentials.
 */
export function classifyFailure(error: unknown): FailureClass {
  if (error instanceof ORPCError) {
    const status = COMMON_ERROR_STATUS_MAP[error.code as keyof typeof COMMON_ERROR_STATUS_MAP] ?? 500
    if (status >= 400 && status < 500) return { report: false }
  }
  const chain = causeChain(error)
  if (chain.some(isExpectedLink)) return { report: false }

  const database = chain.find((link) => link instanceof DatabaseError)
  const sql = chain.find(isSqlError)
  const net = chain.find((link) => link instanceof NetImportError)
  return {
    report: true,
    tags: {
      ...(database ? { 'db.operation': database.operation } : {}),
      ...(database && sql ? { 'db.error': sql.reason['_tag'] } : {}),
      ...(net ? { 'net.code': net.code } : {}),
      ...(net?.step ? { 'net.step': net.step } : {}),
      ...(net?.netErrorCode ? { 'net.error_code': net.netErrorCode } : {}),
    },
  }
}

/**
 * The tags `classifyFailure` gives a reported failure (database operation, SQL error reason, maimai NET codes), for a
 * log line; an expected failure has none. Like the Sentry tags, they hold no query text or parameters.
 */
export const failureTags = (error: unknown): Record<string, string> => {
  const failure = classifyFailure(error)
  return failure.report ? failure.tags : {}
}

/**
 * The client left: the request signal is aborted and the failure is its own reason (the Node adapter aborts with the
 * socket error as a string, "Error: aborted", which oRPC rethrows), an `AbortError` it caused, or the request runner's
 * client-closed error. Any other failure of an aborted request is still a failure.
 */
export const isClientAbort = (error: unknown, signal: AbortSignal | undefined): boolean => {
  if (!signal?.aborted) return false
  if (error === signal.reason) return true
  return (error instanceof Error && error.name === 'AbortError') || isExpectedRequestEnd(error)
}

type ReportContext = {
  readonly tags?: Record<string, string | undefined>
  readonly contexts?: Record<string, Record<string, unknown>>
  readonly extra?: Record<string, unknown>
  readonly level?: Sentry.SeverityLevel
  /** The request's signal, so a failure caused by the client leaving is not reported. */
  readonly signal?: AbortSignal | undefined
}

/** Sends a failure to Sentry unless the client left or `classifyFailure` expects it, and says whether it did. */
export function reportFailure(error: unknown, { signal, ...context }: ReportContext = {}): boolean {
  if (isClientAbort(error, signal)) {
    Sentry.addBreadcrumb({ category: 'request', level: 'info', message: 'Aborted by the client', data: context.tags })
    return false
  }
  if (!classifyFailure(error).report) return false
  Sentry.captureException(error, context)
  return true
}

const isCredentialRoute = (value: string | undefined) => isCredentialPath(pathOf(value))

function withoutBody<T extends Record<string, unknown>>(data: T | undefined): T | undefined {
  if (!data) return data
  const copy = { ...data }
  for (const key of Object.keys(copy)) {
    if (/body|payload|request\.data/i.test(key)) delete copy[key]
  }
  return copy
}

type ScrubbableEvent = Pick<Sentry.Event, 'request' | 'transaction' | 'contexts' | 'spans' | 'breadcrumbs'>

/** Drops request bodies (and body-like span or breadcrumb attributes) of the credential routes from an event. */
export function scrubCredentialBodies<E extends ScrubbableEvent>(event: E): E {
  const traceData = event.contexts?.trace?.data as Record<string, unknown> | undefined
  const sensitive =
    isCredentialRoute(event.request?.url) ||
    isCredentialRoute(event.transaction) ||
    isCredentialRoute(typeof traceData?.['url.path'] === 'string' ? traceData['url.path'] : undefined) ||
    isCredentialRoute(typeof traceData?.['http.target'] === 'string' ? traceData['http.target'] : undefined)
  if (!sensitive) return event
  const scrubbed = { ...event }
  if (scrubbed.request) {
    const { data: _data, ...request } = scrubbed.request
    scrubbed.request = request
  }
  if (scrubbed.contexts?.trace) {
    scrubbed.contexts = {
      ...scrubbed.contexts,
      trace: { ...scrubbed.contexts.trace, data: withoutBody(traceData) },
    } as typeof scrubbed.contexts
  }
  if (scrubbed.spans) scrubbed.spans = scrubbed.spans.map((span) => ({ ...span, data: withoutBody(span.data) ?? {} }))
  if (scrubbed.breadcrumbs) {
    scrubbed.breadcrumbs = scrubbed.breadcrumbs.map((breadcrumb) => ({
      ...breadcrumb,
      data: withoutBody(breadcrumb.data),
    }))
  }
  return scrubbed
}

/** The backend's Sentry options; `initSentry` uses them in production, tests with an in-memory transport. */
export function sentryOptions({
  dsn,
  environment,
  release,
}: {
  dsn: string
  environment: string
  release: string | undefined
}): Sentry.NodeOptions {
  return buildSentryOptions(environment, { dsn, release })
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
      Sentry.httpIntegration({
        ignoreIncomingRequestBody: isCredentialRoute,
      }),
      // Send console.log, console.warn, and console.error calls as logs to Sentry
      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
    ],
    // Performance monitoring
    // Every MCP request is traced (a span per MCP message); the rest at 10%
    tracesSampler: ({ name, inheritOrSampleWith }) =>
      /\/mcp(?:\?|$|\s)/.test(name) ? 1.0 : inheritOrSampleWith(environment === 'production' ? 0.1 : 1.0),
    beforeSend(event, hint) {
      const failure = classifyFailure(hint.originalException)
      if (!failure.report) return null
      event.tags = { ...event.tags, ...failure.tags }
      return scrubCredentialBodies(scrubSentryEvent(event))
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
      return scrubCredentialBodies(scrubSentryEvent(event))
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