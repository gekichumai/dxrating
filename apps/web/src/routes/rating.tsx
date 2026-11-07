import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { CircularProgress } from '@mui/material'
import { RatingViewContext, type RatingView } from '@/components/rating/useRatingEntries'
import { RatingExplainer } from '@/components/rating/RatingExplainer'
import { RatingCalculator } from '@/pages/RatingCalculator'
import { buildRatingSeo, resolveSeoLocale } from '@/utils/seo'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export const Route = createFileRoute('/rating')({
  // The calculator reads the visitor's saved scores, so only it waits for the browser; the explainer is SSR'd
  ssr: true,
  validateSearch: (search: Record<string, unknown>): { view?: RatingView } =>
    search.view === 'ap50' ? { view: 'ap50' } : {},
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
  const { view = 'b50' } = Route.useSearch()
  const locale = useLocale()
  return (
    <>
      {/* The calculator renders in the browser only; the page heading is server-rendered so the outline starts here */}
      <h1 className="sr-only">{m.ratingCalculator_pageTitle({}, { locale })}</h1>
      {/* The server cannot know whether the visitor has records, so it reserves about a viewport for the calculator.
          The explainer then starts below the fold in the server render, while the catalog loads and once the
          calculator (empty or not) is in, so it never moves inside the viewport (CLS) */}
      <div className="flex flex-col min-h-[calc(100svh-6rem)]">
        <ClientOnly
          fallback={
            <div className="flex flex-1 items-start justify-center w-full pt-[30svh]">
              <CircularProgress size="2rem" disableShrink aria-label={m.ratingCalculator_loading({}, { locale })} />
            </div>
          }
        >
          <RatingViewContext.Provider value={view}>
            <RatingCalculator />
          </RatingViewContext.Provider>
        </ClientOnly>
      </div>
      <RatingExplainer />
    </>
  )
}