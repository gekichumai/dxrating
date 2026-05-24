import { Alert, Button, CircularProgress } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { type FC, type ReactNode, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SheetListContainer } from '../components/sheet/SheetListContainer'
import { orpc } from '../lib/orpc'
import { useSheets } from '../songs'
import { selectRecentlyUpdatedSheets, selectTrendingSheets } from './chartRankings'

const skeletonWidths = Array.from({ length: 16 }).map(() => Math.random() * 6.0 + 5.5)

const ChartRankingPageShell: FC<{
  title: string
  description: string
  meta?: ReactNode
  children: ReactNode
}> = ({ title, description, meta, children }) => {
  return (
    <div className="flex-container pb-global">
      <div className="w-full flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold leading-tight text-zinc-900">{title}</h1>
            <p className="text-sm text-zinc-700 m-0">{description}</p>
          </div>
          {meta && (
            <div className="self-start sm:self-end text-sm rounded-full bg-white/70 shadow px-3 py-1 font-bold text-zinc-700">
              {meta}
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

const ChartRankingSkeleton: FC = () => {
  return (
    <div className="flex flex-col w-full" aria-hidden="true">
      {skeletonWidths.map((width, i) => (
        <div
          className="animate-pulse flex items-center justify-start gap-4 w-full h-[78px] px-5 py-2"
          // oxlint-disable-next-line react/no-array-index-key -- index is stable for a fixed skeleton list.
          key={i}
          style={{
            animationDelay: `${i * 40}ms`,
          }}
        >
          <div className="h-12 w-12 min-w-[3rem] min-h-[3rem] rounded bg-slate-6/50" />
          <div className="flex flex-col gap-1">
            <div className="bg-slate-5/50 h-5 mb-1" style={{ width: `${width}rem` }}>
              &nbsp;
            </div>
            <div className="w-24 bg-slate-3/50 h-3">&nbsp;</div>
          </div>
          <div className="flex-1" />
          <div className="w-10 bg-slate-5/50 h-6 mr-2">&nbsp;</div>
        </div>
      ))}
    </div>
  )
}

export const RecentPage: FC = () => {
  const { t } = useTranslation(['charts'])
  const { data: sheets, isLoading } = useSheets({ acceptsPartialData: true })

  const recentSheets = useMemo(() => selectRecentlyUpdatedSheets(sheets ?? []), [sheets])

  return (
    <ChartRankingPageShell
      title={t('charts:recent.title')}
      description={t('charts:recent.description')}
      meta={isLoading ? undefined : t('charts:recent.summary', { count: recentSheets.length })}
    >
      {isLoading ? <ChartRankingSkeleton /> : <SheetListContainer sheets={recentSheets} />}
    </ChartRankingPageShell>
  )
}

export const TrendingPage: FC = () => {
  const { t } = useTranslation(['charts'])
  const { data: sheets, isLoading: isLoadingSheets } = useSheets({ acceptsPartialData: true })
  const trendingQuery = useQuery(
    orpc.analytics.trending.queryOptions({
      staleTime: 60 * 60 * 1000,
    }),
  )

  const trendingSheets = useMemo(
    () =>
      selectTrendingSheets({
        results: trendingQuery.data?.results ?? [],
        sheets: sheets ?? [],
      }),
    [sheets, trendingQuery.data?.results],
  )

  const isLoading = isLoadingSheets || trendingQuery.isLoading
  const hasDateRange = !!trendingQuery.data?.dateFrom && !!trendingQuery.data?.dateTo

  return (
    <ChartRankingPageShell
      title={t('charts:trending.title')}
      description={t('charts:trending.description')}
      meta={
        hasDateRange
          ? t('charts:trending.summary', {
              dateFrom: trendingQuery.data?.dateFrom,
              dateTo: trendingQuery.data?.dateTo,
            })
          : undefined
      }
    >
      {trendingQuery.isError && (
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              disabled={trendingQuery.isRefetching}
              onClick={() => {
                void trendingQuery.refetch()
              }}
            >
              {trendingQuery.isRefetching ? <CircularProgress color="inherit" size="1rem" /> : t('charts:retry')}
            </Button>
          }
          className="w-full"
        >
          {t('charts:trending.error')}
        </Alert>
      )}

      {isLoading ? (
        <ChartRankingSkeleton />
      ) : trendingQuery.isError ? null : trendingSheets.length > 0 ? (
        <SheetListContainer sheets={trendingSheets} />
      ) : (
        <Alert severity="info" className="w-full">
          {t('charts:trending.empty')}
        </Alert>
      )}
    </ChartRankingPageShell>
  )
}