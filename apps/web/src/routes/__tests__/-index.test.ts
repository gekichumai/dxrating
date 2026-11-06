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
})