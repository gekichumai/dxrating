import { useCatalogDocument } from '@/catalog/CatalogContext'
import { Alert, Button, CircularProgress, Skeleton } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { useMemo, type FC } from 'react'
import { useTranslation } from 'react-i18next'
import { buildTrendingChartLinks } from '@/components/chartDiscovery/trendingCharts'
import { SheetListItem } from '@/components/sheet/SheetListItem'
import { orpc, type RouterOutputs } from '@/lib/orpc'
import { DEFAULT_LOCALE, toSupportedLocale } from '@/setup/locale'
import { formatSheetReleaseDateParts, sheetReleaseDateTimestamp } from '@/utils/dateFormatting'

type TrendingData = RouterOutputs['analytics']['trending']

type TrendingPageProps = {
  initialTrendingData?: TrendingData
}

const trendingQueryStaleTime = 60 * 60 * 1000
const siteUrl = 'https://dxrating.net'

const toAbsoluteChartUrl = (href: string) => new URL(href, siteUrl).toString()

export const buildTrendingQueryOptions = (initialTrendingData?: TrendingData, isServerRender = import.meta.env.SSR) =>
  orpc.analytics.trending.queryOptions({
    input: { idScheme: 'public' },
    ...(isServerRender || !initialTrendingData ? {} : { initialData: initialTrendingData }),
    enabled: !isServerRender,
    staleTime: trendingQueryStaleTime,
  })

// The range is a pair of calendar dates: format them as dates in the app locale, never as raw ISO strings
const formatTrendingDate = (date: string, locale: string) =>
  formatSheetReleaseDateParts(date, locale, sheetReleaseDateTimestamp(date)).absoluteDate

const TrendingChartsSkeleton: FC<{ label: string }> = ({ label }) => (
  <div aria-busy="true" aria-label={label} className="glass w-full p-1" role="status">
    {Array.from({ length: 6 }, (_, index) => (
      <div className="w-full px-2 md:px-3 py-1" key={index}>
        <div className="flex items-center w-full p-1 gap-2 tabular-nums relative">
          <Skeleton variant="rounded" className="!h-12 !w-12 !min-w-[3rem] !rounded" />
          <div className="ml-2 flex-1 min-w-0">
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
          <div className="ml-auto shrink-0 pl-2">
            <Skeleton variant="text" className="!text-xl !w-8" />
          </div>
        </div>
      </div>
    ))}
  </div>
)

export const TrendingPage: FC<TrendingPageProps> = ({ initialTrendingData }) => {
  const { t, i18n } = useTranslation(['sheet'])
  const locale = toSupportedLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE
  const isServerRender = import.meta.env.SSR
  const trendingQuery = useQuery(buildTrendingQueryOptions(initialTrendingData, isServerRender))
  const trendingData = isServerRender ? initialTrendingData : trendingQuery.data
  const trendingResults = trendingData?.results
  const { songs } = useCatalogDocument()
  const charts = useMemo(
    () => (trendingResults ? buildTrendingChartLinks(trendingResults, songs) : []),
    [trendingResults, songs],
  )
  const hasDateRange = !!trendingData?.dateFrom && !!trendingData?.dateTo
  const isLoading = (isServerRender && !initialTrendingData) || trendingQuery.isLoading

  return (
    <div
      className="flex-container w-full max-w-5xl px-4 pb-global"
      itemScope
      itemType="https://schema.org/CollectionPage"
    >
      <div className="w-full flex flex-col gap-4">
        <header className="w-full flex flex-col gap-2">
          <h1 className="page-title m-0" itemProp="name">
            {t('sheet:chart-discovery.trending.title')}
          </h1>
          {/* The count only means something once the list has loaded */}
          {!isLoading && !trendingQuery.isError && charts.length > 0 && (
            <p className="page-description m-0" itemProp="description">
              {hasDateRange
                ? t('sheet:chart-discovery.trending.description-with-dates', {
                    count: charts.length,
                    dateFrom: formatTrendingDate(trendingData!.dateFrom!, locale),
                    dateTo: formatTrendingDate(trendingData!.dateTo!, locale),
                  })
                : t('sheet:chart-discovery.trending.description', { count: charts.length })}
            </p>
          )}
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

        {isLoading ? (
          <TrendingChartsSkeleton label={t('sheet:chart-discovery.trending.loading')} />
        ) : trendingQuery.isError ? null : charts.length > 0 ? (
          <ol
            className="glass w-full list-none p-1 m-0"
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
                    <SheetListItem sheet={chart} analytics={{ source: 'trending', position: index + 1 }} />
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <Alert severity="info">{t('sheet:chart-discovery.trending.empty')}</Alert>
        )}
      </div>
    </div>
  )
}