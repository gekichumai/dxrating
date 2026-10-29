import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { getBundledCatalogDocument } from '@/catalog/bundledCatalog'
import { resolveSongRouteParam } from '@/catalog/songLookup'
import { SongPage } from '@/pages/SongPage'
import { buildSongSheetSeo, buildSongSheetStructuredData, formatSeoTitle, resolveSeoLocale } from '@/utils/seo'
import { createServerI18n } from '@/setup/init-i18n'

export const Route = createFileRoute('/songs/$songId/$type/$difficulty')({
  ssr: true,
  loader: async ({ params }) => {
    const resolution = await resolveSongRouteParam(getBundledCatalogDocument(), params.songId)
    if (!resolution) {
      throw notFound()
    }
    if ('redirectSongId' in resolution) {
      // Links and saved pages from before public song IDs
      throw redirect({
        to: '/songs/$songId/$type/$difficulty',
        params: { songId: resolution.redirectSongId, type: params.type, difficulty: params.difficulty },
        statusCode: 308,
        replace: true,
      })
    }
    const { song } = resolution

    const sheet = song.sheets.find((s) => s.type === params.type && s.difficulty === params.difficulty)
    if (!sheet) {
      throw notFound()
    }

    return { song, sheet }
  },
  head: ({ loaderData, match, matches }) => {
    const locale = resolveSeoLocale([match, ...matches])
    const song = loaderData?.song
    const sheet = loaderData?.sheet
    if (!song || !sheet) {
      return {
        meta: [{ title: formatSeoTitle(createServerI18n(locale).t('song:not-found.title')) }],
      }
    }

    const seo = buildSongSheetSeo(song, sheet, locale)

    return {
      meta: seo.meta,
      links: seo.links,
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify(buildSongSheetStructuredData(song, sheet, locale)),
        },
      ],
    }
  },
  component: SongPage,
})