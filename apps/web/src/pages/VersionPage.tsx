import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import type { VersionEnum } from '@gekichumai/dxdata'
import {
  VERSION_PAGE_VERSIONS,
  versionPagePath,
  type VersionPage as VersionPageData,
} from '@/components/chartDiscovery/versionPages'
import {
  Breadcrumb,
  DIFFICULTY_SHORT,
  difficultyTextClassName,
  difficultyTextStyle,
  SegmentedNav,
} from '@/components/completion/TableChrome'
import { getSheetTypeDisplayName } from '@/components/song/sheetDisplay'
import { DIFFICULTIES } from '@/models/difficulties'
import { DEFAULT_LOCALE, toSupportedLocale } from '@/setup/locale'

const VersionNav: FC<{ current?: VersionEnum; labelledBy?: string }> = ({ current, labelledBy }) => (
  <SegmentedNav
    labelledBy={labelledBy}
    items={VERSION_PAGE_VERSIONS.map((version) => ({
      key: version,
      href: versionPagePath(version),
      label: version,
      current: version === current,
    }))}
  />
)

export const VersionPage: FC<{ page: VersionPageData }> = ({ page }) => {
  const { i18n, t } = useTranslation(['versions'])
  const locale = toSupportedLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE
  const values = { version: page.version, songs: page.songCount, charts: page.chartCount }

  return (
    <div className="flex-container w-full max-w-5xl px-4 pb-global">
      <div className="w-full flex flex-col gap-4">
        <header className="w-full flex flex-col gap-2">
          <Breadcrumb items={[{ href: '/versions', label: t('versions:breadcrumb') }, { label: page.version }]} />
          <h1 className="page-title m-0 [word-break:auto-phrase]">{t('versions:title', values)}</h1>
          <p className="page-description m-0">{t('versions:intro', values)}</p>
        </header>

        {page.groups.map((group) => {
          const id = `release-${group.releaseDate ?? 'unknown'}`
          return (
            <section key={id} id={id} aria-labelledby={`${id}-heading`} className="glass w-full overflow-hidden">
              <h2
                id={`${id}-heading`}
                className="px-4 py-2 m-0 text-lg font-semibold text-fg-1 num border-b border-b-solid border-[var(--glass-border)]"
              >
                {group.releaseDate ? (
                  <time dateTime={group.releaseDate}>{group.releaseDate}</time>
                ) : (
                  <span>{t('versions:date-unknown')}</span>
                )}
              </h2>
              <ul className="list-none m-0 p-0 divide-y divide-black/5">
                {group.rows.map((row) => (
                  <li
                    key={`${row.songId}-${row.type}`}
                    className="px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1"
                  >
                    <div className="min-w-0 flex-1 basis-48">
                      <a
                        href={row.href}
                        lang="ja"
                        className="text-fg-1 font-semibold no-underline hover:underline underline-offset-2 [overflow-wrap:anywhere]"
                      >
                        {row.title}
                      </a>
                      <div className="text-xs text-fg-2">
                        {getSheetTypeDisplayName(row.type, locale)} · <span lang="ja">{row.artist}</span>
                        {row.isNewChartOnly && ` · ${t('versions:new-chart-only')}`}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm num">
                      {row.charts.map((chart) => (
                        <a
                          key={chart.difficulty}
                          href={chart.href}
                          className={`no-underline hover:underline underline-offset-2 whitespace-nowrap ${difficultyTextClassName}`}
                          style={difficultyTextStyle(chart.difficulty)}
                        >
                          <span aria-hidden className="text-xs font-semibold me-1">
                            {DIFFICULTY_SHORT[chart.difficulty]}
                          </span>
                          <span className="sr-only">{DIFFICULTIES[chart.difficulty]?.title} </span>
                          <span className="font-semibold">{chart.level}</span>
                          {chart.constant && <span className="text-xs text-fg-2"> ({chart.constant})</span>}
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
          <h2 id="other-versions" className="section-title m-0">
            {t('versions:other-versions')}
          </h2>
          <VersionNav current={page.version} labelledBy="other-versions" />
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
          <Breadcrumb items={[{ label: t('versions:breadcrumb') }]} />
          <h1 className="page-title m-0 [word-break:auto-phrase]">{t('versions:index.title')}</h1>
          <p className="page-description m-0">{t('versions:index.intro')}</p>
        </header>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 list-none p-0 m-0">
          {versions.map((entry) => (
            <li key={entry.version}>
              <a
                href={versionPagePath(entry.version)}
                className="glass block h-full p-4 no-underline text-fg-1 transition-shadow duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:shadow-[var(--shadow-1-hover)]"
              >
                <div className="text-lg font-semibold">{entry.version}</div>
                <div className="text-xs text-fg-2 num">{t('versions:index.count', entry)}</div>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}