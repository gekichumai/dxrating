import { createFileRoute } from '@tanstack/react-router'
import { LxnsOauthCallback } from '@/pages/LxnsOauthCallback'
import { buildPageTitleMeta } from '@/utils/pageTitleSeo'
import { resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/io/import/lxns/oauth_callback')({
  ssr: false,
  head: ({ match, matches }) => ({
    meta: buildPageTitleMeta(
      resolveSeoLocale([match, ...matches]),
      'rating-calculator:io.import.lxns.callback.page-title',
    ),
  }),
  component: LxnsOauthCallback,
})