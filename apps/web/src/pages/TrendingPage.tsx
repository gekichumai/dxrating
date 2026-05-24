import { Alert, Button, CircularProgress, Skeleton } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { useMemo, type FC } from 'react'
import { useTranslation } from 'react-i18next'
import { buildTrendingChartLinks } from '@/components/chartDiscovery/trendingCharts'
import { SheetListItem } from '@/components/sheet/SheetListItem'
import { orpc, type RouterOutputs } from '@/lib/orpc'

type TrendingData = RouterOutputs['analytics']['trending']

type TrendingPageProps = {
  initialTrendingData?: TrendingData
}

const siteUrl = 'https://dxrating.net'

const toAbsoluteChartUrl = (href: string) => new URL(href, siteUrl).toString()

const TrendingChartsSkeleton: FC<{ label: string }> = ({ label }) => (
  <div aria-busy="true" aria-label={label} className="w-full" role="status">
    {Array.from({ length: 6 }, (_, index) => (
      <div className="w-full px-4 py-1" key={index}>
        <div className="flex items-center w-full p-1 gap-2 tabular-nums relative">
          <Skeleton variant="rounded" className="!h-12 !w-12 !min-w-[3rem] !rounded" />
          <div className="ml-2 pr-12 flex-1 min-w-0">
            <div className="flex flex-col gap-2">
              <div className="flex flex-col md:flex-row md:items-center gap-x-2 gap-y-1">
                <Skeleton variant="text" className="!text-lg !w-42 max-w-full" />
                <div className="flex items-center gap-2 shrink-0">
                  <Skeleton variant="rounded" className="!h-6 !w-18 !rounded-full" />
                  <Skeleton variant="rounded" className="!h-6 !w-20 !rounded-full" />
                </div>
              </div>
              <Skeleton variant="text" className="!text-sm !w-20" />
            </div>
          </div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            <Skeleton variant="text" className="!text-xl !w-8" />
          </div>
        </div>
      </div>
    ))}
  </div>
)

export const TrendingPage: FC<TrendingPageProps> = ({ initialTrendingData }) => {
  const { t } = useTranslation(['sheet'])
  const trendingQuery = useQuery(
    orpc.analytics.trending.queryOptions({ initialData: initialTrendingData, staleTime: 60 * 60 * 1000 }),
  )
  const trendingResults = trendingQuery.data?.results
  const charts = useMemo(() => (trendingResults ? buildTrendingChartLinks(trendingResults) : []), [trendingResults])
  const hasDateRange = !!trendingQuery.data?.dateFrom && !!trendingQuery.data?.dateTo

  return (
    <main
      className="flex-container w-full max-w-5xl px-4 pb-global"
      itemScope
      itemType="https://schema.org/CollectionPage"
    >
      <div className="w-full flex flex-col gap-4">
        <header className="w-full flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-slate-950" itemProp="name">
            {t('sheet:chart-discovery.trending.title')}
          </h1>
          <p className="text-sm text-slate-700" itemProp="description">
            {hasDateRange
              ? t('sheet:chart-discovery.trending.description-with-dates', {
                  count: charts.length,
                  dateFrom: trendingQuery.data?.dateFrom,
                  dateTo: trendingQuery.data?.dateTo,
                })
              : t('sheet:chart-discovery.trending.description', { count: charts.length })}
          </p>
        </header>

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
                {trendingQuery.isRefetching ? (
                  <CircularProgress color="inherit" size="1rem" />
                ) : (
                  t('sheet:chart-discovery.retry')
                )}
              </Button>
            }
          >
            {t('sheet:chart-discovery.trending.error')}
          </Alert>
        )}

        {trendingQuery.isLoading ? (
          <TrendingChartsSkeleton label={t('sheet:chart-discovery.trending.loading')} />
        ) : trendingQuery.isError ? null : charts.length > 0 ? (
          <ol
            className="w-full list-none p-0 m-0"
            itemProp="mainEntity"
            itemScope
            itemType="https://schema.org/ItemList"
          >
            <meta itemProp="numberOfItems" content={String(charts.length)} />
            {charts.map((chart, index) => {
              const chartUrl = toAbsoluteChartUrl(chart.href)

              return (
                <li
                  key={chart.id}
                  className="list-none"
                  itemProp="itemListElement"
                  itemScope
                  itemType="https://schema.org/ListItem"
                >
                  <meta itemProp="position" content={String(index + 1)} />
                  <link itemProp="url" href={chartUrl} />
                  <div itemProp="item" itemScope itemType="https://schema.org/MusicRecording" itemID={chartUrl}>
                    <link itemProp="url" href={chartUrl} />
                    <meta itemProp="identifier" content={`${chart.songId}/${chart.type}/${chart.difficulty}`} />
                    <meta itemProp="additionalType" content="maimai DX chart" />
                    <meta itemProp="name" content={chart.title} />
                    <span itemProp="byArtist" itemScope itemType="https://schema.org/MusicGroup">
                      <meta itemProp="name" content={chart.artist} />
                    </span>
                    <span itemProp="additionalProperty" itemScope itemType="https://schema.org/PropertyValue">
                      <meta itemProp="name" content="Chart type" />
                      <meta itemProp="value" content={chart.type} />
                    </span>
                    <span itemProp="additionalProperty" itemScope itemType="https://schema.org/PropertyValue">
                      <meta itemProp="name" content="Difficulty" />
                      <meta itemProp="value" content={chart.difficulty} />
                    </span>
                    <span itemProp="additionalProperty" itemScope itemType="https://schema.org/PropertyValue">
                      <meta itemProp="name" content="Level" />
                      <meta itemProp="value" content={chart.level} />
                    </span>
                    {chart.releaseDate && <meta itemProp="datePublished" content={chart.releaseDate} />}
                    <SheetListItem sheet={chart} />
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <Alert severity="info">{t('sheet:chart-discovery.trending.empty')}</Alert>
        )}
      </div>
    </main>
  )
}