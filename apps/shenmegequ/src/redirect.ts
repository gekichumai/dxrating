import { domainToUnicode } from 'node:url'

/** The zone, in the ASCII form the Host header carries (是什么歌.com) */
export const ZONE_ASCII = 'xn--6iq3kq43dxve.com'
const ZONE_UNICODE = '是什么歌.com'

/**
 * Every redirect goes to this one URL builder. The locale is a query parameter today; when the web app moves the
 * locale into the path (`/zh-Hans/...`, planned for 2026-11-10), only this function changes.
 */
const TARGET_ORIGIN = 'https://dxrating.net'
const TARGET_LOCALE = 'zh-Hans'
const TARGET_REF = 'shenmegequ'

export function targetUrl(query: string | null): string {
  const params: [string, string][] = []
  if (query) params.push(['q', query])
  params.push(['locale', TARGET_LOCALE], ['ref', TARGET_REF])
  // encodeURIComponent, not URLSearchParams: spaces stay %20 rather than `+`, as the old Worker sent them
  return `${TARGET_ORIGIN}/?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`
}

/** Longer queries are cut (by code point) rather than refused; no alias comes near this */
const MAX_QUERY_LENGTH = 200

/** Collapses whitespace runs, trims and caps the length; null when nothing is left */
function normalizeQuery(raw: string): string | null {
  const query = [...raw.replace(/\s+/g, ' ').trim()].slice(0, MAX_QUERY_LENGTH).join('').trim()
  return query === '' ? null : query
}

/**
 * The path form, `是什么歌.com/<alias>`: the path is the alias as typed, so it keeps spaces, case, dots and anything
 * else a hostname cannot hold. A malformed percent-encoding gives null (the caller sends it home).
 */
export function queryFromPath(pathname: string): string | null {
  const raw = pathname.replace(/^\/+/, '').replace(/\/+$/, '')
  if (raw === '') return null
  try {
    return normalizeQuery(decodeURIComponent(raw))
  } catch {
    return null
  }
}

/**
 * The subdomain form, `<label>.是什么歌.com`. Web and iOS build the label by lowercasing the alias, turning spaces and
 * dots into `-`, dropping characters a hostname cannot hold and capping it at 63 bytes; this undoes what it can:
 * `-` becomes a space again. Hosts more than one level deep (only reachable over plain HTTP: the certificate is a
 * single-level wildcard) join their labels with spaces. The apex, `www` and anything undecodable give null.
 */
export function queryFromHost(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (!host.endsWith(`.${ZONE_ASCII}`)) return null
  // Invalid punycode: Node returns '', workerd leaves the label as `xn--…`; both count as undecodable
  const unicode = domainToUnicode(host)
  if (!unicode.endsWith(`.${ZONE_UNICODE}`)) return null
  const labels = unicode.slice(0, -(ZONE_UNICODE.length + 1))
  if (labels.split('.').some((label) => label.startsWith('xn--'))) return null
  if (labels === 'www') return null
  return normalizeQuery(labels.replace(/[.-]/g, ' '))
}

/** Requests browsers make on their own; they get a 404 rather than a search */
const NOT_ALIASES = new Set([
  '/favicon.ico',
  '/robots.txt',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
])

export function handle(request: Request): Response {
  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return redirect(targetUrl(null))
  }
  if (NOT_ALIASES.has(url.pathname)) return new Response('Not Found', { status: 404 })

  // The path form wins over the subdomain: it carries the alias exactly as typed
  const hasPath = url.pathname.replace(/\/+/g, '') !== ''
  const query = hasPath ? queryFromPath(url.pathname) : queryFromHost(hostOf(request, url))
  return redirect(targetUrl(query))
}

/** The Host header without its port, as the old Worker read it; the URL's host when the header is missing */
function hostOf(request: Request, url: URL): string {
  const header = request.headers.get('Host')
  return header ? header.replace(/:\d+$/, '') : url.hostname
}

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'public, max-age=300' },
  })
}