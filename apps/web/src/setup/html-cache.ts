import { detectServerLocale } from './locale'
import { createCspNonce } from './security-headers'

/**
 * Edge cache for server-rendered HTML, kept per Cloudflare data center via the Workers Cache API.
 *
 * SSR output depends only on the URL and the resolved locale (query param, `dxrating.locale` cookie, or
 * Accept-Language). Auth and every other user preference are applied on the client, so the HTML of the pages
 * below is the same for every visitor with the same locale. The key also includes the build commit: hashed
 * assets from an older deploy are gone after a release, so cached HTML must never outlive its build.
 */

export const HTML_CACHE_TTL_SECONDS = 30 * 60
export const HTML_CACHE_STATUS_HEADER = 'X-DXRating-Cache'

const HTML_CACHE_KEY_PREFIX = '/__html-cache'

// Pages rendered purely from the bundled catalog. Routes whose loaders fetch remote data (e.g. /charts/trending)
// stay uncached so a failed upstream call is never pinned at the edge.
const CACHEABLE_PATHS = new Set([
  '/',
  '/search',
  '/charts/recent',
  '/developers',
  '/privacy-policy',
  '/terms-of-service',
])
const CACHEABLE_PATH_PREFIXES = ['/songs/']

const isCacheablePath = (pathname: string) =>
  CACHEABLE_PATHS.has(pathname) || CACHEABLE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))

// Defense in depth: SSR never reads the session, but signed-in requests skip the shared cache entirely.
const hasSessionCookie = (cookieHeader: string | null) => !!cookieHeader && cookieHeader.includes('session_token')

export function getHtmlCacheKey(request: Request, buildId: string | undefined): string | null {
  if (!buildId || request.method !== 'GET') return null
  if (request.headers.has('authorization') || hasSessionCookie(request.headers.get('cookie'))) return null

  const url = new URL(request.url)
  if (!isCacheablePath(url.pathname)) return null

  const locale = detectServerLocale(request)
  return `${url.origin}${HTML_CACHE_KEY_PREFIX}/${encodeURIComponent(buildId)}/${locale}${url.pathname}${url.search}`
}

export function isCacheableHtmlResponse(response: Response): boolean {
  return (
    response.status === 200 &&
    (response.headers.get('content-type') ?? '').startsWith('text/html') &&
    !response.headers.has('set-cookie') &&
    !response.headers.has('cache-control')
  )
}

/** The copy stored at the edge: same body and headers, plus an explicit edge TTL. */
export function toStoredHtmlResponse(response: Response): Response {
  const stored = new Response(response.body, response)
  stored.headers.set('Cache-Control', `public, s-maxage=${HTML_CACHE_TTL_SECONDS}`)
  return stored
}

const CSP_HEADERS = ['Content-Security-Policy', 'Content-Security-Policy-Report-Only']
const CSP_NONCE_SOURCE = /'nonce-([^']+)'/

/**
 * What the visitor receives on a hit: the original headers without the edge-only TTL, and a fresh CSP nonce. The
 * stored page carries the nonce of the render that produced it; serving one nonce to every visitor would let anyone
 * who saw it pass an injected script, so the same nonce is swapped out of the policy headers and the markup.
 */
export async function fromStoredHtmlResponse(stored: Response, nextNonce = createCspNonce()): Promise<Response> {
  const headers = new Headers(stored.headers)
  headers.delete('Cache-Control')
  headers.delete('Age')
  headers.set('Server-Timing', 'cache;desc="hit"')
  headers.set(HTML_CACHE_STATUS_HEADER, 'HIT')

  let body = await stored.text()
  const storedNonce = CSP_HEADERS.map((name) => headers.get(name)?.match(CSP_NONCE_SOURCE)?.[1]).find(Boolean)
  if (storedNonce) {
    body = body.replaceAll(storedNonce, nextNonce)
    for (const name of CSP_HEADERS) {
      const policy = headers.get(name)
      if (policy) headers.set(name, policy.replaceAll(storedNonce, nextNonce))
    }
  }

  return new Response(body, { status: stored.status, statusText: stored.statusText, headers })
}