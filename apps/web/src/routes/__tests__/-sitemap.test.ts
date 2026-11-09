import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { buildSitemap, buildSitemapIndex } from '../sitemap[.]xml'

describe('buildSitemap', () => {
  it('encodes song URLs for route and XML safety', () => {
    const sitemap = buildSitemap([
      {
        id: '1/3の純情な感情 & <test>',
        sheets: [{ type: TypeEnum.DX, difficulty: DifficultyEnum.Master }],
      },
    ])

    expect(sitemap).toContain(
      '<loc>https://dxrating.net/songs/1%2F3%E3%81%AE%E7%B4%94%E6%83%85%E3%81%AA%E6%84%9F%E6%83%85%20%26%20%3Ctest%3E</loc>',
    )
    expect(sitemap).toContain('<loc>https://dxrating.net/charts/recent</loc>')
    expect(sitemap).toContain('<loc>https://dxrating.net/charts/trending</loc>')
    expect(sitemap).toContain('<loc>https://dxrating.net/developers</loc>')
    expect(sitemap).not.toContain('<loc>https://dxrating.net/songs/1/3の純情な感情 & <test></loc>')
  })

  it('lists song pages, not chart pages (their canonical is the song page)', () => {
    const sitemap = buildSitemap([
      {
        id: 'mixed',
        sheets: [
          { type: TypeEnum.DX, difficulty: DifficultyEnum.Basic, releaseDate: '2019-01-01' },
          { type: TypeEnum.STD, difficulty: DifficultyEnum.Master, releaseDate: '2026-05-10' },
        ],
      },
    ])

    expect(sitemap).toContain('<loc>https://dxrating.net/songs/mixed</loc>')
    expect(sitemap).not.toMatch(/\/songs\/mixed\/(dx|std)\//)
  })

  it("dates a song page by its newest chart's release", () => {
    const sitemap = buildSitemap([
      {
        id: 'released',
        sheets: [
          { type: TypeEnum.DX, difficulty: DifficultyEnum.Master, releaseDate: '2019-01-01' },
          { type: TypeEnum.DX, difficulty: DifficultyEnum.ReMaster, releaseDate: '2026-05-10' },
        ],
      },
      {
        id: 'undated',
        sheets: [{ type: TypeEnum.DX, difficulty: DifficultyEnum.Basic }],
      },
    ])

    expect(sitemap).toMatch(/<loc>https:\/\/dxrating\.net\/songs\/released<\/loc>[^]*?<lastmod>2026-05-10<\/lastmod>/)
    expect(sitemap).not.toContain('<lastmod>2019-01-01</lastmod>')
    expect(sitemap).toContain('<loc>https://dxrating.net/songs/undated</loc>')
    expect(sitemap).not.toContain('<lastmod>undefined</lastmod>')
  })
})
describe('buildSitemap plates', () => {
  it('lists the plate index and plate pages with hreflang alternates', () => {
    const sitemap = buildSitemap([])
    expect(sitemap).toContain('<loc>https://dxrating.net/plates</loc>')
    expect(sitemap).toContain('<loc>https://dxrating.net/plates/kagami-shin</loc>')
    expect(sitemap).not.toContain('/plates/shin-ver-sho<')
  })

  it('lists the public tool pages with hreflang alternates', () => {
    const sitemap = buildSitemap([])
    for (const path of ['/tools/tolerance', '/tools/rating']) {
      expect(sitemap).toContain(`<loc>https://dxrating.net${path}</loc>`)
      expect(sitemap).toContain(`hreflang="ja" href="https://dxrating.net/ja${path}"`)
    }
  })

  it('lists one hub URL per song with its hreflang cluster', () => {
    const sitemap = buildSitemap([
      { id: 'dsng_hub', sheets: [{ type: TypeEnum.DX, difficulty: DifficultyEnum.Master }] },
    ])

    expect(sitemap).toContain('<loc>https://dxrating.net/songs/dsng_hub</loc>')
    expect(sitemap).toContain('hreflang="ja" href="https://dxrating.net/ja/songs/dsng_hub"')
  })
})
describe('sitemaps per language', () => {
  it("lists a language's own URLs, each with the full hreflang cluster", () => {
    const sitemap = buildSitemap([{ id: 'dsng_hub', sheets: [] }], 'zh-Hans')
    expect(sitemap).toContain('<loc>https://dxrating.net/zh-hans/songs/dsng_hub</loc>')
    expect(sitemap).toContain('<loc>https://dxrating.net/zh-hans</loc>')
    expect(sitemap).toContain('hreflang="x-default" href="https://dxrating.net/songs/dsng_hub"')
    expect(sitemap).toContain('hreflang="th" href="https://dxrating.net/th/songs/dsng_hub"')
    expect(sitemap).not.toContain('locale=')
  })

  it('indexes one sitemap per language', () => {
    const index = buildSitemapIndex()
    expect(index).toContain('<sitemapindex')
    expect(index).toContain('<loc>https://dxrating.net/sitemaps/en.xml</loc>')
    expect(index).toContain('<loc>https://dxrating.net/sitemaps/zh-hant.xml</loc>')
    expect(index.match(/<sitemap>/g)).toHaveLength(11)
  })
})