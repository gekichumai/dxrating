import { dxdata } from '@gekichumai/dxdata'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { SongPage } from '@/pages/SongPage'
import { buildSheetLink } from '@/components/sheet/sheetLinks'

export const Route = createFileRoute('/$songId/$type/$difficulty')({
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
  head: ({ loaderData }) => {
    const song = loaderData?.song
    const sheet = loaderData?.sheet
    if (!song || !sheet) {
      return {
        meta: [{ title: 'Song Not Found - DXRating' }],
      }
    }

    const pageTitle = `${song.title} [${sheet.type} ${sheet.difficulty}] - DXRating`
    const description = `${song.title} by ${song.artist} - ${sheet.type} ${sheet.difficulty} chart details, internal levels, and note counts on DXRating.`
    const image = `https://shama.dxrating.net/images/cover/v2/${song.imageName}.jpg`
    const url = buildSheetLink(
      {
        songId: song.songId,
        type: sheet.type,
        difficulty: sheet.difficulty,
      },
      'https://dxrating.net',
    )

    return {
      meta: [
        { title: pageTitle },
        { name: 'description', content: description },
        { property: 'og:title', content: pageTitle },
        { property: 'og:description', content: description },
        { property: 'og:image', content: image },
        { property: 'og:url', content: url },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: pageTitle },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: image },
      ],
      links: [{ rel: 'canonical', href: url }],
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
            image,
            url,
            genre: song.category,
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