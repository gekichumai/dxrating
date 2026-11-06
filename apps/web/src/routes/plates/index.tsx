import { createFileRoute } from '@tanstack/react-router'
import { buildPlateIndex, DEFAULT_PLATE_REGION, parsePlateRegion } from '@/components/plates/plateData'
import { buildPlateIndexSeo } from '@/components/plates/plateSeo'
import { PlateIndexPage } from '@/pages/PlatesPage'
import { resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/plates/')({
  ssr: true,
  validateSearch: (search: Record<string, unknown>) => ({ region: parsePlateRegion(search.region) }),
  loaderDeps: ({ search }) => ({ region: search.region ?? DEFAULT_PLATE_REGION }),
  loader: ({ deps }) => ({ region: deps.region, groups: buildPlateIndex(deps.region) }),
  head: ({ match, matches }) => {
    const seo = buildPlateIndexSeo(resolveSeoLocale([match, ...matches]))
    return {
      meta: seo.meta,
      scripts: [{ type: 'application/ld+json', children: JSON.stringify(seo.structuredData) }],
    }
  },
  component: PlateIndexRouteComponent,
})

function PlateIndexRouteComponent() {
  const { region, groups } = Route.useLoaderData()
  const search = Route.useSearch()
  return <PlateIndexPage region={region} groups={groups} explicitRegion={search.region !== undefined} />
}