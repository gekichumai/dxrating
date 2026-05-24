import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecentChartLink } from '@/components/chartDiscovery/recentCharts'
import { getSheetTitleLabel } from '@/components/song/sheetDisplay'
import { DEFAULT_LOCALE, toSupportedLocale } from '@/setup/locale'

type RecentPageProps = {
  charts: readonly RecentChartLink[]
}

export const RecentPage: FC<RecentPageProps> = ({ charts }) => {
  const { i18n, t } = useTranslation(['sheet'])
  const locale = toSupportedLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE

  return (
    <div className="flex-container w-full max-w-5xl px-4 pb-global">
      <div className="w-full flex flex-col gap-4">
        <header className="w-full flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-slate-950">{t('sheet:chart-discovery.recent.title')}</h1>
          <p className="text-sm text-slate-700">
            {t('sheet:chart-discovery.recent.description', { count: charts.length })}
          </p>
        </header>

        <ol className="w-full bg-white/90 border border-slate-200 rounded-lg shadow-sm divide-y divide-slate-200 overflow-hidden">
          {charts.map((chart) => (
            <li key={`${chart.songId}-${chart.type}-${chart.difficulty}`}>
              <a
                className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 px-4 py-3 text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
                href={chart.href}
              >
                <span className="min-w-0 flex flex-col gap-1">
                  <span className="font-semibold truncate">{chart.title}</span>
                  <span className="text-sm text-slate-600 truncate">{chart.artist}</span>
                </span>
                <span className="flex flex-col items-start sm:items-end justify-center gap-1 text-left sm:text-right">
                  <span className="text-sm font-semibold text-slate-800">
                    {getSheetTitleLabel(chart, locale)} {t('sheet:chart-discovery.level', { level: chart.level })}
                  </span>
                  {chart.releaseDate && (
                    <time className="text-xs text-slate-500" dateTime={chart.releaseDate}>
                      {chart.releaseDate}
                    </time>
                  )}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}