import { createFileRoute } from '@tanstack/react-router'
import { getCatalogDocument } from '@/catalog/catalogSource'
import { CONSTANT_TABLE_LEVELS, buildConstantTable } from '@/components/chartDiscovery/constantTables'
import { ConstantTableIndexPage, constantTableRange } from '@/pages/ConstantTablePage'
import { buildConstantTableIndexSeo, resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/constants/')({
  ssr: true,
  loader: async () => {
    const document = await getCatalogDocument()

    return {
      tables: CONSTANT_TABLE_LEVELS.map((level) => {
        const table = buildConstantTable(document, level)
        return { level, count: table.chartCount, ...constantTableRange(table) }
      }),
    }
  },
  head: ({ match, matches }) => ({ meta: buildConstantTableIndexSeo(resolveSeoLocale([match, ...matches])).meta }),
  component: ConstantTableIndexRouteComponent,
})

function ConstantTableIndexRouteComponent() {
  const { tables } = Route.useLoaderData()

  return <ConstantTableIndexPage tables={tables} />
}