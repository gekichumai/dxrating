import type { DetectorOptions } from 'i18next-browser-languagedetector'
import { parseCookieHeader } from '@/utils/cookies'

export const SUPPORTED_LOCALES = ['en', 'ja', 'zh-Hans', 'zh-Hant'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: SupportedLocale = 'en'
export const LOCALE_QUERY_PARAM = 'locale'
export const LOCALE_COOKIE_NAME = 'dxrating.locale'
export const LOCALE_STORAGE_KEY = 'dxrating-locale'
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export function toSupportedLocale(lng: string | null | undefined): SupportedLocale | null {
  if (!lng) return null

  const normalized = lng.trim().replaceAll('_', '-')
  const lower = normalized.toLowerCase()

  if (lower === 'en' || lower.startsWith('en-')) return 'en'
  if (lower === 'ja' || lower.startsWith('ja-')) return 'ja'
  if (lower === 'zh-hans' || lower === 'zh-cn' || lower === 'zh-sg' || lower === 'zh-my') return 'zh-Hans'
  if (lower === 'zh-hant' || lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-mo') return 'zh-Hant'
  if (lower === 'zh' || lower.startsWith('zh-')) return 'zh-Hans'

  return null
}

export function normalizeDetectedLanguage(lng: string) {
  return toSupportedLocale(lng) ?? DEFAULT_LOCALE
}

export function convertDetectedLanguage(lng: string) {
  return toSupportedLocale(lng) ?? lng
}

export function resolveSupportedLocale(candidates: string | readonly string[] | null | undefined) {
  const values = Array.isArray(candidates) ? candidates : candidates ? [candidates] : []

  for (const value of values) {
    const locale = toSupportedLocale(value)
    if (locale) return locale
  }

  return null
}

function detectLocaleFromCookieHeader(cookieHeader: string | null) {
  return toSupportedLocale(parseCookieHeader(cookieHeader)[LOCALE_COOKIE_NAME])
}

function detectLocaleFromAcceptLanguage(acceptLanguage: string | null) {
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

export function detectServerLocale(request: Request): SupportedLocale {
  const url = new URL(request.url)

  return (
    toSupportedLocale(url.searchParams.get(LOCALE_QUERY_PARAM)) ??
    detectLocaleFromCookieHeader(request.headers.get('cookie')) ??
    detectLocaleFromAcceptLanguage(request.headers.get('accept-language')) ??
    DEFAULT_LOCALE
  )
}

export function getClientLanguageDetectionOptions(): DetectorOptions {
  return {
    order: ['querystring', 'cookie', 'htmlTag', 'localStorage', 'sessionStorage', 'navigator'],
    lookupQuerystring: LOCALE_QUERY_PARAM,
    lookupLocalStorage: LOCALE_STORAGE_KEY,
    lookupSessionStorage: LOCALE_STORAGE_KEY,
    lookupCookie: LOCALE_COOKIE_NAME,
    caches: [],
    excludeCacheFor: ['cimode'],
    cookieOptions: {
      path: '/',
      sameSite: 'lax',
      maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    },
    convertDetectedLanguage,
  }
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