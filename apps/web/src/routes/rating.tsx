import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { CircularProgress } from '@mui/material'
import { RatingExplainer } from '@/components/rating/RatingExplainer'
import { RatingCalculator } from '@/pages/RatingCalculator'
import { buildRatingSeo, resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/rating')({
  // The calculator reads the visitor's saved scores, so only it waits for the browser; the explainer is SSR'd
  ssr: true,
  head: ({ match, matches }) => {
    const seo = buildRatingSeo(resolveSeoLocale([match, ...matches]))

    return {
      meta: seo.meta,
      scripts: [{ type: 'application/ld+json', children: JSON.stringify(seo.structuredData) }],
    }
  },
  component: RatingRouteComponent,
})

function RatingRouteComponent() {
  return (
    <>
      <ClientOnly
        fallback={
          <div className="flex items-center justify-center w-full min-h-60vh">
            <CircularProgress size="2rem" disableShrink />
          </div>
        }
      >
        <RatingCalculator />
      </ClientOnly>
      <RatingExplainer />
    </>
  )
}