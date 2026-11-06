import { createFileRoute } from '@tanstack/react-router'
import { PrivacyPolicy } from '@/pages/PrivacyPolicy'
import { buildPageTitleMeta } from '@/utils/pageTitleSeo'
import { resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/privacy-policy')({
  head: ({ match, matches }) => ({
    meta: buildPageTitleMeta(resolveSeoLocale([match, ...matches]), 'auth:privacy.title'),
  }),
  component: PrivacyPolicy,
})