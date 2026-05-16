import { describe, expect, it } from 'vitest'
import { buildSitemap } from '../sitemap[.]xml'

describe('buildSitemap', () => {
  it('encodes song URLs for route and XML safety', () => {
    const sitemap = buildSitemap([
      {
        songId: '1/3の純情な感情 & <test>',
      },
    ])

    expect(sitemap).toContain(
      '<loc>https://dxrating.net/songs/1%2F3%E3%81%AE%E7%B4%94%E6%83%85%E3%81%AA%E6%84%9F%E6%83%85%20%26%20%3Ctest%3E</loc>',
    )
    expect(sitemap).not.toContain('<loc>https://dxrating.net/songs/1/3の純情な感情 & <test></loc>')
  })

  it('sorts song URLs by latest sheet release date descending', () => {
    const sitemap = buildSitemap([
      {
        songId: 'old',
        sheets: [{ releaseDate: '2015-07-16' }],
      },
      {
        songId: 'recent',
        sheets: [{ releaseDate: '2026-05-01' }],
      },
      {
        songId: 'mixed',
        sheets: [{ releaseDate: '2019-01-01' }, { releaseDate: '2026-05-10' }],
      },
    ])

    expect(sitemap.indexOf('/songs/mixed')).toBeLessThan(sitemap.indexOf('/songs/recent'))
    expect(sitemap.indexOf('/songs/recent')).toBeLessThan(sitemap.indexOf('/songs/old'))
  })
})