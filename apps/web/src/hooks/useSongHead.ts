import { useHead } from '@unhead/react'

interface SongHeadParams {
  title: string
  artist: string
  category: string
  songId: string
  imageName: string
}

export function useSongHead({ title, artist, category, songId, imageName }: SongHeadParams) {
  const pageTitle = `${title} - DXRating`
  const description = `${artist} · ${category}`
  const image = `https://shama.dxrating.net/images/cover/v2/${imageName}.jpg`

  useHead({
    title: pageTitle,
    meta: [
      { name: 'description', content: description },
      { property: 'og:title', content: pageTitle },
      { property: 'og:description', content: description },
      { property: 'og:image', content: image },
      { property: 'og:url', content: `https://dxrating.net/songs/${songId}` },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: pageTitle },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: image },
    ],
  })
}