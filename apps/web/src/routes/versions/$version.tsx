import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { getCatalogDocument } from '@/catalog/catalogSource'
import {
  buildVersionPage,
  parseVersionSlug,
  versionPagePath,
  versionSlug,
} from '@/components/chartDiscovery/versionPages'
import { VersionPage } from '@/pages/VersionPage'
import { buildVersionPageSeo, resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/versions/$version')({
  ssr: true,
  loader: async ({ params, location }) => {
    const version = parseVersionSlug(params.version)
    if (!version) throw notFound()
    const slug = versionSlug(version)!
    if (params.version !== slug) {
      throw redirect({ to: '/versions/$version', params: { version: slug }, search: location.search, statusCode: 308 })
    }

    const page = buildVersionPage(await getCatalogDocument(), version)
    if (page.chartCount === 0) throw notFound()
    return { page }
  },
  head: ({ loaderData, match, matches }) => {
    const page = loaderData?.page
    if (!page) return {}

    const seo = buildVersionPageSeo(resolveSeoLocale([match, ...matches]), {
      version: page.version,
      path: versionPagePath(page.version),
      songs: page.songCount,
      charts: page.chartCount,
    })

    return {
      meta: seo.meta,
      scripts: [{ type: 'application/ld+json', children: JSON.stringify(seo.structuredData) }],
    }
  },
  component: VersionRouteComponent,
})

function VersionRouteComponent() {
  const { page } = Route.useLoaderData()

  return <VersionPage page={page} />
}