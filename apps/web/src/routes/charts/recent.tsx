import { createFileRoute } from '@tanstack/react-router'
import { getCatalogDocument } from '@/catalog/catalogSource'
import { buildRecentChartLinks } from '@/components/chartDiscovery/recentCharts'
import { RecentPage } from '@/pages/RecentPage'
import { buildRecentChartsSeo, resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/charts/recent')({
  ssr: true,
  loader: async () => ({
    charts: buildRecentChartLinks(await getCatalogDocument()),
  }),
  head: ({ match, matches }) => {
    const seo = buildRecentChartsSeo(resolveSeoLocale([match, ...matches]))

    return {
      meta: seo.meta,
      links: seo.links,
    }
  },
  component: RecentRouteComponent,
})

function RecentRouteComponent() {
  const { charts } = Route.useLoaderData()

  return <RecentPage charts={charts} />
}