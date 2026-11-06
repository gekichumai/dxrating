import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { RecommendPage } from '@/components/recommend/RecommendPage'
import { m } from '@/paraglide/messages'
import { formatSeoTitle, resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/me/recommend')({
  head: ({ match, matches }) => {
    const title = formatSeoTitle(m.recommend_title({}, { locale: resolveSeoLocale([match, ...matches]) }))
    // Per-user page: never indexed, never in the sitemap or the HTML cache
    return { meta: [{ title }, { name: 'robots', content: 'noindex' }] }
  },
  component: RecommendRouteComponent,
})

function RecommendRouteComponent() {
  // Scores live in the browser, so the page renders after hydration
  return (
    <ClientOnly fallback={null}>
      <RecommendPage />
    </ClientOnly>
  )
}