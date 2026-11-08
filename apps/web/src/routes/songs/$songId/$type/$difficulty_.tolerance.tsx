import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { getCatalogDocument } from '@/catalog/catalogSource'
import { resolveSongRouteParam } from '@/catalog/songLookup'
import { TolerancePage } from '@/pages/tools/TolerancePage'
import { m } from '@/paraglide/messages'
import { keepLocaleSearch } from '@/setup/locale'
import { buildSheetToleranceSeo, formatSeoTitle, resolveSeoLocale } from '@/utils/seo'
import { toToleranceSheet } from '../../../tools/tolerance'

/** A chart's tolerance calculator, beside the chart's own page. Rendered from the bundled catalog only. */
export const Route = createFileRoute('/songs/$songId/$type/$difficulty_/tolerance')({
  ssr: true,
  loader: async ({ params, location }) => {
    const resolution = await resolveSongRouteParam(await getCatalogDocument(), params.songId)
    if (!resolution) throw notFound()
    if ('redirectSongId' in resolution) {
      throw redirect({
        to: '/songs/$songId/$type/$difficulty/tolerance',
        params: { songId: resolution.redirectSongId, type: params.type, difficulty: params.difficulty },
        ...keepLocaleSearch(location.search),
        statusCode: 308,
        replace: true,
      })
    }
    const { song } = resolution
    const sheet = song.sheets.find((s) => s.type === params.type && s.difficulty === params.difficulty)
    if (!sheet) throw notFound()

    return { sheet: toToleranceSheet(song, sheet), artist: song.artist }
  },
  head: ({ loaderData, match, matches }) => {
    const locale = resolveSeoLocale([match, ...matches])
    const sheet = loaderData?.sheet
    if (!sheet) return { meta: [{ title: formatSeoTitle(m.song_notFound_title({}, { locale })) }] }

    const seo = buildSheetToleranceSeo(locale, sheet)
    return {
      meta: seo.meta,
      scripts: [{ type: 'application/ld+json', children: JSON.stringify(seo.structuredData) }],
    }
  },
  component: SheetToleranceRouteComponent,
})

function SheetToleranceRouteComponent() {
  const { sheet } = Route.useLoaderData()
  return <TolerancePage sheet={sheet} />
}