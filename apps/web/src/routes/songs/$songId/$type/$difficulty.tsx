import { createFileRoute, notFound } from '@tanstack/react-router'
import { SongPage } from '@/pages/SongPage'
import { formatSeoTitle, resolveSeoLocale } from '@/utils/seo'
import { buildSongSheetSeo, buildSongSheetStructuredData } from '@/utils/songSeo'
import { createServerI18n } from '@/setup/init-i18n'

export const Route = createFileRoute('/songs/$songId/$type/$difficulty')({
  ssr: true,
  loader: async ({ params }) => {
    const { dxdata } = await import('@gekichumai/dxdata/data')
    const song = dxdata.songs.find((s) => s.songId === params.songId)
    if (!song) {
      throw notFound()
    }

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
