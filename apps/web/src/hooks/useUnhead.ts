import { useHead } from '@unhead/react'

interface SongHeadParams {
  title: string
  artist: string
  category: string
  songId: string
  imageName: string
}

export function useSongHead({ title, artist, category, songId, imageName }: SongHeadParams) {
  useHead({
    title: `${title} - DXRating`,
    meta: [
      { name: 'description', content: `${artist} · ${category}` },
      { property: 'og:title', content: `${title} - DXRating` },
      { property: 'og:description', content: `${artist} · ${category}` },
      { property: 'og:image', content: `https://shama.dxrating.net/images/cover/v2/${imageName}.jpg` },
      { property: 'og:url', content: `https://dxrating.net/song/${songId}` },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: `${title} - DXRating` },
      { name: 'twitter:description', content: `${artist} · ${category}` },
      { name: 'twitter:image', content: `https://shama.dxrating.net/images/cover/v2/${imageName}.jpg` },
    ],
  })
}