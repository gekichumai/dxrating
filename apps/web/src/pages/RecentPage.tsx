import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecentChartLink } from '@/components/chartDiscovery/recentCharts'
import { SheetListItemContentView, SheetListItemSummary } from '@/components/sheet/SheetListItem'
import { SHEET_ROW_INSET } from '@/components/sheet/sheetRowLayout'
import { getSheetTitleLabel } from '@/components/song/sheetDisplay'
import { DEFAULT_LOCALE, toSupportedLocale } from '@/setup/locale'
import { formatSheetReleaseDateParts, sheetReleaseDateTimestamp } from '@/utils/dateFormatting'

type RecentPageProps = {
  charts: readonly RecentChartLink[]
}

const siteUrl = 'https://dxrating.net'

const toAbsoluteChartUrl = (href: string) => new URL(href, siteUrl).toString()

export const RecentPage: FC<RecentPageProps> = ({ charts }) => {
  const { i18n, t } = useTranslation(['sheet'])
  const locale = toSupportedLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE

  return (
    <div
      className="flex-container w-full max-w-5xl lg:max-w-7xl px-4 pb-global"
      itemScope
      itemType="https://schema.org/CollectionPage"
    >
      <div className="w-full flex flex-col gap-4">
        <header className="w-full flex flex-col gap-2">
          <h1 className="page-title m-0" itemProp="name">
            {t('sheet:chart-discovery.recent.title')}
          </h1>
          <p className="page-description m-0" itemProp="description">
            {t('sheet:chart-discovery.recent.description', { count: charts.length })}
          </p>
        </header>

        <ol
          // Rows are --radius-md at a 4px inset, so they nest in the panel's --radius-lg. From lg the rows fill two
          // columns (three from 2xl) in reading order, so the page uses the width instead of a narrow strip
          className="glass m-0 w-full list-none p-1 lg:grid lg:grid-cols-2 lg:gap-x-2 2xl:grid-cols-3"
          itemProp="mainEntity"
          itemScope
          itemType="https://schema.org/ItemList"
        >
          <meta itemProp="numberOfItems" content={String(charts.length)} />
          {charts.map((chart, index) => {
            const chartUrl = toAbsoluteChartUrl(chart.href)
            const sheetLabel = getSheetTitleLabel(chart, locale)
            const levelLabel = t('sheet:chart-discovery.level', { level: chart.level })

            return (
              <li
                key={`${chart.songId}-${chart.type}-${chart.difficulty}`}
                itemProp="itemListElement"
                itemScope
                itemType="https://schema.org/ListItem"
              >
                <meta itemProp="position" content={String(index + 1)} />
                <link itemProp="url" href={chartUrl} />
                <a
                  className={`block rounded-[var(--radius-md)] ${SHEET_ROW_INSET} text-fg-1 no-underline transition-colors duration-150 hover:bg-black/4 focus-visible:outline-offset-[-2px]`}
                  href={chart.href}
                >
                  <article className="block" itemScope itemType="https://schema.org/MusicRecording" itemID={chartUrl}>
                    <link itemProp="url" href={chartUrl} />
                    <meta itemProp="identifier" content={`${chart.songId}/${chart.type}/${chart.difficulty}`} />
                    <meta itemProp="additionalType" content="maimai DX chart" />
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
                    <meta itemProp="description" content={`${sheetLabel} ${levelLabel}`} />
                    <SheetListItemContentView
                      level={chart.level}
                      internalLevelValue={chart.internalLevelValue}
                      isTypeUtage={chart.isTypeUtage}
                      imageName={chart.imageName}
                      imageAlt={t('sheet:cover-art-alt', { title: chart.title })}
                    >
                      <SheetListItemSummary
                        title={chart.title}
                        type={chart.type}
                        difficulty={chart.difficulty}
                        serverIds={chart.serverIds}
                        isLocked={chart.isLocked}
                        titleElement="h2"
                        titleTextProps={{ itemProp: 'name' }}
                        artist={<span itemProp="name">{chart.artist}</span>}
                        artistProps={{
                          itemProp: 'byArtist',
                          itemScope: true,
                          itemType: 'https://schema.org/MusicGroup',
                        }}
                        metadata={
                          // Version and date are two lines on phones and one ("ver. X · date") from lg, which keeps the
                          // two-column rows short
                          <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-baseline lg:gap-x-1.5 text-fg-2">
                            {chart.version && <span className="text-sm">ver. {chart.version}</span>}
                            {chart.version && chart.releaseDate && (
                              <span aria-hidden="true" className="hidden lg:inline text-sm">
                                ·
                              </span>
                            )}
                            {chart.releaseDate && (
                              <time
                                className="text-xs lg:text-sm tabular-nums"
                                dateTime={chart.releaseDate}
                                itemProp="datePublished"
                              >
                                {/* The date alone (no "days ago"), so the cached page never goes stale */}
                                {
                                  formatSheetReleaseDateParts(
                                    chart.releaseDate,
                                    locale,
                                    sheetReleaseDateTimestamp(chart.releaseDate),
                                  ).absoluteDate
                                }
                              </time>
                            )}
                          </div>
                        }
                      />
                    </SheetListItemContentView>
                  </article>
                </a>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}