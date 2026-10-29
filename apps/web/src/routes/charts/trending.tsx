import { createFileRoute } from '@tanstack/react-router'
import { TrendingPage } from '@/pages/TrendingPage'
import { buildTrendingChartsSeo, resolveSeoLocale } from '@/utils/seo'
import { apiClient } from '@/lib/orpc'
import { getCatalogDocument } from '@/catalog/catalogSource'

export const loadTrendingRouteData = async () => {
  let trendingData: Awaited<ReturnType<typeof apiClient.analytics.trending>> | undefined
  try {
    trendingData = await apiClient.analytics.trending({ idScheme: 'public' })
  } catch {
    return { trendingData: undefined, catalogSongs: [] }
  }
  // The trending songs are the page's catalog slice: SSR and hydration render them before the complete catalog loads
  const songIds = new Set(trendingData.results.map((result) => result.songId))
  const catalogSongs = (await getCatalogDocument()).songs.filter((song) => songIds.has(song.id))
  return { trendingData, catalogSongs }
}

export const Route = createFileRoute('/charts/trending')({
  ssr: true,
  loader: loadTrendingRouteData,
  head: ({ match, matches }) => {
    const seo = buildTrendingChartsSeo(resolveSeoLocale([match, ...matches]))

    return {
      meta: seo.meta,
      links: seo.links,
    }
  },
  component: TrendingRouteComponent,
})

function TrendingRouteComponent() {
  const { trendingData } = Route.useLoaderData()

  return <TrendingPage initialTrendingData={trendingData} />
}