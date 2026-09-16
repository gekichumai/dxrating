import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { RatingIntroduction, RatingLoading } from '@/components/rating/RatingIntroduction'
import { buildRatingSeo, resolveSeoLocale } from '@/utils/seo'

const RatingCalculator = lazy(() =>
  import('@/pages/RatingCalculator').then((module) => ({ default: module.RatingCalculator })),
)

export const Route = createFileRoute('/rating')({
  ssr: true,
  head: ({ match, matches }) => {
    const seo = buildRatingSeo(resolveSeoLocale([match, ...matches]))

    return {
      meta: seo.meta,
      links: seo.links,
    }
  },
  component: RatingPage,
})

function RatingPage() {
  return (
    <main>
      <RatingIntroduction />
      <div id="rating-calculator" className="scroll-mt-4" tabIndex={-1}>
        <ClientOnly fallback={<RatingLoading />}>
          <Suspense fallback={<RatingLoading />}>
            <RatingCalculator />
          </Suspense>
        </ClientOnly>
      </div>
    </main>
  )
}