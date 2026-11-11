import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES } from '@/setup/locale'
import {
  buildChartOgImageAlt,
  buildChartOgImageUrl,
  buildSongOgImageUrl,
  OG_IMAGE_LOCALES,
  toOgImageLocale,
} from '../-chart-og-meta'

describe('chart OG metadata helpers', () => {
  it('builds a backend image URL that keeps special song ids path-safe', () => {
    expect(
      buildChartOgImageUrl({
        songId: '1/3の純情な感情 & <test>',
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
      }),
    ).toBe(
      'https://miruku.dxrating.net/api/v1/songs/1%2F3%E3%81%AE%E7%B4%94%E6%83%85%E3%81%AA%E6%84%9F%E6%83%85%20%26%20%3Ctest%3E/dx/master/og-image',
    )
  })

  it('names the page language, which the card labels follow', () => {
    expect(buildChartOgImageUrl({ songId: 'dsng_a', type: TypeEnum.DX, difficulty: '【協】', locale: 'ja' })).toBe(
      'https://miruku.dxrating.net/api/v1/songs/dsng_a/dx/%E3%80%90%E5%8D%94%E3%80%91/og-image?locale=ja',
    )
    expect(buildSongOgImageUrl({ songId: 'dsng_a', locale: 'zh-Hans' })).toBe(
      'https://miruku.dxrating.net/api/v1/songs/dsng_a/og-image?locale=zh-Hans',
    )
  })

  it('only ever names one of the five card languages, which the edge keeps in the cache key', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const url = new URL(buildSongOgImageUrl({ songId: 'dsng_a', locale }))
      expect(OG_IMAGE_LOCALES).toContain(url.searchParams.get('locale'))
      expect([...url.searchParams.keys()]).toEqual(['locale'])
    }
    expect(toOgImageLocale('zh-Hant')).toBe('zh-Hant')
    expect(toOgImageLocale('ms')).toBe('en')
    expect(toOgImageLocale('th')).toBe('en')
  })

  it('describes the chart image for social previews', () => {
    expect(
      buildChartOgImageAlt({
        title: 'Song Title',
        artist: 'Composer',
        type: TypeEnum.STD,
        difficulty: DifficultyEnum.Expert,
      }),
    ).toBe('Song Title by Composer - Standard EXPERT chart on DXRating')
  })
})