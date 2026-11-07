import { createFileRoute, notFound } from '@tanstack/react-router'
import { getCatalogDocument } from '@/catalog/catalogSource'
import { buildPlatePageData, DEFAULT_PLATE_REGION, parsePlateRegion, plateScript } from '@/components/plates/plateData'
import { buildPlatePageSeo } from '@/components/plates/plateSeo'
import { PlatePage } from '@/pages/PlatesPage'
import { resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/plates/$plate')({
  ssr: true,
  validateSearch: (search: Record<string, unknown>) => ({ region: parsePlateRegion(search.region) }),
  loaderDeps: ({ search }) => ({ region: search.region ?? DEFAULT_PLATE_REGION }),
  loader: async ({ params, deps }) => {
    const data = buildPlatePageData(await getCatalogDocument(), deps.region, params.plate)
    if (!data) throw notFound()
    return { data }
  },
  head: ({ loaderData, match, matches }) => {
    const data = loaderData?.data
    if (!data) return {}
    const locale = resolveSeoLocale([match, ...matches])
    const seo = buildPlatePageSeo(locale, {
      plateId: data.plateId,
      name: data.names[plateScript(locale)],
      charts: data.charts.length,
      sheets: data.totalSheets,
      versions: data.versions.length > 2 ? `${data.versions[0]} – ${data.versions.at(-1)}` : data.versions.join(' / '),
    })
    return {
      meta: seo.meta,
      scripts: [{ type: 'application/ld+json', children: JSON.stringify(seo.structuredData) }],
    }
  },
  component: PlateRouteComponent,
})

function PlateRouteComponent() {
  const { data } = Route.useLoaderData()
  const search = Route.useSearch()
  return <PlatePage data={data} explicitRegion={search.region !== undefined} />
}