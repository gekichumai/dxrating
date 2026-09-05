import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES } from '@/setup/locale'
import { buildSitemap } from '../sitemap[.]xml'

describe('buildSitemap', () => {
  it('publishes each supported locale as a canonical sitemap URL', () => {
    const xml = new DOMParser().parseFromString(buildSitemap([]), 'application/xml')
    expect(xml.querySelector('parsererror')).toBeNull()
    const urls = Array.from(xml.getElementsByTagName('loc'), (entry) => entry.textContent)
    expect(urls).toHaveLength(5 * SUPPORTED_LOCALES.length)
    expect(new Set(urls).size).toBe(urls.length)
    for (const locale of SUPPORTED_LOCALES) {
      expect(urls).toContain(`https://dxrating.net/rating?locale=${locale}`)
      expect(urls).toContain(`https://dxrating.net/search?locale=${locale}`)
    }
    expect(urls).not.toContain('https://dxrating.net/')
  })
  it('encodes song URLs for route and XML safety', () => {
    const sitemap = buildSitemap([
      {
        songId: '1/3の純情な感情 & <test>',
        sheets: [{ type: TypeEnum.DX, difficulty: DifficultyEnum.Master }],
      },
    ])

    expect(sitemap).toContain(
      '<loc>https://dxrating.net/songs/1%2F3%E3%81%AE%E7%B4%94%E6%83%85%E3%81%AA%E6%84%9F%E6%83%85%20%26%20%3Ctest%3E/dx/master?locale=en</loc>',
    )
    expect(sitemap).toContain('<loc>https://dxrating.net/charts/recent?locale=en</loc>')
    expect(sitemap).toContain('<loc>https://dxrating.net/charts/trending?locale=en</loc>')
    expect(sitemap).toContain('<loc>https://dxrating.net/developers?locale=en</loc>')
    expect(sitemap).not.toContain('<loc>https://dxrating.net/1/3の純情な感情 & <test>/dx/master?locale=en</loc>')
  })

  it('sorts sheet URLs by release date descending', () => {
    const sitemap = buildSitemap([
      {
        songId: 'old',
        sheets: [{ type: TypeEnum.DX, difficulty: DifficultyEnum.Master, releaseDate: '2015-07-16' }],
      },
      {
        songId: 'recent',
        sheets: [{ type: TypeEnum.DX, difficulty: DifficultyEnum.Expert, releaseDate: '2026-05-01' }],
      },
      {
        songId: 'mixed',
        sheets: [
          { type: TypeEnum.DX, difficulty: DifficultyEnum.Basic, releaseDate: '2019-01-01' },
          { type: TypeEnum.STD, difficulty: DifficultyEnum.Master, releaseDate: '2026-05-10' },
        ],
      },
    ])

    expect(sitemap.indexOf('/songs/mixed/std/master')).toBeLessThan(sitemap.indexOf('/songs/recent/dx/expert'))
    expect(sitemap.indexOf('/songs/recent/dx/expert')).toBeLessThan(sitemap.indexOf('/songs/old/dx/master'))
  })

  it('includes lastmod for chart URLs with release dates', () => {
    const sitemap = buildSitemap([
      {
        songId: 'released',
        sheets: [{ type: TypeEnum.DX, difficulty: DifficultyEnum.Master, releaseDate: '2026-05-10' }],
      },
      {
        songId: 'undated',
        sheets: [{ type: TypeEnum.DX, difficulty: DifficultyEnum.Basic }],
      },
    ])

    expect(sitemap).toContain('<loc>https://dxrating.net/songs/released/dx/master?locale=en</loc>')
    expect(sitemap).toContain('<lastmod>2026-05-10</lastmod>')
    expect(sitemap).toContain('<loc>https://dxrating.net/songs/undated/dx/basic?locale=en</loc>')
    expect(sitemap).not.toContain('<lastmod>undefined</lastmod>')
  })
})