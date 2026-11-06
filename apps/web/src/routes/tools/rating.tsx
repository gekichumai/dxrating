import { createFileRoute } from '@tanstack/react-router'
import { RatingToolPage } from '@/pages/tools/RatingToolPage'
import { buildToolPageSeo, resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/tools/rating')({
  ssr: true,
  head: ({ match, matches }) => {
    const seo = buildToolPageSeo(resolveSeoLocale([match, ...matches]), 'rating')
    return {
      meta: seo.meta,
      scripts: [{ type: 'application/ld+json', children: JSON.stringify(seo.structuredData) }],
    }
  },
  component: RatingToolPage,
})