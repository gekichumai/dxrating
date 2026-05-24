import { createFileRoute } from '@tanstack/react-router'
import { TrendingPage } from '@/pages/TrendingPage'
import { buildTrendingChartsSeo, resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/charts/trending')({
  ssr: false,
  head: ({ match, matches }) => {
    const seo = buildTrendingChartsSeo(resolveSeoLocale([match, ...matches]))

    return {
      meta: seo.meta,
      links: seo.links,
    }
  },
  component: TrendingPage,
})