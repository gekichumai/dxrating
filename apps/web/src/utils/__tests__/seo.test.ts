import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { createServerI18n } from '@/setup/init-i18n'
import { SUPPORTED_LOCALES } from '@/setup/locale'
import { buildAlternateLinks } from '../alternateLinks'
import {
  buildDevelopersSeo,
  buildRootSeoMeta,
  buildRatingSeo,
  buildRecentChartsSeo,
  buildTrendingChartsSeo,
  buildSearchSeo,
  buildSongSheetSeo,
  buildSongSheetStructuredData,
  resolveSeoLocale,
} from '../seo'

describe('SEO localization', () => {
  it.each(SUPPORTED_LOCALES)('aligns canonical and language alternates for %s', (locale) => {
    for (const [path, build] of [
      ['/search', buildSearchSeo],
      ['/rating', buildRatingSeo],
      ['/developers', buildDevelopersSeo],
      ['/charts/recent', buildRecentChartsSeo],
      ['/charts/trending', buildTrendingChartsSeo],
    ] as const) {
      const alternate = buildAlternateLinks({ pathname: path }).find((link) => link.hrefLang === locale)
      const seo = build(locale)
      expect(seo.links).toContainEqual({ rel: 'canonical', href: alternate?.href })
      expect(seo.meta).toContainEqual({ property: 'og:url', content: alternate?.href })
    }
  })

  it('includes a known BPM in song metadata without inventing missing values', () => {
    const song = { title: 'Song', artist: 'Artist', category: 'maimai', imageName: 'song', songId: 'a/b & c' }
    const sheet = { type: TypeEnum.DX, difficulty: DifficultyEnum.Master }
    expect(buildSongSheetSeo({ ...song, bpm: 180 }, sheet, 'en').description).toContain('180 BPM')
    expect(buildSongSheetSeo({ ...song, bpm: null }, sheet, 'en').description).not.toMatch(/null|undefined|BPM/)
    expect(buildSongSheetSeo(song, sheet, 'ja').links).toContainEqual({
      rel: 'canonical',
      href: 'https://dxrating.net/songs/a%2Fb%20%26%20c/dx/master?locale=ja',
    })
  })
  it('resolves the locale from route server context before falling back to English', () => {
    expect(
      resolveSeoLocale([
        {
          context: {
            serverContext: {
              locale: 'ja',
            },
          },
        },
      ]),
    ).toBe('ja')
  })

  it('builds localized root metadata for HTML responses', () => {
    const meta = buildRootSeoMeta('zh-Hans')

    expect(meta).toContainEqual({
      name: 'description',
      content: 'DXRating 是 maimai DX Rating 分析工具，也提供谱面详情等功能。',
    })
    expect(meta).toContainEqual({
      property: 'og:description',
      content: 'DXRating 是 maimai DX Rating 分析工具，也提供谱面详情等功能。',
    })
  })

  it('builds localized search route metadata', () => {
    const i18n = createServerI18n('ja')
    expect(buildSearchSeo('ja').title).toBe(`${i18n.t('root:pages.search.seo-title')} - DXRating`)
    expect(buildSearchSeo('ja').description).toBe(i18n.t('root:pages.search.seo-description'))
  })

  it('builds localized developer API metadata', () => {
    const seo = buildDevelopersSeo('ja')

    expect(seo.title).toBe('開発者向け API - DXRating')
    expect(seo.links).toContainEqual({ rel: 'canonical', href: 'https://dxrating.net/developers?locale=ja' })
    expect(seo.meta).toContainEqual({ property: 'og:url', content: 'https://dxrating.net/developers?locale=ja' })
  })

  it('builds localized song sheet title and social metadata', () => {
    const seo = buildSongSheetSeo(
      {
        title: 'Test Song',
        artist: 'Test Artist',
        category: 'POPSアニメ',
        imageName: 'test-song',
        songId: 'test-song',
      },
      {
        type: TypeEnum.STD,
        difficulty: DifficultyEnum.Master,
      },
      'zh-Hant',
    )

    expect(seo.title).toBe('Test Song [標準 MASTER] - maimai - DXRating')
    expect(seo.description).toBe(
      createServerI18n('zh-Hant').t('song:seo.description', {
        title: 'Test Song',
        artist: 'Test Artist',
        sheetLabel: '標準 MASTER',
      }),
    )
    expect(seo.meta).toContainEqual({ property: 'og:title', content: seo.title })
    expect(seo.meta).toContainEqual({
      property: 'og:image',
      content: 'https://miruku.dxrating.net/api/v1/songs/test-song/std/master/og-image',
    })
    expect(seo.meta).toContainEqual({ property: 'og:image:type', content: 'image/png' })
    expect(seo.meta).toContainEqual({ name: 'twitter:image:alt', content: seo.socialImageAlt })
    expect(seo.meta).toContainEqual({ name: 'twitter:description', content: seo.description })
  })

  it('builds a chart-focused structured data graph with visible sheet facts', () => {
    const structuredData = buildSongSheetStructuredData(
      {
        title: 'Test Song',
        artist: 'Test Artist',
        category: CategoryEnum.Maimai,
        imageName: 'test-song',
        songId: 'test-song',
        bpm: 180,
      },
      {
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
        level: '13+',
        internalLevelValue: 13.7,
        noteDesigner: 'Chart Designer',
        releaseDate: '2026-05-10',
        noteCounts: {
          tap: 500,
          hold: 40,
          slide: 120,
          touch: 30,
          break: 10,
          total: 700,
        },
        regions: {
          jp: true,
          intl: true,
          cn: false,
        },
        version: VersionEnum.CiRCLEPLUS,
      },
      'en',
    )

    expect(structuredData['@context']).toBe('https://schema.org')

    const graph = structuredData['@graph']
    expect(graph).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'WebSite',
          potentialAction: expect.objectContaining({
            '@type': 'SearchAction',
            target: 'https://dxrating.net/search?q={search_term_string}',
            'query-input': 'required name=search_term_string',
          }),
        }),
        expect.objectContaining({
          '@type': 'BreadcrumbList',
        }),
        expect.objectContaining({
          '@type': 'MusicComposition',
          name: 'Test Song',
          composer: expect.objectContaining({ name: 'Test Artist' }),
        }),
        expect.objectContaining({
          '@type': 'Dataset',
          name: 'Test Song DX MASTER chart',
          url: 'https://dxrating.net/songs/test-song/dx/master?locale=en',
          datePublished: '2026-05-10',
          additionalProperty: expect.arrayContaining([
            expect.objectContaining({ name: 'Chart type', value: 'DX' }),
            expect.objectContaining({ name: 'Difficulty', value: 'MASTER' }),
            expect.objectContaining({ name: 'Level', value: '13+' }),
            expect.objectContaining({ name: 'Internal level', value: 13.7 }),
            expect.objectContaining({ name: 'BPM', value: 180 }),
            expect.objectContaining({ name: 'Chart designer', value: 'Chart Designer' }),
            expect.objectContaining({ name: 'Total notes', value: 700 }),
            expect.objectContaining({ name: 'Japan availability', value: true }),
            expect.objectContaining({ name: 'China availability', value: false }),
          ]),
        }),
      ]),
    )
  })
})