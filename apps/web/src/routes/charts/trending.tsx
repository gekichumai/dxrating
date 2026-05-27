import { createFileRoute } from '@tanstack/react-router'
import { TrendingPage } from '@/pages/TrendingPage'
import { buildTrendingChartsSeo, resolveSeoLocale } from '@/utils/seo'

export const loadTrendingRouteData = async () => {
  try {
    const { apiClient } = await import('@/lib/orpc')
    return { trendingData: await apiClient.analytics.trending() }
  } catch {
    return { trendingData: undefined }
  }
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
