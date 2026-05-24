import { createFileRoute } from '@tanstack/react-router'
import { TrendingPage } from '@/pages/TrendingPage'
import { buildTrendingChartsSeo, resolveSeoLocale } from '@/utils/seo'
import { apiClient } from '@/lib/orpc'

export const loadTrendingRouteData = async () => ({
  trendingData: await apiClient.analytics.trending(),
})

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