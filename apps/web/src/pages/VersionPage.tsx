import clsx from 'clsx'
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
} from '@/components/completion/TableChrome'
import { VersionLogo } from '@/components/version/VersionLogo'
import { VersionEraSections, VersionPairGrid } from '@/components/version/VersionPairList'
import { pairVersionsByEra } from '@/components/version/versionEras'
import { getSheetTypeDisplayName } from '@/components/song/sheetDisplay'
import { DIFFICULTIES } from '@/models/difficulties'
import { DEFAULT_LOCALE, toSupportedLocale } from '@/setup/locale'

const tileClassName = (current: boolean) =>
  clsx(
    'flex items-center gap-3 min-w-0 h-full no-underline text-fg-1 rounded-[var(--radius-md)] transition-shadow duration-[var(--duration-fast)] ease-[var(--ease-out)]',
    current
      ? 'glass ring-2 ring-[var(--accent)] ring-inset'
      : 'glass hover:shadow-[var(--shadow-1-hover)] focus-visible:shadow-[var(--shadow-1-hover)]',
  )

/** The other versions, compact: logo and name in rows of base | PLUS, on the page of the current version's era */
const VersionNav: FC<{ current: VersionEnum; labelledBy: string }> = ({ current, labelledBy }) => {
  return (
    <nav aria-labelledby={labelledBy}>
      <VersionEraSections idPrefix="other-versions-era" headingLevel="h3" className="gap-4">
        {(era) => (
          <VersionPairGrid
            className="gap-x-4 sm:grid-cols-2 lg:grid-cols-4"
            pairs={pairVersionsByEra(VERSION_PAGE_VERSIONS, era)}
            renderVersion={(version) => (
              <a
                key={version}
                href={versionPagePath(version)}
                aria-current={version === current ? 'page' : undefined}
                title={version}
                className={clsx(tileClassName(version === current), 'justify-center p-1')}
              >
                <VersionLogo version={version} className="h-9 text-[0.625rem]" />
              </a>
            )}
          />
        )}
      </VersionEraSections>
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
          <Breadcrumb items={[{ href: '/versions', label: t('versions:breadcrumb') }, { label: page.version }]} />
          <div className="flex items-center gap-3">
            <VersionLogo version={page.version} decorative className="h-14 sm:h-16 text-sm" />
            <h1 className="page-title m-0 [word-break:auto-phrase]">{t('versions:title', values)}</h1>
          </div>
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
  const summaries = new Map(versions.map((entry) => [entry.version, entry]))
  const listed = versions.map((entry) => entry.version)

  return (
    <div className="flex-container w-full max-w-6xl px-4 pb-global">
      <div className="w-full flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <Breadcrumb items={[{ label: t('versions:breadcrumb') }]} />
          <h1 className="page-title m-0 [word-break:auto-phrase]">{t('versions:index.title')}</h1>
          <p className="page-description m-0">{t('versions:index.intro')}</p>
        </header>
        <VersionEraSections idPrefix="era" jumpNav>
          {(era) => (
            <VersionPairGrid
              className="gap-y-3 lg:grid-cols-2 lg:gap-x-6"
              pairs={pairVersionsByEra(listed, era)}
              renderVersion={(version) => {
                const entry = summaries.get(version)
                return (
                  <a
                    key={version}
                    href={versionPagePath(version)}
                    className={clsx(tileClassName(false), 'max-sm:flex-col max-sm:gap-1 p-2 sm:p-3')}
                  >
                    <VersionLogo version={version} decorative className="h-12 sm:h-14 lg:h-12 text-xs" />
                    <span className="flex min-w-0 flex-col max-sm:items-center max-sm:text-center">
                      <span className="text-sm sm:text-base font-semibold [overflow-wrap:anywhere]" translate="no">
                        {version}
                      </span>
                      {entry && <span className="text-xs text-fg-2 num">{t('versions:index.count', entry)}</span>}
                    </span>
                  </a>
                )
              }}
            />
          )}
        </VersionEraSections>
      </div>
    </div>
  )
}