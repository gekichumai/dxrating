import { createFileRoute } from '@tanstack/react-router'
import { RandomChartPage } from '@/components/random/RandomChartPage'
import { m } from '@/paraglide/messages'
import { formatSeoTitle, resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/random')({
  ssr: true,
  head: ({ match, matches }) => {
    const locale = resolveSeoLocale([match, ...matches])
    const title = formatSeoTitle(m.random_title({}, { locale }))
    const description = m.random_description({}, { locale })
    // Indexable (the SSR'd HTML is the filter form only); off the HTML cache list as results are per visit
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
      ],
    }
  },
  component: RandomChartPage,
})