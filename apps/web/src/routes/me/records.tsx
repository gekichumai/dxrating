import { CircularProgress } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { isToplistKind, isToplistSort, type ToplistSort } from '@/components/toplists/toplistData'
import type { ToplistKind } from '@/lib/analytics'
import { ToplistsPage } from '@/pages/ToplistsPage'
import { buildToplistsSeo, resolveSeoLocale } from '@/utils/seo'

export interface ToplistSearch {
  tab?: ToplistKind
  sort?: ToplistSort
  level?: string
}

export const validateToplistSearch = (search: Record<string, unknown>): ToplistSearch => ({
  tab: isToplistKind(search.tab) ? search.tab : undefined,
  sort: isToplistSort(search.sort) ? search.sort : undefined,
  level: typeof search.level === 'string' && /^\d{1,2}\+?$/.test(search.level) ? search.level : undefined,
})

// Per-user page: noindex, kept out of the sitemap and the HTML edge cache
export const Route = createFileRoute('/me/records')({
  ssr: true,
  validateSearch: validateToplistSearch,
  head: ({ match, matches }) => buildToplistsSeo(resolveSeoLocale([match, ...matches])),
  component: RecordsRouteComponent,
})

function RecordsRouteComponent() {
  const { t } = useTranslation()
  return (
    <ClientOnly
      fallback={
        <div className="flex items-center justify-center w-full min-h-60vh">
          <CircularProgress size="2rem" disableShrink aria-label={t('toplists:loading')} />
        </div>
      }
    >
      <ToplistsPage />
    </ClientOnly>
  )
}