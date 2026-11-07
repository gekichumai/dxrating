import type { SupportedLocale } from '@/setup/locale'
import { m } from '@/paraglide/messages'
import { formatSeoTitle } from '@/utils/seo'
import { platePath } from './plateData'

const OG_LOCALES: Record<SupportedLocale, string> = {
  en: 'en_US',
  ja: 'ja_JP',
  ko: 'ko_KR',
  'zh-Hans': 'zh_CN',
  'zh-Hant': 'zh_TW',
  ms: 'ms_MY',
  id: 'id_ID',
  fil: 'fil_PH',
  vi: 'vi_VN',
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
    {
      '@type': 'ListItem',
      position: 2,
      name: m.plates_breadcrumb({}, { locale }),
      item: 'https://dxrating.net/plates',
    },
    ...(leaf ? [{ '@type': 'ListItem', position: 3, name: leaf, item: url }] : []),
  ],
})

export function buildPlateIndexSeo(locale: SupportedLocale) {
  const seo = collectionSeo(
    locale,
    '/plates',
    m.plates_index_seoTitle({}, { locale }),
    m.plates_index_seoDescription({}, { locale }),
  )
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${seo.url}#webpage`,
        url: seo.url,
        name: m.plates_index_title({}, { locale }),
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
    m.plates_seoTitle(values, { locale }),
    m.plates_seoDescription(values, { locale }),
  )
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${seo.url}#webpage`,
        url: seo.url,
        name: m.plates_title(values, { locale }),
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