import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  LOCALE_PATH_PREFIXES,
  LOCALE_QUERY_PARAM,
  type SupportedLocale,
  appendVaryHeader,
  localizePath,
  negotiateLocale,
  splitLocalePath,
  toSupportedLocale,
} from './locale'

/**
 * Redirects that put a page URL's language in its path (meta#52). They run before the HTML edge cache, so a cached
 * English page is never served to a visitor who should have been sent to their language.
 *
 * - `?locale=xx` (the old scheme, still in bookmarks, inbound links and search indexes) → 301 to the `xx` path, with
 *   every other query parameter kept: `/?q=…&locale=zh-Hans&ref=x` → `/zh-hans?q=…&ref=x`. A `?locale=` on a prefixed
 *   URL wins, as it did before. An unsupported value is ignored, and the URL is served as it is.
 * - A prefix in the wrong case (`/zh-Hans/…`, `/JA/…`) → 301 to the lowercase one; `/en/…` → 301 to the unprefixed
 *   English URL.
 * - An unprefixed URL (English) asked for by a visitor whose preference is another language (the picker's cookie, or
 *   with no cookie, Accept-Language) → 302 to that language's URL. Crawlers send neither, so they get English and
 *   follow hreflang to the other languages; the unprefixed URL is the x-default.
 */
export function localeRedirect(request: Request): Response | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null

  const url = new URL(request.url)
  if (!isPagePath(url.pathname)) return null

  const queryLocale = url.searchParams.has(LOCALE_QUERY_PARAM)
    ? toSupportedLocale(url.searchParams.get(LOCALE_QUERY_PARAM))
    : null
  const { locale: pathLocale, pathname } = normalizeLocalePath(url.pathname)

  if (queryLocale) {
    url.searchParams.delete(LOCALE_QUERY_PARAM)
    const response = permanentRedirect(localizePath(pathname, queryLocale) + url.search)
    if (queryLocale === DEFAULT_LOCALE) {
      // English has no prefix, so the unprefixed URL alone can't say it was chosen: without a record of the choice the
      // next request would redirect a Japanese browser on to /ja/…. The link chose English as the picker would, so it
      // sets the picker's cookie; private, so no shared cache keeps one visitor's cookie
      response.headers.append('Set-Cookie', localeCookie(DEFAULT_LOCALE))
      response.headers.set('Cache-Control', 'private, no-store')
    }
    return response
  }

  if (pathLocale !== undefined) {
    // The path named a locale in a non-canonical form (wrong case, or /en)
    return permanentRedirect(localizePath(pathname, pathLocale) + url.search)
  }

  if (splitLocalePath(url.pathname).locale !== DEFAULT_LOCALE || isNegotiationExempt(url.pathname)) return null

  const preferred = negotiateLocale(request)
  if (preferred === DEFAULT_LOCALE) return null

  const response = new Response(null, {
    status: 302,
    headers: {
      Location: sameOriginLocation(localizePath(url.pathname, preferred) + url.search),
      'Cache-Control': 'private, no-store',
    },
  })
  appendVaryHeader(response.headers, 'Cookie')
  appendVaryHeader(response.headers, 'Accept-Language')
  return response
}

const PREFIX_LOCALES = new Map<string, SupportedLocale>([
  ['en', DEFAULT_LOCALE],
  ...Object.entries(LOCALE_PATH_PREFIXES).map(([locale, prefix]) => [prefix, locale as SupportedLocale] as const),
])

/**
 * A first path segment that names a locale but isn't its canonical prefix (`/JA`, `/zh-Hans`, `/en`): that locale, and
 * the path without the segment. `locale` is undefined when the path is already canonical or names no locale.
 */
function normalizeLocalePath(pathname: string): { locale?: SupportedLocale; pathname: string } {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname)
  if (!match) return { pathname }
  const segment = match[1]
  const locale = PREFIX_LOCALES.get(segment.toLowerCase())
  if (!locale) return { pathname }
  const rest = match[2] || '/'
  if (locale !== DEFAULT_LOCALE && segment === LOCALE_PATH_PREFIXES[locale]) return { pathname: rest }
  return { locale, pathname: rest }
}

// Files the server answers on its own (sitemap.xml, llms.txt, Apple's association file, images) and framework paths
// (server functions under /_serverFn); none of them has language variants
const NON_PAGE_PATH =
  /^\/(?:_|\.well-known\/|api\/|assets\/)|\.(?:txt|xml|json|webmanifest|ico|png|jpe?g|webp|avif|gif|svg|pdf|js|css|map)$/i

function isPagePath(pathname: string) {
  return !NON_PAGE_PATH.test(pathname)
}

const localeCookie = (locale: SupportedLocale) =>
  `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`

// OAuth and import callbacks are registered with their providers as unprefixed URLs: answer them where they land
const isNegotiationExempt = (pathname: string) => pathname.startsWith('/io/') || pathname.startsWith('/account/')

function permanentRedirect(location: string) {
  return new Response(null, { status: 301, headers: { Location: sameOriginLocation(location) } })
}

/**
 * A redirect target that stays on this site. Stripping a prefix from `/en//example.org` leaves `//example.org`, which a
 * browser reads as another host (as it does `/\example.org`): collapse any run of leading slashes and backslashes.
 */
export const sameOriginLocation = (location: string) => `/${location.replace(/^[/\\]+/, '')}`