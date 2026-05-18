import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { buildChartOgImageAlt, buildChartOgImageUrl } from '../-chart-og-meta'

describe('chart OG metadata helpers', () => {
  it('builds a backend image URL that keeps special song ids path-safe', () => {
    expect(
      buildChartOgImageUrl({
        songId: '1/3の純情な感情 & <test>',
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
      }),
    ).toBe(
      'https://miruku.dxrating.net/functions/render-chart-og/v0/1%2F3%E3%81%AE%E7%B4%94%E6%83%85%E3%81%AA%E6%84%9F%E6%83%85%20%26%20%3Ctest%3E/dx/master',
    )
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