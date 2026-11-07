import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { CircularProgress } from '@mui/material'
import { ProgressSummaryPage } from '@/pages/ProgressSummaryPage'
import { buildProgressSummarySeo, resolveSeoLocale } from '@/utils/seo'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

// Per-user page: noindex, kept out of the sitemap and the HTML edge cache; records render client-side only
export const Route = createFileRoute('/me/progress')({
  ssr: true,
  head: ({ match, matches }) => buildProgressSummarySeo(resolveSeoLocale([match, ...matches])),
  component: ProgressRouteComponent,
})

function ProgressRouteComponent() {
  const locale = useLocale()
  return (
    <ClientOnly
      fallback={
        <div className="flex items-center justify-center w-full min-h-60vh">
          <CircularProgress
            size="2rem"
            disableShrink
            aria-label={m.completion_progress_loadingScores({}, { locale })}
          />
        </div>
      }
    >
      <ProgressSummaryPage />
    </ClientOnly>
  )
}