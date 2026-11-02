import { createFileRoute } from '@tanstack/react-router'
import { getCatalogDocument } from '@/catalog/catalogSource'
import { VERSION_PAGE_VERSIONS, buildVersionPage } from '@/components/chartDiscovery/versionPages'
import { VersionIndexPage } from '@/pages/VersionPage'
import { buildVersionIndexSeo, resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/versions/')({
  ssr: true,
  loader: async () => {
    const document = await getCatalogDocument()

    return {
      versions: VERSION_PAGE_VERSIONS.map((version) => {
        const page = buildVersionPage(document, version)
        return { version, songs: page.songCount, charts: page.chartCount }
      }).filter((entry) => entry.charts > 0),
    }
  },
  head: ({ match, matches }) => ({ meta: buildVersionIndexSeo(resolveSeoLocale([match, ...matches])).meta }),
  component: VersionIndexRouteComponent,
})

function VersionIndexRouteComponent() {
  const { versions } = Route.useLoaderData()

  return <VersionIndexPage versions={versions} />
}