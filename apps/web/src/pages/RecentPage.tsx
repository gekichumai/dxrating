import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecentChartLink } from '@/components/chartDiscovery/recentCharts'
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
                  <article
                    className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 px-4 py-3"
                    itemScope
                    itemType="https://schema.org/MusicRecording"
                    itemID={chartUrl}
                  >
                    <link itemProp="url" href={chartUrl} />
                    <meta itemProp="identifier" content={`${chart.songId}/${chart.type}/${chart.difficulty}`} />
                    <meta itemProp="additionalType" content="maimai DX chart" />
                    <div className="min-w-0 flex flex-col gap-1">
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
                      <h2 className="font-semibold truncate text-base leading-normal" itemProp="name">
                        {chart.title}
                      </h2>
                      <p
                        className="text-sm text-slate-600 truncate"
                        itemProp="byArtist"
                        itemScope
                        itemType="https://schema.org/MusicGroup"
                      >
                        <span itemProp="name">{chart.artist}</span>
                      </p>
                    </div>
                    <div className="flex flex-col items-start sm:items-end justify-center gap-1 text-left sm:text-right">
                      <p className="text-sm font-semibold text-slate-800" itemProp="description">
                        {sheetLabel} {levelLabel}
                      </p>
                      {chart.releaseDate && (
                        <time className="text-xs text-slate-500" dateTime={chart.releaseDate} itemProp="datePublished">
                          {chart.releaseDate}
                        </time>
                      )}
                    </div>
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