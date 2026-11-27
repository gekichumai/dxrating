import { splitLocalePath } from './locale'
import { createCspNonce } from './security-headers'

/**
 * Edge cache for server-rendered HTML, kept per Cloudflare data center via the Workers Cache API.
 *
 * SSR output depends only on the URL: the locale is its path prefix (`/ja/…`; none for English), and the redirects that
 * send a visitor to their language's URL run before this cache (setup/locale-redirect.ts). Auth and every other user preference are applied on the client, so the HTML of the pages
 * below is the same for every visitor with the same locale. The key also includes the build commit: hashed
 * assets from an older deploy are gone after a release, so cached HTML must never outlive its build.
 *
 * The one input that is not in the key is the render time (the `dxrating-rendered-at` meta), which only seeds relative
 * times for the first paint; they catch up after hydration. So a page is kept for about as long as a build lives, and a
 * copy older than HTML_CACHE_FRESH_SECONDS is served as is while it is rendered again in the background.
 */

/** How long a data center keeps a page. Deploys come every few days and change the key, so this outlasts a build. */
export const HTML_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60
/** Past this age a hit also starts a background render, so busy pages show relative times no older than this. */
export const HTML_CACHE_FRESH_SECONDS = 30 * 60
export const HTML_CACHE_STATUS_HEADER = 'X-DXRating-Cache'
// When the copy was stored (ms since epoch), for the freshness check; never sent to visitors
const HTML_CACHE_STORED_AT_HEADER = 'X-DXRating-Stored-At'

const HTML_CACHE_KEY_PREFIX = '/__html-cache'

// Pages rendered purely from the bundled catalog. Routes whose loaders fetch remote data (e.g. /charts/trending)
// stay uncached so a failed upstream call is never pinned at the edge.
const CACHEABLE_PATHS = new Set([
  '/',
  '/search',
  '/charts/recent',
  '/constants',
  '/versions',
  '/rating',
  '/developers',
  '/privacy-policy',
  '/terms-of-service',
  '/plates',
  '/tools/tolerance',
  '/tools/rating',
])
const CACHEABLE_PATH_PREFIXES = ['/songs/', '/constants/', '/versions/', '/plates/']

// Matched without the locale prefix: `/ja/songs/…` follows the rules of `/songs/…`
const isCacheablePath = (localizedPathname: string) => {
  const { pathname } = splitLocalePath(localizedPathname)
  return CACHEABLE_PATHS.has(pathname) || CACHEABLE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

// Defense in depth: SSR never reads the session, but signed-in requests skip the shared cache entirely.
const hasSessionCookie = (cookieHeader: string | null) => !!cookieHeader && cookieHeader.includes('session_token')

export function getHtmlCacheKey(request: Request, buildId: string | undefined): string | null {
  if (!buildId || request.method !== 'GET') return null
  if (request.headers.has('authorization') || hasSessionCookie(request.headers.get('cookie'))) return null

  const url = new URL(request.url)
  if (!isCacheablePath(url.pathname)) return null

  // The path carries the locale, so it is the whole key with the build and the query
  return `${url.origin}${HTML_CACHE_KEY_PREFIX}/${encodeURIComponent(buildId)}${url.pathname}${url.search}`
}

export function isCacheableHtmlResponse(response: Response): boolean {
  return (
    response.status === 200 &&
    (response.headers.get('content-type') ?? '').startsWith('text/html') &&
    !response.headers.has('set-cookie') &&
    !response.headers.has('cache-control')
  )
}

/** The copy stored at the edge: same body and headers, plus an explicit edge TTL and the time it was stored. */
export function toStoredHtmlResponse(response: Response, storedAt = Date.now()): Response {
  const stored = new Response(response.body, response)
  stored.headers.set('Cache-Control', `public, s-maxage=${HTML_CACHE_TTL_SECONDS}`)
  stored.headers.set(HTML_CACHE_STORED_AT_HEADER, String(storedAt))
  return stored
}

/** A copy without a stored-at time (or a garbled one) counts as stale, so it gets rendered again. */
export function isStaleHtmlResponse(stored: Response, now = Date.now()): boolean {
  const storedAt = Number(stored.headers.get(HTML_CACHE_STORED_AT_HEADER))
  return !(storedAt > 0) || now - storedAt >= HTML_CACHE_FRESH_SECONDS * 1000
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
  headers.delete(HTML_CACHE_STORED_AT_HEADER)
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

type HtmlCache = Pick<Cache, 'match' | 'put'>

// Keys this isolate is rendering again: a burst of stale hits on one page renders it once
const refreshingKeys = new Set<string>()

const afterResponse = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * Serves a cacheable page from the data center's cache: a miss renders it, serves it and stores a copy; a hit serves
 * the copy. A copy past HTML_CACHE_FRESH_SECONDS is served too (the visitor never waits for a render), and replaced by a
 * render that starts once the response is on its way: SSR is synchronous CPU work that would otherwise run first.
 */
export async function serveWithHtmlCache(
  cache: HtmlCache,
  cacheKey: string,
  render: () => Response | Promise<Response>,
  waitUntil: (promise: Promise<unknown>) => void,
): Promise<Response> {
  const cached = await cache.match(cacheKey)
  if (cached) {
    const hit = await fromStoredHtmlResponse(cached)
    if (isStaleHtmlResponse(cached) && !refreshingKeys.has(cacheKey)) {
      refreshingKeys.add(cacheKey)
      waitUntil(
        afterResponse()
          .then(render)
          // A failed render keeps the stale copy; the next stale hit tries again
          .then((response) =>
            isCacheableHtmlResponse(response) ? cache.put(cacheKey, toStoredHtmlResponse(response)) : undefined,
          )
          .catch(() => undefined)
          .finally(() => refreshingKeys.delete(cacheKey)),
      )
    }
    return hit
  }

  const response = await render()
  if (!isCacheableHtmlResponse(response)) return response

  const [visitorBody, storedBody] = response.body ? response.body.tee() : [null, null]
  const stored = toStoredHtmlResponse(new Response(storedBody, response))
  waitUntil(cache.put(cacheKey, stored).catch(() => undefined))

  const visitorResponse = new Response(visitorBody, response)
  visitorResponse.headers.set(HTML_CACHE_STATUS_HEADER, 'MISS')
  return visitorResponse
}