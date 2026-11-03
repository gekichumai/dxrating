import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/orpc'
import { Route, loadTrendingRouteData } from '../charts/trending'

const mocks = vi.hoisted(() => ({
  trending: vi.fn(),
}))

vi.mock('@/lib/orpc', () => ({
  apiClient: {
    analytics: {
      trending: mocks.trending,
    },
  },
}))

vi.mock('@/pages/TrendingPage', () => ({
  TrendingPage: () => null,
}))

describe('/charts/trending route', () => {
  it('fetches trending data during SSR', async () => {
    const trendingData = {
      dateFrom: '2026-05-01',
      dateTo: '2026-05-24',
      results: [{ songId: 'dsng_kkx38yfx4t' }, { songId: 'dsng_zzzzzzzzzz' }],
    }

    mocks.trending.mockResolvedValueOnce(trendingData)

    expect(Route.options.ssr).toBe(true)
    const data = await loadTrendingRouteData()
    expect(data.trendingData).toEqual(trendingData)
    // the page's catalog slice: the trending songs the catalog has
    expect(data.catalogSongs.map((song) => song.title)).toEqual(['君の知らない物語'])
    expect(apiClient.analytics.trending).toHaveBeenCalledTimes(1)
  })

  it('lets SSR continue when trending analytics are unavailable', async () => {
    mocks.trending.mockRejectedValueOnce(new Error('backend unavailable'))

    await expect(loadTrendingRouteData()).resolves.toEqual({ trendingData: undefined, catalogSongs: [] })
  })
})