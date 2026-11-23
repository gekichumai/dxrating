import {
  coverUrl,
  DifficultyEnum,
  ServerEnum,
  TypeEnum,
  type NoteCounts,
  type Sheet,
  type Song,
} from '@gekichumai/dxdata'
import type { SupportedLocale } from '@/setup/locale'
import { DEFAULT_LOCALE, localizePath, toSupportedLocale } from '@/setup/locale'
import type { PlainMessage } from '@/i18n/message'
import { m } from '@/paraglide/messages'
import { buildSheetPath, buildSheetTolerancePath, songHubPath } from '@/components/sheet/sheetLinks'
import { getSheetPageTitle, getSheetTitleLabel, getSheetTypeDisplayName } from '@/components/song/sheetDisplay'
import {
  buildChartOgImageAlt,
  buildChartOgImageUrl,
  buildSongOgImageAlt,
  buildSongOgImageUrl,
} from '@/routes/-chart-og-meta'

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

type StructuredDataSong = Pick<Song, 'artist' | 'bpm' | 'category' | 'id' | 'imageName' | 'title'> &
  Partial<Pick<Song, 'searchAcronyms'>>

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

/**
 * A page's absolute URL in a language: `/rating` → `https://dxrating.net/ja/rating` (English has no prefix). Canonical,
 * og:url and structured data name the language variant the page is, never the unprefixed URL of another language.
 */
export const siteUrl = (path: string, locale: SupportedLocale) => `https://dxrating.net${localizePath(path, locale)}`

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
  th: 'th_TH',
  my: 'my_MM',
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

/**
 * The page language for a head function, called as `resolveSeoLocale([match, ...matches])`. The head's own `match` is
 * this navigation's, with the merged context; `matches` can still be the previous navigation's snapshot, so after a
 * language switch or Back/Forward between languages they name the old one. The first entry wins, then the deepest of
 * the rest.
 */
export function resolveSeoLocale(matches?: readonly SeoRouteMatch[]): SupportedLocale {
  const [current, ...rest] = matches ?? []
  for (const match of current ? [current, ...rest.reverse()] : []) {
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

// Routes whose head sets the full page title themselves
const SELF_TITLED_ROUTE_IDS = new Set(['/songs/$songId/$type/$difficulty', '/songs_/$songId'])

type RootHeadMatch = { routeId?: unknown; status?: string; globalNotFound?: boolean }

/**
 * The root head's title and robots state. A 404 (no route matched, or a loader threw notFound()) renders at the root,
 * so the root gives it the not-found title and `noindex`. A loader's notFound() marks only the finalized root `match`:
 * `matches` is the array from before loading. Self-titled routes own the title only of a page that rendered.
 */
export function resolveRootHeadState(match: RootHeadMatch, matches: readonly RootHeadMatch[]) {
  const isNotFound = [match, ...matches].some((m) => m.status === 'notFound' || m.globalNotFound === true)
  const includeRootTitle = !isNotFound && !matches.some((m) => SELF_TITLED_ROUTE_IDS.has(String(m.routeId)))
  return { isNotFound, includeRootTitle }
}

/** The not-found page's title and `noindex` */
export function buildNotFoundSeoMeta(locale: SupportedLocale): SeoMeta[] {
  return [{ title: formatSeoTitle(m.root_notFound_title({}, { locale })) }, { name: 'robots', content: 'noindex' }]
}

export function buildRootSeoMeta(locale: SupportedLocale, options: { includeTitle?: boolean } = {}): SeoMeta[] {
  const includeTitle = options.includeTitle ?? true
  const title = 'DXRating'
  const description = m.root_seo_description({}, { locale })

  return [
    ...(includeTitle ? [{ title }] : []),
    { name: 'description', content: description },
    { name: 'keywords', content: m.root_seo_keywords({}, { locale }) },
    { property: 'og:site_name', content: 'DXRating' },
    { property: 'og:locale', content: OG_LOCALES[locale] },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    {
      property: 'og:image',
      content: 'https://shama.dxrating.net/favicon/pack/v1/apple-touch-icon.png',
    },
    { property: 'og:url', content: siteUrl('/', locale) },
    { name: 'twitter:card', content: 'summary' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
  ]
}

export function buildSearchSeo(locale: SupportedLocale) {
  const title = formatSeoTitle(m.root_pages_search_seoTitle({}, { locale }))
  const description = m.root_pages_search_seoDescription({}, { locale })

  return {
    title,
    description,
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: siteUrl('/', locale) },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: OG_LOCALES[locale] },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ] satisfies SeoMeta[],
  }
}

export function buildDevelopersSeo(locale: SupportedLocale) {
  const title = formatSeoTitle(m.developers_seoTitle({}, { locale }))
  const description = m.developers_seoDescription({}, { locale })

  return {
    title,
    description,
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: siteUrl('/developers', locale) },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: OG_LOCALES[locale] },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ] satisfies SeoMeta[],
  }
}

export function buildRecentChartsSeo(locale: SupportedLocale) {
  const title = formatSeoTitle(m.root_pages_recent_seoTitle({}, { locale }))
  const description = m.root_pages_recent_seoDescription({}, { locale })

  return {
    title,
    description,
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: siteUrl('/charts/recent', locale) },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: OG_LOCALES[locale] },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ] satisfies SeoMeta[],
  }
}

export function buildTrendingChartsSeo(locale: SupportedLocale) {
  const title = formatSeoTitle(m.root_pages_trending_seoTitle({}, { locale }))
  const description = m.root_pages_trending_seoDescription({}, { locale })

  return {
    title,
    description,
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: siteUrl('/charts/trending', locale) },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: OG_LOCALES[locale] },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ] satisfies SeoMeta[],
  }
}

const RATING_FAQ: { question: PlainMessage; answer: PlainMessage }[] = [
  { question: m.ratingExplainer_faq_q1, answer: m.ratingExplainer_faq_a1 },
  { question: m.ratingExplainer_faq_q2, answer: m.ratingExplainer_faq_a2 },
  { question: m.ratingExplainer_faq_q3, answer: m.ratingExplainer_faq_a3 },
  { question: m.ratingExplainer_faq_q4, answer: m.ratingExplainer_faq_a4 },
]

export function buildRatingSeo(locale: SupportedLocale) {
  const title = formatSeoTitle(m.root_pages_rating_seoTitle({}, { locale }))
  const description = m.root_pages_rating_seoDescription({}, { locale })
  const url = siteUrl('/rating', locale)

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${url}#app`,
        name: m.root_pages_rating_seoTitle({}, { locale }),
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
        mainEntity: RATING_FAQ.map(({ question, answer }) => ({
          '@type': 'Question',
          name: question({}, { locale }),
          acceptedAnswer: { '@type': 'Answer', text: answer({}, { locale }) },
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

export type SongSheetSeoSheet = {
  type: TypeEnum
  difficulty: DifficultyEnum | string
} & Partial<Pick<Sheet, 'internalLevelValue' | 'level' | 'noteCounts' | 'noteDesigner' | 'version'>>

const formatConstant = (sheet: SongSheetSeoSheet) =>
  sheet.internalLevelValue && sheet.internalLevelValue > 0 ? sheet.internalLevelValue.toFixed(1) : null

/**
 * Chart page titles lead with what people search for: the song, the chart and its internal level (譜面定数).
 * Sheets without level data (tests, partial catalog slices) keep the plain `<title> [<chart>]` form.
 */
export function buildSongSheetTitle(song: { title: string }, sheet: SongSheetSeoSheet, locale: SupportedLocale) {
  if (!sheet.level) return getSheetPageTitle(song, sheet, locale)

  const constant = formatConstant(sheet)
  const values = { title: song.title, sheetLabel: getSheetTitleLabel(sheet, locale), level: sheet.level, constant }
  return constant
    ? m.song_seo_title({ ...values, constant }, { locale })
    : m.song_seo_titleNoConstant(values, { locale })
}

function buildSongSheetDescription(
  song: { title: string; artist: string; bpm?: number | null },
  sheet: SongSheetSeoSheet,
  sheetLabel: string,
  locale: SupportedLocale,
) {
  if (!sheet.level) {
    return m.song_seo_descriptionBasic({ title: song.title, artist: song.artist, sheetLabel }, { locale })
  }

  const constant = formatConstant(sheet)
  const facts = [
    constant && m.song_seo_fact_constant({ value: constant }, { locale }),
    sheet.noteCounts?.total &&
      m.song_seo_fact_notes({ value: sheet.noteCounts.total.toLocaleString('en-US') }, { locale }),
    song.bpm && m.song_seo_fact_bpm({ value: song.bpm }, { locale }),
    sheet.noteDesigner &&
      sheet.noteDesigner !== '-' &&
      m.song_seo_fact_designer({ value: sheet.noteDesigner }, { locale }),
    sheet.version && m.song_seo_fact_version({ value: sheet.version }, { locale }),
  ].filter(Boolean)

  return m.song_seo_description(
    {
      title: song.title,
      artist: song.artist,
      sheetLabel,
      level: sheet.level,
      facts: facts.join(m.song_seo_factSeparator({}, { locale })),
    },
    { locale },
  )
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
  const image = coverUrl(song.id)
  const socialImage = buildChartOgImageUrl({
    songId: song.id,
    type: sheet.type,
    difficulty: sheet.difficulty,
    locale,
  })
  const socialImageAlt = buildChartOgImageAlt({
    title: song.title,
    artist: song.artist,
    type: sheet.type,
    difficulty: sheet.difficulty,
  })
  const url = siteUrl(buildSheetPath({ songId: song.id, type: sheet.type, difficulty: sheet.difficulty }), locale)

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

const songHubUrl = (songId: string, locale: SupportedLocale) => siteUrl(songHubPath(songId), locale)

type SongHubSeoSheet = Pick<SongSheetSeoSheet, 'type' | 'difficulty' | 'level' | 'internalLevelValue'>

type SongHubSeoSong = Pick<Song, 'artist' | 'category' | 'id' | 'imageName' | 'title'> & {
  bpm?: number | null
  aliases?: readonly string[]
  sheets?: readonly SongHubSeoSheet[]
}

// The charts a song page's description names: the hardest ones, which players look up, in each chart type
const SONG_HUB_SUMMARY_TYPES = [TypeEnum.DX, TypeEnum.STD] as const
const SONG_HUB_SUMMARY_DIFFICULTIES: readonly string[] = [DifficultyEnum.Master, DifficultyEnum.ReMaster]

/** `DX MASTER 13+ (13.7)` for each MASTER and Re:MASTER chart, DX first */
const songHubLevelFacts = (sheets: readonly SongHubSeoSheet[], locale: SupportedLocale) =>
  SONG_HUB_SUMMARY_TYPES.flatMap((type) =>
    SONG_HUB_SUMMARY_DIFFICULTIES.flatMap((difficulty) => {
      const sheet = sheets.find((s) => s.type === type && s.difficulty === difficulty)
      if (!sheet?.level) return []
      const constant = formatConstant(sheet)
      return [`${getSheetTitleLabel(sheet, locale)} ${sheet.level}${constant ? ` (${constant})` : ''}`]
    }),
  )

/**
 * Song page titles lead with what people search for: the song name and "maimai" (meta: GSC, 11/01–11/07). The artist
 * tells songs of the same name apart. The BPM is a smaller share of searches and goes in the description.
 */
export function buildSongHubTitle(song: { title: string; artist: string }, locale: SupportedLocale) {
  return m.song_seo_hubTitle({ title: song.title, artist: song.artist }, { locale })
}

/** The levels (with internal levels) of the hardest charts, then the BPM */
export function buildSongHubDescription(
  song: { title: string; artist: string; bpm?: number | null; sheets?: readonly SongHubSeoSheet[] },
  locale: SupportedLocale,
) {
  const facts = [
    ...songHubLevelFacts(song.sheets ?? [], locale),
    ...(song.bpm ? [m.song_seo_fact_bpm({ value: song.bpm }, { locale })] : []),
  ]
  const values = { title: song.title, artist: song.artist }
  return facts.length
    ? m.song_seo_hubDescription({ ...values, facts: facts.join(m.song_seo_factSeparator({}, { locale })) }, { locale })
    : m.song_seo_hubDescriptionBasic(values, { locale })
}

export function buildSongHubSeo(song: SongHubSeoSong, locale: SupportedLocale) {
  const title = buildSongHubTitle(song, locale)
  const description = buildSongHubDescription(song, locale)
  const image = coverUrl(song.id)
  const socialImage = buildSongOgImageUrl({ songId: song.id, locale })
  const socialImageAlt = buildSongOgImageAlt({ title: song.title, artist: song.artist })
  const url = songHubUrl(song.id, locale)
  const websiteId = 'https://dxrating.net/#website'
  const pageId = `${url}#webpage`
  const breadcrumbId = `${url}#breadcrumb`
  const recordingId = `${url}#song`
  const aliases = [...new Set(song.aliases ?? [])].filter((alias) => alias && alias !== song.title)

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': pageId,
        url,
        name: title,
        description,
        image,
        inLanguage: locale,
        isPartOf: { '@id': websiteId },
        breadcrumb: { '@id': breadcrumbId },
        mainEntity: { '@id': recordingId },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': breadcrumbId,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'DXRating', item: siteUrl('/', locale) },
          { '@type': 'ListItem', position: 2, name: song.title, item: url },
        ],
      },
      {
        '@type': 'MusicRecording',
        '@id': recordingId,
        name: song.title,
        ...(aliases.length ? { alternateName: aliases } : {}),
        byArtist: { '@type': 'MusicGroup', name: song.artist },
        image,
        url,
        genre: song.category,
        ...(song.bpm ? { additionalProperty: [propertyValue('BPM', song.bpm)] } : {}),
      },
    ],
  }

  return {
    title,
    description,
    url,
    image,
    socialImage,
    socialImageAlt,
    structuredData,
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
      { property: 'og:type', content: 'music.song' },
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
        target: `${siteUrl('/', locale)}?q={search_term_string}`,
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
          item: siteUrl('/', locale),
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: song.title,
          item: songHubUrl(song.id, locale),
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: sheetLabel,
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
      ...(song.searchAcronyms?.length ? { alternateName: [...new Set(song.searchAcronyms)] } : {}),
      byArtist: {
        '@type': 'MusicGroup',
        name: song.artist,
      },
      image: coverUrl(song.id),
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
  const url = siteUrl(path, locale)

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
    m.constants_index_seoTitle({}, { locale }),
    m.constants_index_seoDescription({}, { locale }),
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
    m.constants_seoTitle(values, { locale }),
    m.constants_seoDescription(values, { locale }),
  )

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${seo.url}#webpage`,
        url: seo.url,
        name: m.constants_title(values, { locale }),
        description: seo.description,
        inLanguage: locale,
        isPartOf: { '@id': 'https://dxrating.net/#website' },
        breadcrumb: { '@id': `${seo.url}#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${seo.url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'DXRating', item: siteUrl('/', locale) },
          {
            '@type': 'ListItem',
            position: 2,
            name: m.constants_breadcrumb({}, { locale }),
            item: siteUrl('/constants', locale),
          },
          { '@type': 'ListItem', position: 3, name: `Lv.${table.level}`, item: seo.url },
        ],
      },
    ],
  }

  return { ...seo, structuredData }
}
export function buildVersionIndexSeo(locale: SupportedLocale) {
  return buildCollectionSeo(
    locale,
    '/versions',
    m.versions_index_seoTitle({}, { locale }),
    m.versions_index_seoDescription({}, { locale }),
  )
}

export function buildVersionPageSeo(
  locale: SupportedLocale,
  page: { version: string; path: string; songs: number; charts: number },
) {
  const values = { version: page.version, songs: page.songs, charts: page.charts }
  const seo = buildCollectionSeo(
    locale,
    page.path,
    m.versions_seoTitle(values, { locale }),
    m.versions_seoDescription(values, { locale }),
  )

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${seo.url}#webpage`,
        url: seo.url,
        name: m.versions_title(values, { locale }),
        description: seo.description,
        inLanguage: locale,
        isPartOf: { '@id': 'https://dxrating.net/#website' },
        breadcrumb: { '@id': `${seo.url}#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${seo.url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'DXRating', item: siteUrl('/', locale) },
          {
            '@type': 'ListItem',
            position: 2,
            name: m.versions_breadcrumb({}, { locale }),
            item: siteUrl('/versions', locale),
          },
          { '@type': 'ListItem', position: 3, name: page.version, item: seo.url },
        ],
      },
    ],
  }

  return { ...seo, structuredData }
}
/** Per-user achievement summary (`/me/progress`): titled but never indexed */
export function buildProgressSummarySeo(locale: SupportedLocale) {
  return {
    meta: [
      { title: formatSeoTitle(m.completion_progress_title({}, { locale })) },
      { name: 'robots', content: 'noindex' },
    ],
  }
}

/** Per-user top lists (`/me/records`): titled but never indexed */
export function buildToplistsSeo(locale: SupportedLocale) {
  return {
    meta: [{ title: formatSeoTitle(m.toplists_title({}, { locale })) }, { name: 'robots', content: 'noindex' }],
  }
}

/** SEO for the public calculator pages under /tools (tools:<tool>.seo-title / seo-description) */
/** One chart's tolerance calculator, titled after the chart, at its own URL */
export function buildSheetToleranceSeo(
  locale: SupportedLocale,
  sheet: { songId: string; title: string; type: TypeEnum; difficulty: DifficultyEnum | string },
) {
  const values = { title: sheet.title, sheetLabel: getSheetTitleLabel(sheet, locale) }
  const seo = buildCollectionSeo(
    locale,
    buildSheetTolerancePath(sheet),
    m.tools_tolerance_sheetSeoTitle(values, { locale }),
    m.tools_tolerance_sheetSeoDescription(values, { locale }),
  )
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${seo.url}#webapp`,
    url: seo.url,
    name: seo.title,
    description: seo.description,
    applicationCategory: 'UtilityApplication',
    operatingSystem: 'Any',
    inLanguage: locale,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  }
  return { ...seo, structuredData }
}

const TOOL_SEO = {
  tolerance: {
    title: m.tools_tolerance_title,
    seoTitle: m.tools_tolerance_seoTitle,
    seoDescription: m.tools_tolerance_seoDescription,
  },
  rating: {
    title: m.tools_rating_title,
    seoTitle: m.tools_rating_seoTitle,
    seoDescription: m.tools_rating_seoDescription,
  },
} satisfies Record<'tolerance' | 'rating', Record<'title' | 'seoTitle' | 'seoDescription', PlainMessage>>

export function buildToolPageSeo(locale: SupportedLocale, tool: 'tolerance' | 'rating') {
  const seo = buildCollectionSeo(
    locale,
    `/tools/${tool}`,
    TOOL_SEO[tool].seoTitle({}, { locale }),
    TOOL_SEO[tool].seoDescription({}, { locale }),
  )
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${seo.url}#webapp`,
    url: seo.url,
    name: TOOL_SEO[tool].title({}, { locale }),
    description: seo.description,
    applicationCategory: 'UtilityApplication',
    operatingSystem: 'Any',
    inLanguage: locale,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  }
  return { ...seo, structuredData }
}