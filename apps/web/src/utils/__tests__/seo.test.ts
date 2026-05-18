import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { buildRootSeoMeta, buildSearchSeo, buildSongSheetSeo, resolveSeoLocale } from '../seo'

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
    expect(seo.meta).toContainEqual({ name: 'twitter:description', content: seo.description })
  })
})