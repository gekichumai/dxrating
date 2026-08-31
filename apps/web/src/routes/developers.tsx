import { createFileRoute } from '@tanstack/react-router'
import { DevelopersPage } from '@/pages/DevelopersPage'
import { buildDevelopersSeo, resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/developers')({
  ssr: true,
  head: ({ match, matches }) => {
    const seo = buildDevelopersSeo(resolveSeoLocale([match, ...matches]))

    return {
      meta: seo.meta,
      links: seo.links,
    }
  },
  component: DevelopersPage,
})