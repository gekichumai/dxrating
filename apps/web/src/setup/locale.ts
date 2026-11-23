import { SUPPORTED_LOCALES, type SupportedLocale } from '@gekichumai/api-contract'
import { parse as parseCookie } from 'cookie'

// The one language list, shared with the backend and served to the iOS app (packages/api-contract/src/locales.ts).
// Paraglide's project.inlang/settings.json must list the same tags; a test checks it.
export { SUPPORTED_LOCALES, type SupportedLocale }

export const DEFAULT_LOCALE = 'en' satisfies SupportedLocale
export const LOCALE_QUERY_PARAM = 'locale'
export const LOCALE_COOKIE_NAME = 'dxrating.locale'
export const LOCALE_STORAGE_KEY = 'dxrating-locale'
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

/** A Map, not an object literal: `?locale=constructor` must not find Object.prototype */
const PRIMARY_LANGUAGE_LOCALES = new Map<string, SupportedLocale>([
  ['ms', 'ms'],
  ['id', 'id'],
  ['in', 'id'],
  ['fil', 'fil'],
  ['tl', 'fil'],
  ['vi', 'vi'],
  ['th', 'th'],
  ['my', 'my'],
])

export function toSupportedLocale(lng: string | null | undefined): SupportedLocale | null {
  if (!lng) return null

  const normalized = lng.trim().replaceAll('_', '-')
  const lower = normalized.toLowerCase()

  if (lower === 'en' || lower.startsWith('en-')) return 'en'
  if (lower === 'ja' || lower.startsWith('ja-')) return 'ja'
  if (lower === 'ko' || lower.startsWith('ko-')) return 'ko'
  if (lower === 'zh-hans' || lower === 'zh-cn' || lower === 'zh-sg' || lower === 'zh-my') return 'zh-Hans'
  if (lower === 'zh-hant' || lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo') return 'zh-Hant'
  if (lower === 'zh' || lower.startsWith('zh-')) return 'zh-Hans'

  // Languages of the maimai DX International countries (meta#51), matched on the primary language subtag so any
  // region (ms-MY, ms-SG, en-MY…) resolves by language. `in` and `tl` are the legacy / ISO 639-1 tags browsers still send
  return PRIMARY_LANGUAGE_LOCALES.get(lower.split('-')[0]) ?? null
}

/**
 * The URL path prefix of each locale (meta#52). English has none: its pages keep the unprefixed URLs they ranked
 * with. Prefixes are lowercase (paths are case-sensitive); hreflang keeps the BCP-47 tag.
 */
export const LOCALE_PATH_PREFIXES: Record<Exclude<SupportedLocale, 'en'>, string> = {
  ja: 'ja',
  ko: 'ko',
  'zh-Hans': 'zh-hans',
  'zh-Hant': 'zh-hant',
  ms: 'ms',
  id: 'id',
  fil: 'fil',
  vi: 'vi',
  th: 'th',
  my: 'my',
}

const LOCALES_BY_PREFIX = new Map<string, SupportedLocale>(
  Object.entries(LOCALE_PATH_PREFIXES).map(([locale, prefix]) => [prefix, locale as SupportedLocale]),
)

/**
 * The locale a pathname's first segment names, and the pathname without it. Only the exact lowercase prefix counts:
 * `/JA/…`, `/zh-Hans/…` and `/en/…` are not pages; the server redirects them (setup/locale-redirect.ts).
 */
export function splitLocalePath(pathname: string): { locale: SupportedLocale; pathname: string } {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname)
  const locale = match ? LOCALES_BY_PREFIX.get(match[1]) : undefined
  if (!match || !locale) return { locale: DEFAULT_LOCALE, pathname }
  return { locale, pathname: match[2] || '/' }
}

/**
 * `path` (a pathname, optionally with its search and hash) as the given locale's URL: `/songs/x` → `/ja/songs/x`, and
 * `/` → `/ja`. English paths come back unchanged.
 */
export function localizePath(path: string, locale: SupportedLocale): string {
  if (locale === DEFAULT_LOCALE) return path
  const prefix = `/${LOCALE_PATH_PREFIXES[locale]}`
  if (path === '/' || path.startsWith('/?') || path.startsWith('/#')) return prefix + path.slice(1)
  return prefix + path
}

export function normalizeDetectedLanguage(lng: string) {
  return toSupportedLocale(lng) ?? DEFAULT_LOCALE
}

export function resolveSupportedLocale(candidates: string | readonly string[] | null | undefined) {
  const values = Array.isArray(candidates) ? candidates : candidates ? [candidates] : []

  for (const value of values) {
    const locale = toSupportedLocale(value)
    if (locale) return locale
  }

  return null
}

export function detectLocaleFromCookieHeader(cookieHeader: string | null) {
  return toSupportedLocale(parseCookie(cookieHeader ?? '')[LOCALE_COOKIE_NAME])
}

export function detectLocaleFromAcceptLanguage(acceptLanguage: string | null) {
  if (!acceptLanguage) return null

  const candidates = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [rawTag, ...params] = part.trim().split(';')
      const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='))

      return {
        index,
        tag: rawTag,
        quality: q ? Number(q.slice(2)) : 1,
      }
    })
    .filter(({ tag, quality }) => tag && Number.isFinite(quality) && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)

  return resolveSupportedLocale(candidates.map(({ tag }) => tag))
}

/**
 * The locale a page renders in: the one its URL path names (`/ja/…`), English without a prefix. The URL alone decides
 * it, so the server render, the edge HTML cache and hydration always agree. The visitor's preference (the cookie the
 * picker sets, then Accept-Language) only decides the redirect from an unprefixed URL (setup/locale-redirect.ts).
 */
export function detectServerLocale(request: Request): SupportedLocale {
  return splitLocalePath(new URL(request.url).pathname).locale
}

/** The visitor's preferred locale: the picker's cookie, then Accept-Language, then English */
export function negotiateLocale(request: Request): SupportedLocale {
  return (
    detectLocaleFromCookieHeader(request.headers.get('cookie')) ??
    detectLocaleFromAcceptLanguage(request.headers.get('accept-language')) ??
    DEFAULT_LOCALE
  )
}

export function persistClientLocalePreference(locale: SupportedLocale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // The cookie is enough for SSR when localStorage is unavailable.
  }

  document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(
    locale,
  )}; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`
}

export function appendVaryHeader(headers: Headers, value: string) {
  const existing = headers.get('Vary')
  if (!existing) {
    headers.set('Vary', value)
    return
  }

  const values = existing.split(',').map((part) => part.trim().toLowerCase())
  if (!values.includes(value.toLowerCase())) {
    headers.set('Vary', `${existing}, ${value}`)
  }
}