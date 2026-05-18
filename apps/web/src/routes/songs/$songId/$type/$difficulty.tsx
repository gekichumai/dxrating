import { dxdata } from '@gekichumai/dxdata'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { buildSheetLink } from '@/components/sheet/sheetLinks'
import { getSheetPageTitle, getSheetTitleLabel } from '@/components/song/sheetDisplay'
import { SongPage } from '@/pages/SongPage'
import { buildChartOgImageAlt, buildChartOgImageUrl } from '../../../-chart-og-meta'

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
  head: ({ loaderData }) => {
    const song = loaderData?.song
    const sheet = loaderData?.sheet
    if (!song || !sheet) {
      return {
        meta: [{ title: 'Song Not Found - DXRating' }],
      }
    }

    const sheetLabel = getSheetTitleLabel(sheet)
    const pageTitle = getSheetPageTitle(song, sheet)
    const description = `${song.title} by ${song.artist} - ${sheetLabel} chart details, internal levels, and note counts on DXRating.`
    const coverImage = `https://shama.dxrating.net/images/cover/v2/${song.imageName}.jpg`
    const image = buildChartOgImageUrl({
      songId: song.songId,
      type: sheet.type,
      difficulty: sheet.difficulty,
    })
    const imageAlt = buildChartOgImageAlt({
      title: song.title,
      artist: song.artist,
      type: sheet.type,
      difficulty: sheet.difficulty,
    })
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
        { name: 'description', content: description },
        { property: 'og:title', content: pageTitle },
        { property: 'og:description', content: description },
        { property: 'og:image', content: image },
        { property: 'og:image:secure_url', content: image },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: imageAlt },
        { property: 'og:url', content: url },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: pageTitle },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: image },
        { name: 'twitter:image:alt', content: imageAlt },
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
            image: coverImage,
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