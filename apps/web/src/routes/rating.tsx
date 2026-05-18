import { createFileRoute } from '@tanstack/react-router'
import { RatingCalculator } from '@/pages/RatingCalculator'
import { buildRatingSeo, resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/rating')({
  ssr: false,
  head: ({ match, matches }) => {
    const seo = buildRatingSeo(resolveSeoLocale([match, ...matches]))

    return {
      meta: seo.meta,
      links: seo.links,
    }
  },
  component: RatingCalculator,
})