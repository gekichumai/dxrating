import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecentChartLink } from '@/components/chartDiscovery/recentCharts'
import { SheetListItemContentView, SheetListItemSummary } from '@/components/sheet/SheetListItem'
import { getSheetTitleLabel } from '@/components/song/sheetDisplay'
import { DEFAULT_LOCALE, toSupportedLocale } from '@/setup/locale'

type RecentPageProps = {
  charts: readonly RecentChartLink[]
}

const siteUrl = 'https://dxrating.net'

const toAbsoluteChartUrl = (href: string) => new URL(href, siteUrl).toString()

export const RecentPage: FC<RecentPageProps> = ({ charts }) => {
  const { i18n, t } = useTranslation(['sheet'])
  const locale = toSupportedLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE

  return (
    <main
      className="flex-container w-full max-w-5xl px-4 pb-global"
      itemScope
      itemType="https://schema.org/CollectionPage"
    >
      <div className="w-full flex flex-col gap-4">
        <header className="w-full flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-slate-950" itemProp="name">
            {t('sheet:chart-discovery.recent.title')}
          </h1>
          <p className="text-sm text-slate-700" itemProp="description">
            {t('sheet:chart-discovery.recent.description', { count: charts.length })}
          </p>
        </header>

        <ol
          className="w-full bg-white/90 border border-slate-200 rounded-lg shadow-sm divide-y divide-slate-200 overflow-hidden"
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
                  className="block text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
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
                        version={chart.version}
                        regions={chart.regions}
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
                          chart.releaseDate && (
                            <time
                              className="text-xs text-zinc-500"
                              dateTime={chart.releaseDate}
                              itemProp="datePublished"
                            >
                              {chart.releaseDate}
                            </time>
                          )
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
    </main>
  )
}