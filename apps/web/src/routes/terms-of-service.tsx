import { createFileRoute } from '@tanstack/react-router'
import { TermsOfService } from '@/pages/TermsOfService'
import { buildPageTitleMeta } from '@/utils/pageTitleSeo'
import { resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/terms-of-service')({
  head: ({ match, matches }) => ({
    meta: buildPageTitleMeta(resolveSeoLocale([match, ...matches]), 'auth:terms.title'),
  }),
  component: TermsOfService,
})