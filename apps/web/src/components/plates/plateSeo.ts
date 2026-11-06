import type { SupportedLocale } from '@/setup/locale'
import { createServerI18n } from '@/setup/init-i18n'
import { formatSeoTitle } from '@/utils/seo'
import { platePath } from './plateData'

const OG_LOCALES: Record<SupportedLocale, string> = {
  en: 'en_US',
  ja: 'ja_JP',
  ko: 'ko_KR',
  'zh-Hans': 'zh_CN',
  'zh-Hant': 'zh_TW',
}

const i18nCache = new Map<SupportedLocale, ReturnType<typeof createServerI18n>>()
const t = (locale: SupportedLocale, key: string, values?: Record<string, unknown>) => {
  let instance = i18nCache.get(locale)
  if (!instance) {
    instance = createServerI18n(locale)
    i18nCache.set(locale, instance)
  }
  return instance.t(key, values)
}

function collectionSeo(locale: SupportedLocale, path: string, rawTitle: string, description: string) {
  const title = formatSeoTitle(rawTitle)
  const url = `https://dxrating.net${path}`
  return {
    title,
    description,
    url,
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: OG_LOCALES[locale] },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ],
  }
}

const breadcrumb = (locale: SupportedLocale, url: string, leaf?: string) => ({
  '@type': 'BreadcrumbList',
  '@id': `${url}#breadcrumb`,
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'DXRating', item: 'https://dxrating.net/' },
    { '@type': 'ListItem', position: 2, name: t(locale, 'plates:breadcrumb'), item: 'https://dxrating.net/plates' },
    ...(leaf ? [{ '@type': 'ListItem', position: 3, name: leaf, item: url }] : []),
  ],
})

export function buildPlateIndexSeo(locale: SupportedLocale) {
  const seo = collectionSeo(
    locale,
    '/plates',
    t(locale, 'plates:index.seo-title'),
    t(locale, 'plates:index.seo-description'),
  )
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${seo.url}#webpage`,
        url: seo.url,
        name: t(locale, 'plates:index.title'),
        description: seo.description,
        inLanguage: locale,
        isPartOf: { '@id': 'https://dxrating.net/#website' },
        breadcrumb: { '@id': `${seo.url}#breadcrumb` },
      },
      breadcrumb(locale, seo.url),
    ],
  }
  return { ...seo, structuredData }
}

export function buildPlatePageSeo(
  locale: SupportedLocale,
  page: { plateId: string; name: string; charts: number; sheets: number; versions: string },
) {
  const values = { plate: page.name, charts: page.charts, sheets: page.sheets, versions: page.versions }
  const seo = collectionSeo(
    locale,
    platePath(page.plateId),
    t(locale, 'plates:seo-title', values),
    t(locale, 'plates:seo-description', values),
  )
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${seo.url}#webpage`,
        url: seo.url,
        name: t(locale, 'plates:title', values),
        description: seo.description,
        inLanguage: locale,
        isPartOf: { '@id': 'https://dxrating.net/#website' },
        breadcrumb: { '@id': `${seo.url}#breadcrumb` },
      },
      breadcrumb(locale, seo.url, page.name),
    ],
  }
  return { ...seo, structuredData }
}