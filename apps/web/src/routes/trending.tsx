import { createFileRoute } from '@tanstack/react-router'
import { TrendingPage } from '@/pages/ChartRankingPage'

export const Route = createFileRoute('/trending')({
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Top Trending Charts — DXRating' },
      {
        name: 'description',
        content: 'See the maimai DX charts currently getting the most attention on DXRating.',
      },
      { property: 'og:title', content: 'Top Trending Charts — DXRating' },
      {
        property: 'og:description',
        content: 'See the maimai DX charts currently getting the most attention on DXRating.',
      },
      { property: 'og:url', content: 'https://dxrating.net/trending' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: 'Top Trending Charts — DXRating' },
      {
        name: 'twitter:description',
        content: 'See the maimai DX charts currently getting the most attention on DXRating.',
      },
    ],
    links: [{ rel: 'canonical', href: 'https://dxrating.net/trending' }],
  }),
  component: TrendingPage,
})