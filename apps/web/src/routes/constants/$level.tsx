import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { getCatalogDocument } from '@/catalog/catalogSource'
import {
  buildConstantTable,
  constantTablePath,
  constantTableSlug,
  parseConstantTableSlug,
} from '@/components/chartDiscovery/constantTables'
import { ConstantTablePage, constantTableRange } from '@/pages/ConstantTablePage'
import { buildConstantTableSeo, resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/constants/$level')({
  ssr: true,
  loader: async ({ params }) => {
    const level = parseConstantTableSlug(params.level)
    if (!level) throw notFound()
    if (params.level !== constantTableSlug(level)) {
      throw redirect({ to: '/constants/$level', params: { level: constantTableSlug(level) }, statusCode: 308 })
    }

    return { table: buildConstantTable(await getCatalogDocument(), level) }
  },
  head: ({ loaderData, match, matches }) => {
    const table = loaderData?.table
    if (!table) return {}

    const seo = buildConstantTableSeo(resolveSeoLocale([match, ...matches]), {
      level: table.level,
      path: constantTablePath(table.level),
      count: table.chartCount,
      ...constantTableRange(table),
    })

    return {
      meta: seo.meta,
      scripts: [{ type: 'application/ld+json', children: JSON.stringify(seo.structuredData) }],
    }
  },
  component: ConstantTableRouteComponent,
})

function ConstantTableRouteComponent() {
  const { table } = Route.useLoaderData()

  return <ConstantTablePage table={table} />
}