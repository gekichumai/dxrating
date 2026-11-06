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

type ScrubbableEvent = {
  request?: { url?: string; query_string?: QueryString }
  breadcrumbs?: ScrubbableBreadcrumb[]
  transaction?: string
  tags?: Record<string, unknown>
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
  // Transaction names look like `GET /path?query`: scrub only the URL part
  if (scrubbed.transaction) scrubbed.transaction = scrubbed.transaction.replace(/\S*\?\S*/g, scrubUrl)
  if (scrubbed.tags && typeof scrubbed.tags.url === 'string')
    scrubbed.tags = { ...scrubbed.tags, url: scrubUrl(scrubbed.tags.url) }
  return scrubbed
}