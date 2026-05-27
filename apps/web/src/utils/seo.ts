import type { SupportedLocale } from '@/setup/locale'
import { DEFAULT_LOCALE, toSupportedLocale } from '@/setup/locale'
import { createServerI18n } from '@/setup/init-i18n'

export type SeoMeta =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { charSet: string }

type SeoRouteMatch = {
  context?: unknown
  search?: unknown
}

export type JsonLdNode = Record<string, unknown>

export const OG_LOCALES: Record<SupportedLocale, string> = {
  en: 'en_US',
  ja: 'ja_JP',
  'zh-Hans': 'zh_CN',
  'zh-Hant': 'zh_TW',
}

const i18nCache = new Map<SupportedLocale, ReturnType<typeof createServerI18n>>()

function getSeoI18n(locale: SupportedLocale) {
  const cached = i18nCache.get(locale)
  if (cached) return cached

  const instance = createServerI18n(locale)
  i18nCache.set(locale, instance)
  return instance
}

export function translateSeo(locale: SupportedLocale, key: string, values?: Record<string, unknown>) {
  return getSeoI18n(locale).t(key, values)
}

function readLocaleFromContext(context: unknown): SupportedLocale | null {
  if (typeof context !== 'object' || context === null) return null

  const record = context as Record<string, unknown>
  return toSupportedLocale(record.locale as string | undefined) ?? readLocaleFromContext(record.serverContext)
}

function readLocaleFromSearch(search: unknown): SupportedLocale | null {
  if (typeof search !== 'object' || search === null) return null

  return toSupportedLocale((search as Record<string, unknown>).locale as string | undefined)
}

export function resolveSeoLocale(matches?: readonly SeoRouteMatch[]): SupportedLocale {
  for (const match of [...(matches ?? [])].reverse()) {
    const locale = readLocaleFromContext(match.context) ?? readLocaleFromSearch(match.search)
    if (locale) return locale
  }

  if (typeof document !== 'undefined') {
    return toSupportedLocale(document.documentElement.lang) ?? DEFAULT_LOCALE
  }

  return DEFAULT_LOCALE
}

export function formatSeoTitle(title: string) {
  return `${title} - DXRating`
}

export function buildRootSeoMeta(locale: SupportedLocale, options: { includeTitle?: boolean } = {}): SeoMeta[] {
  const includeTitle = options.includeTitle ?? true
  const title = 'DXRating'
  const description = translateSeo(locale, 'root:seo.description')

  return [
    ...(includeTitle ? [{ title }] : []),
    { name: 'description', content: description },
    { name: 'keywords', content: translateSeo(locale, 'root:seo.keywords') },
    { property: 'og:site_name', content: 'DXRating' },
    { property: 'og:locale', content: OG_LOCALES[locale] },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    {
      property: 'og:image',
      content: 'https://shama.dxrating.net/favicon/pack/v1/apple-touch-icon.png',
    },
    { property: 'og:url', content: 'https://dxrating.net' },
    { name: 'twitter:card', content: 'summary' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
  ]
}

export function buildSearchSeo(locale: SupportedLocale) {
  const title = formatSeoTitle(translateSeo(locale, 'root:pages.search.seo-title'))
  const description = translateSeo(locale, 'root:pages.search.seo-description')

  return {
    title,
    description,
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: 'https://dxrating.net/search' },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: OG_LOCALES[locale] },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ] satisfies SeoMeta[],
    links: [{ rel: 'canonical', href: 'https://dxrating.net/search' }],
  }
}

export function buildRecentChartsSeo(locale: SupportedLocale) {
  const title = formatSeoTitle(translateSeo(locale, 'root:pages.recent.seo-title'))
  const description = translateSeo(locale, 'root:pages.recent.seo-description')

  return {
    title,
    description,
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: 'https://dxrating.net/charts/recent' },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: OG_LOCALES[locale] },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ] satisfies SeoMeta[],
    links: [{ rel: 'canonical', href: 'https://dxrating.net/charts/recent' }],
  }
}

export function buildTrendingChartsSeo(locale: SupportedLocale) {
  const title = formatSeoTitle(translateSeo(locale, 'root:pages.trending.seo-title'))
  const description = translateSeo(locale, 'root:pages.trending.seo-description')

  return {
    title,
    description,
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: 'https://dxrating.net/charts/trending' },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: OG_LOCALES[locale] },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ] satisfies SeoMeta[],
    links: [{ rel: 'canonical', href: 'https://dxrating.net/charts/trending' }],
  }
}

export function buildRatingSeo(locale: SupportedLocale) {
  const title = formatSeoTitle(translateSeo(locale, 'root:pages.rating.seo-title'))
  const description = translateSeo(locale, 'root:pages.rating.seo-description')

  return {
    title,
    description,
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: 'https://dxrating.net/rating' },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: OG_LOCALES[locale] },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ] satisfies SeoMeta[],
    links: [{ rel: 'canonical', href: 'https://dxrating.net/rating' }],
  }
}
