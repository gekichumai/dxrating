import { createFileRoute } from '@tanstack/react-router'
import { RandomChartPage } from '@/components/random/RandomChartPage'
import { createServerI18n } from '@/setup/init-i18n'
import { formatSeoTitle, resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/random')({
  ssr: true,
  head: ({ match, matches }) => {
    const i18n = createServerI18n(resolveSeoLocale([match, ...matches]))
    const title = formatSeoTitle(i18n.t('random:title'))
    // Indexable (the SSR'd HTML is the filter form only); off the HTML cache list as results are per visit
    return {
      meta: [
        { title },
        { name: 'description', content: i18n.t('random:description') },
        { property: 'og:title', content: title },
        { property: 'og:description', content: i18n.t('random:description') },
      ],
    }
  },
  component: RandomChartPage,
})