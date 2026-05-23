import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import {
  buildRootSeoMeta,
  buildSearchSeo,
  buildSongSheetSeo,
  buildSongSheetStructuredData,
  resolveSeoLocale,
} from '../seo'

describe('SEO localization', () => {
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
    expect(buildSearchSeo('ja').title).toBe('譜面検索 - DXRating')
    expect(buildSearchSeo('ja').description).toBe(
      'maimai DX の譜面を、楽曲名、アーティスト、難易度から検索できます。譜面定数、ノーツ数、詳しい譜面情報も確認できます。',
    )
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

    expect(seo.title).toBe('Test Song [標準 MASTER] - DXRating')
    expect(seo.description).toBe('Test Song / Test Artist - 標準 MASTER 譜面詳情、譜面定數與音符數 - DXRating。')
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
          url: 'https://dxrating.net/songs/test-song/dx/master',
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