import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import type { VersionEnum } from '@gekichumai/dxdata'
import {
  VERSION_PAGE_VERSIONS,
  versionPagePath,
  type VersionPage as VersionPageData,
} from '@/components/chartDiscovery/versionPages'
import { getSheetTypeDisplayName } from '@/components/song/sheetDisplay'
import { DIFFICULTIES } from '@/models/difficulties'
import { DEFAULT_LOCALE, toSupportedLocale } from '@/setup/locale'

const VersionNav: FC<{ current?: VersionEnum }> = ({ current }) => {
  const { t } = useTranslation(['versions'])

  return (
    <nav aria-label={t('versions:other-versions')} className="flex flex-wrap gap-2">
      {VERSION_PAGE_VERSIONS.map((version) => (
        <a
          key={version}
          href={versionPagePath(version)}
          aria-current={version === current ? 'page' : undefined}
          className={`px-3 py-1 rounded-full text-xs no-underline border ${
            version === current
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white/90 text-slate-900 border-slate-300 hover:bg-slate-100'
          }`}
        >
          {version}
        </a>
      ))}
    </nav>
  )
}

export const VersionPage: FC<{ page: VersionPageData }> = ({ page }) => {
  const { i18n, t } = useTranslation(['versions'])
  const locale = toSupportedLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE
  const values = { version: page.version, songs: page.songCount, charts: page.chartCount }

  return (
    <div className="flex-container w-full max-w-5xl px-4 pb-global">
      <div className="w-full flex flex-col gap-4">
        <header className="w-full flex flex-col gap-2">
          <nav className="text-xs text-slate-600" aria-label="Breadcrumb">
            <a href="/" className="text-inherit">
              DXRating
            </a>
            {' › '}
            <a href="/versions" className="text-inherit">
              {t('versions:breadcrumb')}
            </a>
            {' › '}
            <span>{page.version}</span>
          </nav>
          <h1 className="text-3xl font-bold text-slate-950">{t('versions:title', values)}</h1>
          <p className="text-sm text-slate-700">{t('versions:intro', values)}</p>
        </header>

        {page.groups.map((group) => {
          const id = `release-${group.releaseDate ?? 'unknown'}`
          return (
            <section
              key={id}
              id={id}
              aria-labelledby={`${id}-heading`}
              className="w-full bg-white/90 border border-slate-200 rounded-lg shadow-sm overflow-hidden"
            >
              <h2
                id={`${id}-heading`}
                className="flex items-baseline justify-between gap-2 px-4 py-2 m-0 text-lg font-bold text-slate-950 border-b border-slate-200"
              >
                {group.releaseDate ? (
                  <time dateTime={group.releaseDate}>{group.releaseDate}</time>
                ) : (
                  <span>{t('versions:date-unknown')}</span>
                )}
              </h2>
              <ul className="list-none m-0 p-0 divide-y divide-slate-100">
                {group.rows.map((row) => (
                  <li
                    key={`${row.songId}-${row.type}`}
                    className="px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1"
                  >
                    <div className="min-w-0 flex-1 basis-48">
                      <a href={row.href} className="text-slate-950 font-medium">
                        {row.title}
                      </a>
                      <div className="text-xs text-slate-600">
                        {getSheetTypeDisplayName(row.type, locale)} · {row.artist}
                        {row.isNewChartOnly && ` · ${t('versions:new-chart-only')}`}
                      </div>
                    </div>
                    <div className="flex gap-3 text-sm tabular-nums">
                      {row.charts.map((chart) => (
                        <a
                          key={chart.difficulty}
                          href={chart.href}
                          className="no-underline whitespace-nowrap"
                          style={{ color: DIFFICULTIES[chart.difficulty]?.color }}
                          title={DIFFICULTIES[chart.difficulty]?.title}
                        >
                          {chart.level}
                          {chart.constant && <span className="text-xs text-slate-600"> ({chart.constant})</span>}
                        </a>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

        <footer className="flex flex-col gap-2">
          <h2 className="text-base font-bold text-slate-950 m-0">{t('versions:other-versions')}</h2>
          <VersionNav current={page.version} />
        </footer>
      </div>
    </div>
  )
}

export type VersionSummary = { version: VersionEnum; songs: number; charts: number }

export const VersionIndexPage: FC<{ versions: VersionSummary[] }> = ({ versions }) => {
  const { t } = useTranslation(['versions'])

  return (
    <div className="flex-container w-full max-w-5xl px-4 pb-global">
      <div className="w-full flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-slate-950">{t('versions:index.title')}</h1>
          <p className="text-sm text-slate-700">{t('versions:index.intro')}</p>
        </header>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 list-none p-0 m-0">
          {versions.map((entry) => (
            <li key={entry.version}>
              <a
                href={versionPagePath(entry.version)}
                className="block p-4 bg-white/90 border border-slate-200 rounded-lg shadow-sm no-underline text-slate-950 hover:bg-slate-100"
              >
                <div className="text-lg font-bold">{entry.version}</div>
                <div className="text-xs text-slate-600">{t('versions:index.count', entry)}</div>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}