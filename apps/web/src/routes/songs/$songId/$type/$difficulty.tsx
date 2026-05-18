import { dxdata } from '@gekichumai/dxdata'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { SongPage } from '@/pages/SongPage'
import { buildSongSheetSeo, formatSeoTitle, resolveSeoLocale } from '@/utils/seo'
import { createServerI18n } from '@/setup/init-i18n'

export const Route = createFileRoute('/songs/$songId/$type/$difficulty')({
  ssr: true,
  loader: ({ params }) => {
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
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'MusicComposition',
            name: song.title,
            composer: {
              '@type': 'Person',
              name: song.artist,
            },
            image: seo.image,
            url: seo.url,
            genre: song.category,
            inLanguage: locale,
            isPartOf: {
              '@type': 'WebSite',
              name: 'DXRating',
              url: 'https://dxrating.net',
            },
          }),
        },
      ],
    }
  },
  component: SongPage,
})