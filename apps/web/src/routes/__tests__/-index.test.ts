import { describe, expect, it, vi } from 'vitest'
import { SEARCH_QUERY_MAX_LENGTH } from '@/components/sheet/searchQuerySeed'
import { Route, loadSearchRouteData, validateSearchParams } from '../index'

vi.mock('@/pages/SheetList', () => ({
  SheetList: () => null,
}))
vi.mock('@/components/home/HomeHub', () => ({
  HomeHub: () => null,
}))

describe('home route (chart search)', () => {
  it('renders during SSR so direct query URLs can show seeded results', () => {
    expect(Route.options.ssr).toBe(true)
  })

  it('loads seed sheets for a prefilled query parameter', async () => {
    const { seedSheets } = await loadSearchRouteData({ q: '螺旋' })

    expect(seedSheets.map((sheet) => sheet.title)).toContain('ガラテアの螺旋')
    expect(seedSheets[0]?.path).toMatch(/^\/songs\//)
  })

  it('rejects oversized queries before loading search results', async () => {
    const oversizedQuery = 'a'.repeat(SEARCH_QUERY_MAX_LENGTH + 1)

    expect(Route.options.validateSearch).toBe(validateSearchParams)
    expect(() => validateSearchParams({ q: oversizedQuery })).toThrow(RangeError)
    await expect(loadSearchRouteData({ q: oversizedQuery })).rejects.toThrow(RangeError)
  })

  it('loads the hub modules (recently added songs) when no query is entered', async () => {
    const { recentSongs, seedSheets } = await loadSearchRouteData({})

    expect(seedSheets).toEqual([])
    expect(recentSongs.length).toBeGreaterThan(0)
    expect(new Set(recentSongs.map((song) => song.songId)).size).toBe(recentSongs.length)
    expect(recentSongs[0]?.href).toMatch(/^\/songs\//)
  })

  it('skips the hub modules while a query shows search results', async () => {
    const { recentSongs } = await loadSearchRouteData({ q: '螺旋' })

    expect(recentSongs).toEqual([])
  })

  it('names the chart in the tab title while its dialog is open', async () => {
    // 君の知らない物語, DX MASTER
    const search = { songId: 'dsng_kkx38yfx4t', type: 'dx', difficulty: 'master' }
    const loaderData = await loadSearchRouteData(search)
    expect(loaderData.dialogSheet?.song.title).toBe('君の知らない物語')

    const head = (data: unknown, locale: string) =>
      Route.options.head!({ loaderData: data, match: { search: { locale } }, matches: [] } as never) as {
        meta: Array<{ title?: string }>
      }
    const titles = (data: unknown, locale: string) => head(data, locale).meta.filter((entry) => 'title' in entry)

    const [dialogTitle] = titles(loaderData, 'en')
    expect(titles(loaderData, 'en')).toHaveLength(1)
    expect(dialogTitle?.title).toContain('君の知らない物語')
    expect(titles(loaderData, 'ja')[0]?.title).toContain('君の知らない物語')
    // The constant depends on the visitor's game version, which the server does not know
    expect(dialogTitle?.title).not.toMatch(/\(\d+\.\d\)|譜面定数/)
    expect(titles(loaderData, 'ja')[0]?.title).not.toContain('譜面定数')

    const [searchTitle] = titles(await loadSearchRouteData({}), 'en')
    expect(searchTitle?.title).not.toContain('君の知らない物語')
  })

  it('keeps the search title for a dialog link the catalog does not have', async () => {
    const loaderData = await loadSearchRouteData({ songId: 'dsng_missing', type: 'dx', difficulty: 'master' })
    expect(loaderData.dialogSheet).toBeUndefined()
  })
})