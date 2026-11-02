import { ServerEnum, TypeEnum, type DifficultyEnum, type NoteCounts, type Sheet, type Song } from '@gekichumai/dxdata'
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

type StructuredDataSong = Pick<Song, 'artist' | 'bpm' | 'category' | 'id' | 'imageName' | 'title'>

type StructuredDataSheet = Pick<
  Sheet,
  | 'difficulty'
  | 'internalLevelValue'
  | 'level'
  | 'noteCounts'
  | 'noteDesigner'
  | 'serverIds'
  | 'releaseDate'
  | 'type'
  | 'version'
>

const OG_LOCALES: Record<SupportedLocale, string> = {
  en: 'en_US',
  ja: 'ja_JP',
  ko: 'ko_KR',
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
      { property: 'og:url', content: 'https://dxrating.net/' },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: OG_LOCALES[locale] },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ] satisfies SeoMeta[],
  }
}

export function buildDevelopersSeo(locale: SupportedLocale) {
  const title = formatSeoTitle(t(locale, 'developers:seo-title'))
  const description = t(locale, 'developers:seo-description')

  return {
    title,
    description,
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: 'https://dxrating.net/developers' },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: OG_LOCALES[locale] },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ] satisfies SeoMeta[],
  }
}

export function buildRecentChartsSeo(locale: SupportedLocale) {
  const title = formatSeoTitle(t(locale, 'root:pages.recent.seo-title'))
  const description = t(locale, 'root:pages.recent.seo-description')

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
  }
}

export function buildTrendingChartsSeo(locale: SupportedLocale) {
  const title = formatSeoTitle(t(locale, 'root:pages.trending.seo-title'))
  const description = t(locale, 'root:pages.trending.seo-description')

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
  }
}

export function buildRatingSeo(locale: SupportedLocale) {
  const title = formatSeoTitle(t(locale, 'root:pages.rating.seo-title'))
  const description = t(locale, 'root:pages.rating.seo-description')
  const url = 'https://dxrating.net/rating'

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${url}#app`,
        name: t(locale, 'root:pages.rating.seo-title'),
        description,
        url,
        applicationCategory: 'GameApplication',
        operatingSystem: 'Any',
        inLanguage: locale,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        isPartOf: { '@id': 'https://dxrating.net/#website' },
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        inLanguage: locale,
        // Mirrors the visible FAQ in RatingExplainer
        mainEntity: ['1', '2', '3', '4'].map((key) => ({
          '@type': 'Question',
          name: t(locale, `rating-explainer:faq.q${key}`),
          acceptedAnswer: { '@type': 'Answer', text: t(locale, `rating-explainer:faq.a${key}`) },
        })),
      },
    ],
  }

  return {
    title,
    description,
    structuredData,
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
    ] satisfies SeoMeta[],
  }
}

type SongSheetSeoSheet = {
  type: TypeEnum
  difficulty: DifficultyEnum | string
} & Partial<Pick<Sheet, 'internalLevelValue' | 'level' | 'noteCounts' | 'noteDesigner' | 'version'>>

const formatConstant = (sheet: SongSheetSeoSheet) =>
  sheet.internalLevelValue && sheet.internalLevelValue > 0 ? sheet.internalLevelValue.toFixed(1) : null

/**
 * Chart page titles lead with what people search for: the song, the chart and its internal level (譜面定数).
 * Sheets without level data (tests, partial catalog slices) keep the plain `<title> [<chart>]` form.
 */
function buildSongSheetTitle(song: { title: string }, sheet: SongSheetSeoSheet, locale: SupportedLocale) {
  if (!sheet.level) return getSheetPageTitle(song, sheet, locale)

  const constant = formatConstant(sheet)
  const values = { title: song.title, sheetLabel: getSheetTitleLabel(sheet, locale), level: sheet.level, constant }
  return t(locale, constant ? 'song:seo.title' : 'song:seo.title-no-constant', values)
}

function buildSongSheetDescription(
  song: { title: string; artist: string; bpm?: number | null },
  sheet: SongSheetSeoSheet,
  sheetLabel: string,
  locale: SupportedLocale,
) {
  if (!sheet.level) {
    return t(locale, 'song:seo.description-basic', { title: song.title, artist: song.artist, sheetLabel })
  }

  const constant = formatConstant(sheet)
  const facts = [
    constant && t(locale, 'song:seo.fact.constant', { value: constant }),
    sheet.noteCounts?.total &&
      t(locale, 'song:seo.fact.notes', { value: sheet.noteCounts.total.toLocaleString('en-US') }),
    song.bpm && t(locale, 'song:seo.fact.bpm', { value: song.bpm }),
    sheet.noteDesigner &&
      sheet.noteDesigner !== '-' &&
      t(locale, 'song:seo.fact.designer', { value: sheet.noteDesigner }),
    sheet.version && t(locale, 'song:seo.fact.version', { value: sheet.version }),
  ].filter(Boolean)

  return t(locale, 'song:seo.description', {
    title: song.title,
    artist: song.artist,
    sheetLabel,
    level: sheet.level,
    facts: facts.join(t(locale, 'song:seo.fact-separator')),
  })
}

export function buildSongSheetSeo(
  song: {
    title: string
    artist: string
    category: string
    imageName: string
    id: string
    bpm?: number | null
  },
  sheet: {
    type: TypeEnum
    difficulty: DifficultyEnum | string
  } & Partial<Pick<Sheet, 'internalLevelValue' | 'level' | 'noteCounts' | 'noteDesigner' | 'version'>>,
  locale: SupportedLocale,
) {
  const sheetLabel = getSheetTitleLabel(sheet, locale)
  const title = buildSongSheetTitle(song, sheet, locale)
  const description = buildSongSheetDescription(song, sheet, sheetLabel, locale)
  const image = `https://shama.dxrating.net/images/cover/v2/${song.imageName}.jpg`
  const socialImage = buildChartOgImageUrl({
    songId: song.id,
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
      songId: song.id,
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

const regionProperties = (serverIds: readonly ServerEnum[]) => [
  propertyValue('Japan availability', serverIds.includes(ServerEnum.JP)),
  propertyValue('International availability', serverIds.includes(ServerEnum.INTL)),
  propertyValue('China availability', serverIds.includes(ServerEnum.CN)),
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
    ...regionProperties(sheet.serverIds),
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
        target: 'https://dxrating.net/?q={search_term_string}',
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
          name: `${song.title} ${sheetLabel}`,
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
      '@type': 'MusicRecording',
      '@id': songId,
      name: song.title,
      byArtist: {
        '@type': 'MusicGroup',
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
      identifier: `${song.id}:${sheet.type}:${sheet.difficulty}`,
      image: seo.socialImage,
      inLanguage: locale,
      datePublished: sheet.releaseDate,
      about: { '@id': songId },
      isPartOf: { '@id': pageId },
      measurementTechnique: 'maimai DX chart metadata',
      creator: { '@type': 'Organization', name: 'DXRating', url: 'https://dxrating.net' },
      additionalProperty,
    },
  ]

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  }
}
const buildCollectionSeo = (locale: SupportedLocale, path: string, rawTitle: string, description: string) => {
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
    ] satisfies SeoMeta[],
  }
}

export function buildConstantTableIndexSeo(locale: SupportedLocale) {
  return buildCollectionSeo(
    locale,
    '/constants',
    t(locale, 'constants:index.seo-title'),
    t(locale, 'constants:index.seo-description'),
  )
}

export function buildConstantTableSeo(
  locale: SupportedLocale,
  table: { level: string; path: string; count: number; min: string; max: string },
) {
  const values = { level: table.level, count: table.count, min: table.min, max: table.max }
  const seo = buildCollectionSeo(
    locale,
    table.path,
    t(locale, 'constants:seo-title', values),
    t(locale, 'constants:seo-description', values),
  )

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${seo.url}#webpage`,
        url: seo.url,
        name: t(locale, 'constants:title', values),
        description: seo.description,
        inLanguage: locale,
        isPartOf: { '@id': 'https://dxrating.net/#website' },
        breadcrumb: { '@id': `${seo.url}#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${seo.url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'DXRating', item: 'https://dxrating.net/' },
          {
            '@type': 'ListItem',
            position: 2,
            name: t(locale, 'constants:breadcrumb'),
            item: 'https://dxrating.net/constants',
          },
          { '@type': 'ListItem', position: 3, name: `Lv.${table.level}`, item: seo.url },
        ],
      },
    ],
  }

  return { ...seo, structuredData }
}