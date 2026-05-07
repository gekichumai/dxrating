import { createFileRoute } from '@tanstack/react-router'
import { dxdata } from '@gekichumai/dxdata'
import { SongPage } from '@/pages/SongPage'

type SongSearchParams = {
  type?: string
  difficulty?: string
}

export const Route = createFileRoute('/songs/$songId')({
  ssr: true,
  loader: ({ params }) => {
    const song = dxdata.songs.find((s) => s.songId === params.songId) ?? null
    return { song }
  },
  head: ({ loaderData }) => {
    const song = loaderData?.song
    if (!song) {
      return {
        meta: [{ title: 'Song Not Found — DXRating' }],
      }
    }

    const pageTitle = `${song.title} — DXRating`
    const description = `${song.title} by ${song.artist} · ${song.category} — View chart details, internal levels, and note counts on DXRating.`
    const image = `https://shama.dxrating.net/images/cover/v2/${song.imageName}.jpg`
    const url = `https://dxrating.net/songs/${song.songId}`

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
  validateSearch: (search: Record<string, unknown>): SongSearchParams => ({
    type: typeof search.type === 'string' ? search.type : undefined,
    difficulty: typeof search.difficulty === 'string' ? search.difficulty : undefined,
  }),
  component: SongPage,
})