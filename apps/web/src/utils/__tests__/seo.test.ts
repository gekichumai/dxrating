import { CategoryEnum, DifficultyEnum, ServerEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import {
  buildDevelopersSeo,
  buildRootSeoMeta,
  buildSearchSeo,
  buildSongHubSeo,
  buildSongHubTitle,
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

  it("prefers the head's own match over the previous navigation's snapshot", () => {
    // After switching from /ja to /ko the head gets `match` for /ko and `matches` still holding /ja's contexts
    const stale = { context: { locale: 'ja' } }
    expect(resolveSeoLocale([{ context: { locale: 'ko' } }, stale, stale])).toBe('ko')
    expect(resolveSeoLocale([{ context: {} }, { context: { locale: 'en' } }, { context: { locale: 'th' } }])).toBe('th')
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

  it('builds localized developer API metadata', () => {
    const seo = buildDevelopersSeo('ja')

    expect(seo.title).toBe('開発者向け: MCP サーバーと API - DXRating')
    expect(seo.meta).toContainEqual({ property: 'og:url', content: 'https://dxrating.net/ja/developers' })
  })

  it('builds localized song sheet title and social metadata', () => {
    const seo = buildSongSheetSeo(
      {
        title: 'Test Song',
        artist: 'Test Artist',
        category: 'POPSアニメ',
        imageName: 'test-song',
        id: 'test-song',
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
        id: 'test-song',
        bpm: 180,
        searchAcronyms: ['ts', 'テスト', 'ts'],
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
        serverIds: [ServerEnum.JP, ServerEnum.INTL, ServerEnum.USA],
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
            target: 'https://dxrating.net/?q={search_term_string}',
            'query-input': 'required name=search_term_string',
          }),
        }),
        expect.objectContaining({
          '@type': 'BreadcrumbList',
        }),
        expect.objectContaining({
          '@type': 'MusicRecording',
          name: 'Test Song',
          alternateName: ['ts', 'テスト'],
          byArtist: expect.objectContaining({ name: 'Test Artist' }),
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

  it('puts the internal level in chart titles and the chart facts in descriptions, per locale', () => {
    const song = {
      title: 'Sky Trails',
      artist: 'La prière',
      category: 'maimai',
      imageName: 'x',
      id: 'dsng_x',
      bpm: 171,
    }
    const sheet = {
      type: TypeEnum.DX,
      difficulty: DifficultyEnum.Master,
      level: '14+',
      internalLevelValue: 14.7,
      noteDesigner: 'Designer',
      noteCounts: { tap: 1, hold: 1, slide: 1, touch: 1, break: 1, total: 1052 },
      version: VersionEnum.CiRCLEPLUS,
    }

    expect(buildSongSheetSeo(song, sheet, 'ja').title).toBe(
      'Sky Trails でらっくす MASTER 譜面定数14.7 | maimai でらっくす - DXRating',
    )
    expect(buildSongSheetSeo(song, sheet, 'en').title).toBe(
      'Sky Trails DX MASTER 14+ (14.7) - maimai DX Chart | DXRating',
    )
    expect(buildSongSheetSeo(song, sheet, 'ja').description).toContain('譜面定数 14.7・ノーツ数 1,052・BPM 171')
    expect(buildSongSheetSeo(song, { ...sheet, internalLevelValue: 0 }, 'zh-Hant').title).toBe(
      'Sky Trails DX MASTER Lv.14+｜maimai DX 譜面 - DXRating',
    )
  })
})
describe('song hub SEO', () => {
  const song = {
    id: 'dsng_test',
    title: 'Test Song',
    artist: 'Test Artist',
    category: CategoryEnum.Maimai,
    imageName: 'test-song',
    bpm: 180,
    aliases: ['ts', 'テスト', 'ts', 'Test Song'],
  }

  it('puts the BPM in the title in every locale', () => {
    expect(buildSongHubTitle(song, 'ja')).toBe('Test Song 譜面定数・BPM180 | maimai でらっくす - DXRating')
    expect(buildSongHubTitle(song, 'en')).toBe('Test Song – maimai DX charts, BPM 180 | DXRating')
    expect(buildSongHubTitle(song, 'zh-Hans')).toBe('Test Song 谱面定数・BPM 180 - 舞萌DX | DXRating')
    expect(buildSongHubTitle(song, 'zh-Hant')).toBe('Test Song 譜面定數・BPM 180｜maimai DX - DXRating')
    expect(buildSongHubTitle(song, 'ko')).toBe('Test Song 채보 상수·BPM 180 - maimai DX | DXRating')
  })

  it('falls back to a title without BPM when the song has none', () => {
    expect(buildSongHubTitle({ title: 'Test Song', bpm: null }, 'ja')).toBe(
      'Test Song 譜面定数 | maimai でらっくす - DXRating',
    )
    expect(buildSongHubTitle({ title: 'Test Song' }, 'en')).toBe('Test Song – maimai DX charts | DXRating')
    expect(buildSongHubSeo({ ...song, bpm: undefined }, 'en').description).not.toContain('BPM')
  })

  it('builds hub meta and a MusicRecording with the aliases as alternateName', () => {
    const seo = buildSongHubSeo(song, 'en')
    expect(seo.url).toBe('https://dxrating.net/songs/dsng_test')
    expect(seo.meta).toContainEqual({ title: seo.title })
    expect(seo.meta).toContainEqual({ property: 'og:url', content: 'https://dxrating.net/songs/dsng_test' })
    expect(seo.description).toContain('BPM 180')
    expect(seo.structuredData['@graph']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@type': 'MusicRecording',
          name: 'Test Song',
          alternateName: ['ts', 'テスト'],
          byArtist: expect.objectContaining({ name: 'Test Artist' }),
        }),
        expect.objectContaining({
          '@type': 'BreadcrumbList',
          itemListElement: [
            expect.objectContaining({ position: 1, item: 'https://dxrating.net/' }),
            expect.objectContaining({ position: 2, name: 'Test Song', item: 'https://dxrating.net/songs/dsng_test' }),
          ],
        }),
      ]),
    )
  })
})

describe('chart page breadcrumb', () => {
  it('goes DXRating > song hub > chart, and keeps the chart title', () => {
    const song = {
      title: 'Test Song',
      artist: 'Test Artist',
      category: CategoryEnum.Maimai,
      imageName: 'test-song',
      id: 'dsng_test',
      bpm: 180,
    }
    const sheet = {
      type: TypeEnum.DX,
      difficulty: DifficultyEnum.Master,
      level: '13+',
      internalLevelValue: 13.7,
      noteCounts: { total: 700 },
      serverIds: [ServerEnum.JP],
      version: VersionEnum.CiRCLEPLUS,
    }
    const graph = buildSongSheetStructuredData(song, sheet, 'en')['@graph']
    const breadcrumb = graph.find((node) => node['@type'] === 'BreadcrumbList')
    expect(breadcrumb?.itemListElement).toEqual([
      expect.objectContaining({ position: 1, name: 'DXRating', item: 'https://dxrating.net/' }),
      expect.objectContaining({ position: 2, name: 'Test Song', item: 'https://dxrating.net/songs/dsng_test' }),
      expect.objectContaining({
        position: 3,
        name: 'DX MASTER',
        item: 'https://dxrating.net/songs/dsng_test/dx/master',
      }),
    ])
    expect(buildSongSheetSeo(song, sheet, 'en').title).not.toContain('BPM')
  })
})