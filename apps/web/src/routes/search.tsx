import { createFileRoute } from '@tanstack/react-router'
import { SheetList } from '@/pages/SheetList'

type SearchParams = {
  songId?: string
  type?: string
  difficulty?: string
}

export const Route = createFileRoute('/search')({
  ssr: true,
  head: () => ({
    meta: [
      { title: 'Charts & Songs — DXRating' },
      {
        name: 'description',
        content:
          'Browse all maimai DX charts — search by song title, artist, or difficulty. View internal levels, note counts, and detailed chart information.',
      },
      { property: 'og:title', content: 'Charts & Songs — DXRating' },
      {
        property: 'og:description',
        content:
          'Browse all maimai DX charts — search by song title, artist, or difficulty. View internal levels, note counts, and detailed chart information.',
      },
      { property: 'og:url', content: 'https://dxrating.net/search' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: 'Charts & Songs — DXRating' },
      {
        name: 'twitter:description',
        content:
          'Browse all maimai DX charts — search by song title, artist, or difficulty. View internal levels, note counts, and detailed chart information.',
      },
    ],
    links: [{ rel: 'canonical', href: 'https://dxrating.net/search' }],
  }),
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    songId: typeof search.songId === 'string' ? search.songId : undefined,
    type: typeof search.type === 'string' ? search.type : undefined,
    difficulty: typeof search.difficulty === 'string' ? search.difficulty : undefined,
  }),
  component: SheetList,
})