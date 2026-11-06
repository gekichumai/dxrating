import { type FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import MdiCheckCircle from '~icons/mdi/check-circle'
import {
  CONSTANT_TABLE_LEVELS,
  constantTablePath,
  type ConstantTable,
} from '@/components/chartDiscovery/constantTables'
import {
  Breadcrumb,
  difficultyTextClassName,
  difficultyTextStyle,
  SegmentedNav,
  useHorizontalOverflow,
} from '@/components/completion/TableChrome'
import { CompletionBadges } from '@/components/completion/CompletionBadges'
import { CompletionToolbar } from '@/components/completion/CompletionToolbar'
import { useCompletionOverlay } from '@/components/completion/useCompletionOverlay'
import { getSheetTitleLabel } from '@/components/song/sheetDisplay'
import { DEFAULT_LOCALE, type SupportedLocale, toSupportedLocale } from '@/setup/locale'

export const constantTableRange = (table: ConstantTable) => ({
  max: table.groups[0]?.constant ?? '-',
  min: table.groups.at(-1)?.constant ?? '-',
})

const LevelNav: FC<{ current?: string }> = ({ current }) => {
  const { t } = useTranslation(['constants'])

  return (
    <SegmentedNav
      label={t('constants:other-levels')}
      items={CONSTANT_TABLE_LEVELS.map((level) => ({
        key: level,
        href: constantTablePath(level),
        label: `Lv.${level}`,
        current: level === current,
      }))}
    />
  )
}

type ConstantChart = ConstantTable['groups'][number]['charts'][number]

const ConstantGroup: FC<{
  constant: string
  total: number
  charts: ConstantChart[]
  overlay: ReturnType<typeof useCompletionOverlay>
  locale: SupportedLocale
}> = ({ constant, total, charts, overlay, locale }) => {
  const { t } = useTranslation(['constants', 'completion'])
  const { ref, overflowing, scrolled, fade } = useHorizontalOverflow<HTMLDivElement>()
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale])
  // Only when the table actually scrolls: the song column stays put, on an opaque tint of the glass
  const sticky = overflowing
    ? `sticky left-0 z-1 bg-[color-mix(in_oklab,var(--accent)_5%,rgb(var(--surface-rgb)))] ${scrolled ? 'shadow-[1px_0_0_var(--glass-border)]' : ''}`
    : ''
  const headingId = `constant-${constant}`

  return (
    <section aria-labelledby={headingId} className="glass w-full overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 px-4 py-2 border-b border-b-solid border-[var(--glass-border)]">
        <h2 id={headingId} className="m-0 text-lg font-semibold text-fg-1">
          {t('constants:group', { constant })}
        </h2>
        <span className="text-xs text-fg-2 num">{t('constants:group-count', { count: total })}</span>
      </div>
      <div ref={ref} className={`overflow-x-auto [overscroll-behavior-x:contain] ${fade}`}>
        <table className="w-full text-sm border-collapse">
          <thead className="text-xs text-fg-2 text-left">
            <tr>
              <th className={`px-4 py-1 font-normal ${sticky}`}>{t('constants:col.song')}</th>
              <th className="px-2 py-1 font-normal hidden sm:table-cell">{t('constants:col.chart')}</th>
              <th className="px-2 py-1 font-normal hidden sm:table-cell">{t('constants:col.version')}</th>
              <th className="px-2 py-1 font-normal text-right hidden sm:table-cell">{t('constants:col.notes')}</th>
              <th className="pl-2 pr-4 sm:pr-2 py-1 font-normal text-right">{t('constants:col.sssp')}</th>
              <th className="px-4 py-1 font-normal text-right hidden sm:table-cell">{t('constants:col.sss')}</th>
              {overlay.active && <th className="pl-2 pr-4 py-1 font-normal text-right">{t('completion:col-mine')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {charts.map((chart) => {
              const done = overlay.active && overlay.statusOf(chart.sheetId) === 'done'
              const ink = difficultyTextStyle(chart.difficulty)
              return (
                <tr
                  key={chart.href}
                  className={done ? 'bg-[color-mix(in_oklab,var(--status-positive)_7%,transparent)]' : undefined}
                >
                  <td className={`px-4 py-1.5 ${sticky}`}>
                    <a
                      href={chart.href}
                      lang="ja"
                      className="text-fg-1 font-semibold no-underline hover:underline underline-offset-2 [overflow-wrap:anywhere]"
                    >
                      {chart.title}
                    </a>
                    <div lang="ja" className="text-xs text-fg-2 [overflow-wrap:anywhere]">
                      {chart.artist}
                    </div>
                    <div className={`sm:hidden text-xs font-semibold ${difficultyTextClassName}`} style={ink}>
                      {getSheetTitleLabel(chart, locale)}
                    </div>
                  </td>
                  <td
                    className={`px-2 py-1.5 whitespace-nowrap font-semibold hidden sm:table-cell ${difficultyTextClassName}`}
                    style={ink}
                  >
                    {getSheetTitleLabel(chart, locale)}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-fg-2 hidden sm:table-cell">{chart.version}</td>
                  <td className="px-2 py-1.5 text-right num hidden sm:table-cell">
                    {chart.notes === undefined || chart.notes === null ? '–' : number.format(chart.notes)}
                  </td>
                  <td className="pl-2 pr-4 sm:pr-2 py-1.5 text-right num">{chart.ratingSssPlus}</td>
                  <td className="px-4 py-1.5 text-right num hidden sm:table-cell">{chart.ratingSss}</td>
                  {overlay.active && (
                    <td className="pl-2 pr-4 py-1.5 text-right">
                      <span className="inline-flex items-center justify-end gap-1">
                        {done && (
                          <>
                            <MdiCheckCircle className="size-4 shrink-0 text-emerald-700" aria-hidden />
                            <span className="sr-only">{t('completion:status-done-sr')}</span>
                          </>
                        )}
                        <CompletionBadges record={overlay.records.get(chart.sheetId)?.best} />
                      </span>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export const ConstantTablePage: FC<{ table: ConstantTable }> = ({ table }) => {
  const { i18n, t } = useTranslation(['constants', 'completion'])
  const locale = toSupportedLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE
  const range = constantTableRange(table)
  // Client-only: the server HTML (edge-cached) never contains the visitor's records
  const overlay = useCompletionOverlay(table)

  return (
    <div className="flex-container w-full max-w-5xl px-4 pb-global">
      <div className="w-full flex flex-col gap-4">
        <header className="w-full flex flex-col gap-2">
          <Breadcrumb
            items={[{ href: '/constants', label: t('constants:breadcrumb') }, { label: `Lv.${table.level}` }]}
          />
          <h1 className="page-title m-0 [word-break:auto-phrase]">{t('constants:title', { level: table.level })}</h1>
          <p className="page-description m-0">
            {t('constants:intro', { level: table.level, count: table.chartCount, ...range })}
          </p>
          <LevelNav current={table.level} />
        </header>

        <CompletionToolbar table={table} overlay={overlay} />

        {table.groups.map((group) => {
          const charts = group.charts.filter((chart) => overlay.isVisible(chart.sheetId))
          if (charts.length === 0) return null
          return (
            <ConstantGroup
              key={group.constant}
              constant={group.constant}
              total={group.charts.length}
              charts={charts}
              overlay={overlay}
              locale={locale}
            />
          )
        })}
      </div>
    </div>
  )
}

export type ConstantTableSummary = {
  level: (typeof CONSTANT_TABLE_LEVELS)[number]
  count: number
  min: string
  max: string
}

export const ConstantTableIndexPage: FC<{ tables: ConstantTableSummary[] }> = ({ tables }) => {
  const { t } = useTranslation(['constants'])

  return (
    <div className="flex-container w-full max-w-5xl px-4 pb-global">
      <div className="w-full flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <Breadcrumb items={[{ label: t('constants:breadcrumb') }]} />
          <h1 className="page-title m-0 [word-break:auto-phrase]">{t('constants:index.title')}</h1>
          <p className="page-description m-0">{t('constants:index.intro')}</p>
        </header>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 list-none p-0 m-0">
          {tables.map((table) => (
            <li key={table.level}>
              <a
                href={constantTablePath(table.level)}
                className="glass block h-full p-4 no-underline text-fg-1 transition-shadow duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:shadow-[var(--shadow-1-hover)]"
              >
                <div className="text-xl font-semibold">{t('constants:index.level', { level: table.level })}</div>
                <div className="text-xs text-fg-2 num">
                  {table.min === table.max
                    ? t('constants:index.level-count-single', { count: table.count, value: table.min })
                    : t('constants:index.level-count', table)}
                </div>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}