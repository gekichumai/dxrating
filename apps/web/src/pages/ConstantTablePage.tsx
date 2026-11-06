import clsx from 'clsx'
import { type FC, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MdiCheckCircle from '~icons/mdi/check-circle'
import MdiViewGrid from '~icons/mdi/view-grid'
import MdiViewList from '~icons/mdi/view-list'
import {
  CONSTANT_TABLE_LEVELS,
  constantTablePath,
  type ConstantTable,
} from '@/components/chartDiscovery/constantTables'
import {
  Breadcrumb,
  DIFFICULTY_SHORT,
  difficultyTextClassName,
  difficultyTextStyle,
  SegmentedNav,
  segmentedItem,
  segmentedTrack,
  useHorizontalOverflow,
} from '@/components/completion/TableChrome'
import { CompletionBadges } from '@/components/completion/CompletionBadges'
import { CompletionToolbar } from '@/components/completion/CompletionToolbar'
import { useCompletionOverlay } from '@/components/completion/useCompletionOverlay'
import { getSheetTitleLabel } from '@/components/song/sheetDisplay'
import { DIFFICULTIES } from '@/models/difficulties'
import { DEFAULT_LOCALE, type SupportedLocale, toSupportedLocale } from '@/setup/locale'
import { InternalLink } from '@/components/global/InternalLink'

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

/** Fragment of an internal level's section, the target of the jump links in both views */
const constantAnchor = (constant: string) => `c${constant.replace('.', '-')}`

type ConstantChart = ConstantTable['groups'][number]['charts'][number]

const ConstantGroupTable: FC<{
  constant: string
  total: number
  charts: ConstantChart[]
  overlay: ReturnType<typeof useCompletionOverlay>
  locale: SupportedLocale
}> = ({ constant, total, charts, overlay, locale }) => {
  const { t } = useTranslation(['constants', 'completion'])
  const { ref, overflowing, scrolled } = useHorizontalOverflow<HTMLDivElement>()
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale])
  // Only when the table actually scrolls: the song column stays put, on an opaque tint of the glass
  const sticky = overflowing
    ? `sticky left-0 z-1 bg-[color-mix(in_oklab,var(--accent)_5%,rgb(var(--surface-rgb)))] ${scrolled ? 'shadow-[1px_0_0_var(--glass-border)]' : ''}`
    : ''
  const headingId = `constant-${constant}`

  return (
    <section
      aria-labelledby={headingId}
      id={constantAnchor(constant)}
      className="glass w-full overflow-hidden scroll-mt-2"
    >
      <div className="flex items-baseline justify-between gap-2 px-4 py-2 border-b border-b-solid border-[var(--glass-border)]">
        <h2 id={headingId} className="m-0 text-lg font-semibold text-fg-1">
          {t('constants:group', { constant })}
        </h2>
        <span className="text-xs text-fg-2 num">{t('constants:group-count', { count: total })}</span>
      </div>
      <div ref={ref} className="scroll-fade-x scroll-fade-x-end-only overflow-x-auto [overscroll-behavior-x:contain]">
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
                    <InternalLink
                      href={chart.href}
                      lang="ja"
                      className="text-fg-1 font-semibold no-underline hover:underline underline-offset-2 [overflow-wrap:anywhere]"
                    >
                      {chart.title}
                    </InternalLink>
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

/** `grid` (album art, the default) or `table` (one row per chart, with notes and ratings); kept in `?view=` */
type ConstantTableView = 'grid' | 'table'
const VIEW_QUERY_PARAM = 'view'

/**
 * The view, client-only like the completion target: the server and first client render are always the grid, so the
 * edge-cached HTML is the same for everyone; `?view=table` switches after mount.
 */
function useConstantTableView() {
  const [view, setViewState] = useState<ConstantTableView>('grid')
  useEffect(() => {
    if (new URL(window.location.href).searchParams.get(VIEW_QUERY_PARAM) === 'table') setViewState('table')
  }, [])
  const setView = (next: ConstantTableView) => {
    setViewState(next)
    const url = new URL(window.location.href)
    if (next === 'grid') url.searchParams.delete(VIEW_QUERY_PARAM)
    else url.searchParams.set(VIEW_QUERY_PARAM, next)
    window.history.replaceState(window.history.state, '', url)
  }
  return [view, setView] as const
}

const TYPE_SHORT: Partial<Record<ConstantChart['type'], string>> = { dx: 'DX', std: 'STD' }

const coverSrc = (imageName: string) => `https://shama.dxrating.net/images/cover/v2/${imageName}.jpg`

const ConstantTile: FC<{
  chart: ConstantChart
  overlay: ReturnType<typeof useCompletionOverlay>
  locale: SupportedLocale
}> = ({ chart, overlay, locale }) => {
  const { t } = useTranslation(['completion'])
  const done = overlay.active && overlay.statusOf(chart.sheetId) === 'done'
  const difficulty = DIFFICULTIES[chart.difficulty]
  const label = `${chart.title} · ${getSheetTitleLabel(chart, locale)} ${chart.internalLevelValue.toFixed(1)}`
  const record = overlay.active ? overlay.records.get(chart.sheetId)?.best : undefined

  return (
    <li className="min-w-0">
      <InternalLink
        href={chart.href}
        title={label}
        className="group flex min-w-0 flex-col gap-1 no-underline text-fg-1"
      >
        <span
          className={clsx(
            'relative block aspect-square overflow-hidden rounded-[var(--radius-md)] outline outline-1 -outline-offset-1 outline-black/10 bg-black/6',
            'transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out)] group-hover:-translate-y-0.5 group-focus-visible:-translate-y-0.5',
            done && 'ring-2 ring-[var(--status-positive)] ring-offset-1 ring-offset-transparent',
          )}
        >
          <img
            src={coverSrc(chart.imageName)}
            width={190}
            height={190}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
          {/* The difficulty along the bottom edge, and as a short label so it never rests on colour alone */}
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-1" style={{ background: difficulty?.color }} />
          <span aria-hidden className="absolute left-1 top-1 flex gap-0.5 text-[0.625rem] font-bold leading-none">
            {/* Short in every locale: a tile is too narrow for でらっくす / スタンダード */}
            <span className="rounded-[var(--radius-xs)] bg-[rgb(0_0_0/0.7)] px-1 py-0.5 text-white">
              {TYPE_SHORT[chart.type] ?? chart.type}
            </span>
            <span
              className="rounded-[var(--radius-xs)] px-1 py-0.5 text-white"
              style={{ background: difficulty?.solid }}
            >
              {DIFFICULTY_SHORT[chart.difficulty]}
            </span>
          </span>
          {done && (
            <MdiCheckCircle
              aria-hidden
              className="absolute bottom-1.5 right-1 size-4 rounded-full bg-white text-[var(--status-positive)]"
            />
          )}
        </span>
        <span lang="ja" className="truncate text-xs font-medium leading-tight group-hover:underline underline-offset-2">
          {chart.title}
        </span>
        <span className="sr-only">
          {getSheetTitleLabel(chart, locale)} {chart.internalLevelValue.toFixed(1)}
          {done && ` ${t('completion:status-done-sr')}`}
        </span>
        {overlay.active && (
          <span className="-mt-0.5 flex min-h-5 [&>span]:justify-start [&>span]:gap-0.5 [&_span]:text-[0.625rem]">
            <CompletionBadges record={record} />
          </span>
        )}
      </InternalLink>
    </li>
  )
}

const ConstantGroupGrid: FC<{
  constant: string
  total: number
  charts: ConstantChart[]
  overlay: ReturnType<typeof useCompletionOverlay>
  locale: SupportedLocale
}> = ({ constant, total, charts, overlay, locale }) => {
  const { t } = useTranslation(['constants'])
  const headingId = `constant-${constant}`

  return (
    <section
      aria-labelledby={headingId}
      className="flex w-full flex-col gap-2 scroll-mt-2"
      id={constantAnchor(constant)}
    >
      <div className="glass-thin sticky top-1 z-2 flex items-baseline justify-between gap-2 px-3 py-1.5">
        <h2 id={headingId} className="m-0 text-base font-semibold text-fg-1 num">
          {t('constants:group', { constant })}
        </h2>
        <span className="text-xs text-fg-2 num">{t('constants:group-count', { count: total })}</span>
      </div>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-x-2 gap-y-2.5 p-0 sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(6rem,1fr))]">
        {charts.map((chart) => (
          <ConstantTile key={chart.href} chart={chart} overlay={overlay} locale={locale} />
        ))}
      </ul>
    </section>
  )
}

const ViewToggle: FC<{ view: ConstantTableView; onChange: (view: ConstantTableView) => void }> = ({
  view,
  onChange,
}) => {
  const { t } = useTranslation(['constants'])
  const options = [
    { value: 'grid' as const, icon: MdiViewGrid, label: t('constants:view.grid') },
    { value: 'table' as const, icon: MdiViewList, label: t('constants:view.table') },
  ]
  return (
    <fieldset className={`${segmentedTrack} m-0 min-w-0 flex-nowrap`}>
      <legend className="sr-only">{t('constants:view.label')}</legend>
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => onChange(value)}
          className={clsx(segmentedItem(view === value), 'cursor-pointer gap-1.5 border-0 font-inherit')}
        >
          <Icon aria-hidden className="size-4" />
          {label}
        </button>
      ))}
    </fieldset>
  )
}

/** Jump links to each internal level, so a long level (13, 13+) is quick to move around */
const ConstantJumpNav: FC<{ constants: string[] }> = ({ constants }) => {
  const { t } = useTranslation(['constants'])
  return (
    <nav aria-label={t('constants:jump-label')} className={`${segmentedTrack} min-w-0`}>
      {constants.map((constant) => (
        <a key={constant} href={`#${constantAnchor(constant)}`} className={clsx(segmentedItem(false), 'num !px-2')}>
          {constant}
        </a>
      ))}
    </nav>
  )
}

export const ConstantTablePage: FC<{ table: ConstantTable }> = ({ table }) => {
  const { i18n, t } = useTranslation(['constants', 'completion'])
  const locale = toSupportedLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE
  const range = constantTableRange(table)
  // Client-only: the server HTML (edge-cached) never contains the visitor's records
  const overlay = useCompletionOverlay(table)
  const [view, setView] = useConstantTableView()

  return (
    <div className="flex-container w-full max-w-7xl px-4 pb-global">
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

        <div className="flex flex-wrap items-start justify-between gap-2">
          <ConstantJumpNav constants={table.groups.map((group) => group.constant)} />
          <ViewToggle view={view} onChange={setView} />
        </div>

        {table.groups.map((group) => {
          const charts = group.charts.filter((chart) => overlay.isVisible(chart.sheetId))
          if (charts.length === 0) return null
          const Group = view === 'grid' ? ConstantGroupGrid : ConstantGroupTable
          return (
            <Group
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
              <InternalLink
                href={constantTablePath(table.level)}
                className="glass block h-full p-4 no-underline text-fg-1 transition-shadow duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:shadow-[var(--shadow-1-hover)]"
              >
                <div className="text-xl font-semibold">{t('constants:index.level', { level: table.level })}</div>
                <div className="text-xs text-fg-2 num">
                  {table.min === table.max
                    ? t('constants:index.level-count-single', { count: table.count, value: table.min })
                    : t('constants:index.level-count', table)}
                </div>
              </InternalLink>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}