import { TypeEnum, type DifficultyEnum, type NoteCounts, type Regions, type Sheet, type Song } from '@gekichumai/dxdata'
import type { SupportedLocale } from '@/setup/locale'
import { DEFAULT_LOCALE, toSupportedLocale } from '@/setup/locale'
import { createServerI18n } from '@/setup/init-i18n'
import { buildSheetLink } from '@/components/sheet/sheetLinks'
import { getSheetPageTitle, getSheetTitleLabel, getSheetTypeDisplayName } from '@/components/song/sheetDisplay'
import { buildChartOgImageAlt, buildChartOgImageUrl } from '@/routes/-chart-og-meta'

type SeoMeta =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { charSet: string }

type SeoRouteMatch = {
  context?: unknown
  search?: unknown
}

type JsonLdNode = Record<string, unknown>

type StructuredDataSong = Pick<Song, 'artist' | 'bpm' | 'category' | 'imageName' | 'songId' | 'title'>

type StructuredDataSheet = Pick<
  Sheet,
  | 'difficulty'
  | 'internalLevelValue'
  | 'level'
  | 'noteCounts'
  | 'noteDesigner'
  | 'regions'
  | 'releaseDate'
  | 'type'
  | 'version'
>

const OG_LOCALES: Record<SupportedLocale, string> = {
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

function t(locale: SupportedLocale, key: string, values?: Record<string, unknown>) {
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
  const description = t(locale, 'root:seo.description')

  return [
    ...(includeTitle ? [{ title }] : []),
    { name: 'description', content: description },
    { name: 'keywords', content: t(locale, 'root:seo.keywords') },
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
  const title = formatSeoTitle(t(locale, 'root:pages.search.seo-title'))
  const description = t(locale, 'root:pages.search.seo-description')

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

export function buildRatingSeo(locale: SupportedLocale) {
  const title = formatSeoTitle(t(locale, 'root:pages.rating.seo-title'))
  const description = t(locale, 'root:pages.rating.seo-description')

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

export function buildSongSheetSeo(
  song: {
    title: string
    artist: string
    category: string
    imageName: string
    songId: string
  },
  sheet: {
    type: TypeEnum
    difficulty: DifficultyEnum | string
  },
  locale: SupportedLocale,
) {
  const sheetLabel = getSheetTitleLabel(sheet, locale)
  const title = getSheetPageTitle(song, sheet, locale)
  const description = t(locale, 'song:seo.description', {
    title: song.title,
    artist: song.artist,
    sheetLabel,
  })
  const image = `https://shama.dxrating.net/images/cover/v2/${song.imageName}.jpg`
  const socialImage = buildChartOgImageUrl({
    songId: song.songId,
    type: sheet.type,
    difficulty: sheet.difficulty,
  })
  const socialImageAlt = buildChartOgImageAlt({
    title: song.title,
    artist: song.artist,
    type: sheet.type,
    difficulty: sheet.difficulty,
  })
  const url = buildSheetLink(
    {
      songId: song.songId,
      type: sheet.type,
      difficulty: sheet.difficulty,
    },
    'https://dxrating.net',
  )

  return {
    title,
    sheetLabel,
    description,
    image,
    socialImage,
    socialImageAlt,
    url,
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:image', content: socialImage },
      { property: 'og:image:secure_url', content: socialImage },
      { property: 'og:image:type', content: 'image/png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: socialImageAlt },
      { property: 'og:url', content: url },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: OG_LOCALES[locale] },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: socialImage },
      { name: 'twitter:image:alt', content: socialImageAlt },
    ] satisfies SeoMeta[],
    links: [{ rel: 'canonical', href: url }],
  }
}

const propertyValue = (name: string, value: unknown): JsonLdNode | null => {
  if (value === null || value === undefined || value === '') return null

  return {
    '@type': 'PropertyValue',
    name,
    value,
  }
}

const noteCountProperties = (noteCounts: NoteCounts) =>
  [
    propertyValue('Tap notes', noteCounts.tap),
    propertyValue('Hold notes', noteCounts.hold),
    propertyValue('Slide notes', noteCounts.slide),
    propertyValue('Touch notes', noteCounts.touch),
    propertyValue('Break notes', noteCounts.break),
    propertyValue('Total notes', noteCounts.total),
  ].filter((property): property is JsonLdNode => property !== null)

const regionProperties = (regions: Regions) => [
  propertyValue('Japan availability', regions.jp),
  propertyValue('International availability', regions.intl),
  propertyValue('China availability', regions.cn),
]

export function buildSongSheetStructuredData(
  song: StructuredDataSong,
  sheet: StructuredDataSheet,
  locale: SupportedLocale,
) {
  const seo = buildSongSheetSeo(song, sheet, locale)
  const sheetLabel = getSheetTitleLabel(sheet, locale)
  const typeLabel = getSheetTypeDisplayName(sheet.type, locale)
  const difficultyLabel = String(sheet.difficulty).toUpperCase()
  const chartUrl = seo.url
  const websiteId = 'https://dxrating.net/#website'
  const breadcrumbId = `${chartUrl}#breadcrumb`
  const pageId = `${chartUrl}#webpage`
  const songId = `${chartUrl}#song`
  const chartId = `${chartUrl}#chart`

  const additionalProperty = [
    propertyValue('Chart type', typeLabel),
    propertyValue('Difficulty', difficultyLabel),
    propertyValue('Level', sheet.level),
    propertyValue('Internal level', sheet.internalLevelValue),
    propertyValue('BPM', song.bpm),
    propertyValue('Chart designer', sheet.noteDesigner),
    propertyValue('Release date', sheet.releaseDate),
    propertyValue('Version', sheet.version),
    ...noteCountProperties(sheet.noteCounts),
    ...regionProperties(sheet.regions),
  ].filter((property): property is JsonLdNode => property !== null)

  const graph: JsonLdNode[] = [
    {
      '@type': 'WebSite',
      '@id': websiteId,
      name: 'DXRating',
      url: 'https://dxrating.net',
      inLanguage: locale,
      potentialAction: {
        '@type': 'SearchAction',
        target: 'https://dxrating.net/search?q={search_term_string}',
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': breadcrumbId,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'DXRating',
          item: 'https://dxrating.net/',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Charts & Songs',
          item: 'https://dxrating.net/search',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: seo.title,
          item: chartUrl,
        },
      ],
    },
    {
      '@type': 'WebPage',
      '@id': pageId,
      url: chartUrl,
      name: seo.title,
      description: seo.description,
      image: seo.socialImage,
      inLanguage: locale,
      isPartOf: { '@id': websiteId },
      breadcrumb: { '@id': breadcrumbId },
      mainEntity: { '@id': chartId },
    },
    {
      '@type': 'MusicComposition',
      '@id': songId,
      name: song.title,
      composer: {
        '@type': 'Person',
        name: song.artist,
      },
      image: `https://shama.dxrating.net/images/cover/v2/${song.imageName}.jpg`,
      url: chartUrl,
      genre: song.category,
      inLanguage: locale,
      isPartOf: {
        '@id': websiteId,
      },
    },
    {
      '@type': 'Dataset',
      '@id': chartId,
      name: `${song.title} ${sheetLabel} chart`,
      description: seo.description,
      url: chartUrl,
      identifier: `${song.songId}:${sheet.type}:${sheet.difficulty}`,
      image: seo.socialImage,
      inLanguage: locale,
      datePublished: sheet.releaseDate,
      about: { '@id': songId },
      isPartOf: { '@id': pageId },
      measurementTechnique: 'maimai DX chart metadata',
      additionalProperty,
    },
  ]

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  }
}