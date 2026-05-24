import { createFileRoute } from '@tanstack/react-router'
import { RecentPage } from '@/pages/ChartRankingPage'

export const Route = createFileRoute('/recent')({
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Recent Chart Updates — DXRating' },
      {
        name: 'description',
        content: 'Browse recently updated maimai DX charts on DXRating.',
      },
      { property: 'og:title', content: 'Recent Chart Updates — DXRating' },
      {
        property: 'og:description',
        content: 'Browse recently updated maimai DX charts on DXRating.',
      },
      { property: 'og:url', content: 'https://dxrating.net/recent' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: 'Recent Chart Updates — DXRating' },
      {
        name: 'twitter:description',
        content: 'Browse recently updated maimai DX charts on DXRating.',
      },
    ],
    links: [{ rel: 'canonical', href: 'https://dxrating.net/recent' }],
  }),
  component: RecentPage,
})