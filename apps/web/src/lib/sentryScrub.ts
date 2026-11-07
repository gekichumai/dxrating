/**
 * OAuth callbacks carry one-time credentials in the query (`/io/import/lxns/oauth_callback?code=…&state=…`). The page
 * removes them from the address bar after mounting, but Sentry captures the request (worker) and the page URL
 * (browser) before that, so every event, transaction and breadcrumb drops these parameters' values first.
 */
const SECRET_QUERY_PARAMS = ['code', 'state'] as const
const REDACTED = '[Filtered]'

export function scrubUrl(url: string): string {
  if (!SECRET_QUERY_PARAMS.some((name) => url.includes(`${name}=`))) return url
  try {
    const isAbsolute = /^[a-z][a-z\d+.-]*:\/\//i.test(url)
    const parsed = new URL(url, 'https://dxrating.net')
    let changed = false
    for (const name of SECRET_QUERY_PARAMS) {
      if (parsed.searchParams.has(name)) {
        parsed.searchParams.set(name, REDACTED)
        changed = true
      }
    }
    if (!changed) return url
    return isAbsolute ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return url
  }
}

const isSecret = (key: string) => (SECRET_QUERY_PARAMS as readonly string[]).includes(key)

type QueryString = string | Record<string, string> | Array<[string, string]>

function scrubQueryString(query: QueryString): QueryString {
  if (typeof query === 'string') return scrubUrl(`/?${query.replace(/^\?/, '')}`).replace(/^\/\?/, '')
  if (Array.isArray(query)) {
    return query.map(([key, value]): [string, string] => [key, isSecret(key) ? REDACTED : value])
  }
  return Object.fromEntries(Object.entries(query).map(([key, value]) => [key, isSecret(key) ? REDACTED : value]))
}

type ScrubbableBreadcrumb = { data?: Record<string, unknown> }

export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(breadcrumb: B): B {
  if (!breadcrumb.data) return breadcrumb
  const data = { ...breadcrumb.data }
  for (const key of ['url', 'from', 'to']) {
    if (typeof data[key] === 'string') data[key] = scrubUrl(data[key])
  }
  return { ...breadcrumb, data }
}

/** Span and trace attributes (`url.full`, `url.query`, `http.target`, `http.query`, …) carry the request URL too */
function scrubData(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (typeof value !== 'string') return [key, value]
      if (/query$/i.test(key)) return [key, scrubQueryString(value)]
      return [key, scrubText(value)]
    }),
  )
}

/** Transaction names and span descriptions look like `GET /path?query`: scrub only the URL part */
const scrubText = (text: string) => (text.includes('?') ? text.replace(/\S*\?\S*/g, scrubUrl) : text)

type ScrubbableSpan = { description?: string; data?: Record<string, unknown> }

/** For `beforeSendSpan` */
export function scrubSpan<S extends ScrubbableSpan>(span: S): S {
  return {
    ...span,
    ...(span.description ? { description: scrubText(span.description) } : {}),
    ...(span.data ? { data: scrubData(span.data) } : {}),
  }
}

type ScrubbableEvent = {
  request?: { url?: string; query_string?: QueryString }
  breadcrumbs?: ScrubbableBreadcrumb[]
  transaction?: string
  tags?: Record<string, unknown>
  contexts?: { trace?: { data?: Record<string, unknown> } & Record<string, unknown> } & Record<string, unknown>
  spans?: ScrubbableSpan[]
}

/** For `beforeSend` and `beforeSendTransaction` */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  const scrubbed = { ...event }
  if (scrubbed.request) {
    scrubbed.request = {
      ...scrubbed.request,
      ...(scrubbed.request.url ? { url: scrubUrl(scrubbed.request.url) } : {}),
      ...(scrubbed.request.query_string ? { query_string: scrubQueryString(scrubbed.request.query_string) } : {}),
    }
  }
  if (scrubbed.breadcrumbs) scrubbed.breadcrumbs = scrubbed.breadcrumbs.map(scrubBreadcrumb)
  if (scrubbed.transaction) scrubbed.transaction = scrubText(scrubbed.transaction)
  if (scrubbed.tags) scrubbed.tags = scrubData(scrubbed.tags)
  if (scrubbed.contexts?.trace?.data) {
    scrubbed.contexts = {
      ...scrubbed.contexts,
      trace: { ...scrubbed.contexts.trace, data: scrubData(scrubbed.contexts.trace.data) },
    }
  }
  if (scrubbed.spans) scrubbed.spans = scrubbed.spans.map(scrubSpan)
  return scrubbed
}

/** Spread into every `Sentry.init` (worker and browser) */
export const sentryScrubOptions = {
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,
  beforeSendSpan: scrubSpan,
  beforeBreadcrumb: scrubBreadcrumb,
}