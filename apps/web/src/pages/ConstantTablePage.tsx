import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CONSTANT_TABLE_LEVELS,
  constantTablePath,
  type ConstantTable,
} from '@/components/chartDiscovery/constantTables'
import { CompletionBadges } from '@/components/completion/CompletionBadges'
import { CompletionToolbar } from '@/components/completion/CompletionToolbar'
import { useCompletionOverlay } from '@/components/completion/useCompletionOverlay'
import { getSheetTitleLabel } from '@/components/song/sheetDisplay'
import { DIFFICULTIES } from '@/models/difficulties'
import { DEFAULT_LOCALE, toSupportedLocale } from '@/setup/locale'

export const constantTableRange = (table: ConstantTable) => ({
  max: table.groups[0]?.constant ?? '-',
  min: table.groups.at(-1)?.constant ?? '-',
})

const LevelNav: FC<{ current?: string }> = ({ current }) => {
  const { t } = useTranslation(['constants'])

  return (
    <nav aria-label={t('constants:other-levels')} className="flex flex-wrap gap-2">
      {CONSTANT_TABLE_LEVELS.map((level) => (
        <a
          key={level}
          href={constantTablePath(level)}
          aria-current={level === current ? 'page' : undefined}
          className={`px-3 py-1 rounded-full text-sm no-underline border ${
            level === current
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white/90 text-slate-900 border-slate-300 hover:bg-slate-100'
          }`}
        >
          Lv.{level}
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

  return (
    <div className="flex-container w-full max-w-5xl px-4 pb-global">
      <div className="w-full flex flex-col gap-4">
        <header className="w-full flex flex-col gap-2">
          <nav className="text-xs text-slate-600" aria-label="Breadcrumb">
            <a href="/" className="text-inherit">
              DXRating
            </a>
            {' › '}
            <a href="/constants" className="text-inherit">
              {t('constants:breadcrumb')}
            </a>
            {' › '}
            <span>Lv.{table.level}</span>
          </nav>
          <h1 className="text-3xl font-bold text-slate-950">{t('constants:title', { level: table.level })}</h1>
          <p className="text-sm text-slate-700">
            {t('constants:intro', { level: table.level, count: table.chartCount, ...range })}
          </p>
          <LevelNav current={table.level} />
        </header>

        <CompletionToolbar table={table} overlay={overlay} />

        {table.groups.map((group) => {
          const charts = group.charts.filter((chart) => overlay.isVisible(chart.sheetId))
          if (charts.length === 0) return null
          return (
            <section
              key={group.constant}
              aria-labelledby={`constant-${group.constant}`}
              className="w-full bg-white/90 border border-slate-200 rounded-lg shadow-sm overflow-x-auto"
            >
              <h2
                id={`constant-${group.constant}`}
                className="flex items-baseline justify-between gap-2 px-4 py-2 m-0 text-lg font-bold text-slate-950 border-b border-slate-200"
              >
                <span>{t('constants:group', { constant: group.constant })}</span>
                <span className="text-xs font-normal text-slate-600">
                  {t('constants:group-count', { count: group.charts.length })}
                </span>
              </h2>
              <table className="w-full text-sm border-collapse">
                <thead className="text-xs text-slate-600 text-left">
                  <tr>
                    <th className="px-4 py-1 font-normal">{t('constants:col.song')}</th>
                    <th className="px-2 py-1 font-normal">{t('constants:col.chart')}</th>
                    <th className="px-2 py-1 font-normal hidden sm:table-cell">{t('constants:col.version')}</th>
                    <th className="px-2 py-1 font-normal text-right hidden sm:table-cell">
                      {t('constants:col.notes')}
                    </th>
                    <th className="pl-2 pr-4 sm:pr-2 py-1 font-normal text-right">{t('constants:col.sssp')}</th>
                    <th className="px-4 py-1 font-normal text-right hidden sm:table-cell">{t('constants:col.sss')}</th>
                    {overlay.active && (
                      <th className="pl-2 pr-4 py-1 font-normal text-right">{t('completion:col-mine')}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {charts.map((chart) => (
                    <tr
                      key={chart.href}
                      className={
                        overlay.active && overlay.statusOf(chart.sheetId) !== 'done'
                          ? 'opacity-45 transition-opacity'
                          : undefined
                      }
                    >
                      <td className="px-4 py-1.5">
                        <a href={chart.href} className="text-slate-950 font-medium">
                          {chart.title}
                        </a>
                        <div className="text-xs text-slate-600">{chart.artist}</div>
                      </td>
                      <td
                        className="px-2 py-1.5 whitespace-nowrap"
                        style={{ color: DIFFICULTIES[chart.difficulty]?.color }}
                      >
                        {getSheetTitleLabel(chart, locale)}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-slate-700 hidden sm:table-cell">{chart.version}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums hidden sm:table-cell">
                        {chart.notes?.toLocaleString('en-US') ?? '-'}
                      </td>
                      <td className="pl-2 pr-4 sm:pr-2 py-1.5 text-right tabular-nums">{chart.ratingSssPlus}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums hidden sm:table-cell">{chart.ratingSss}</td>
                      {overlay.active && (
                        <td className="pl-2 pr-4 py-1.5 text-right">
                          <CompletionBadges record={overlay.records.get(chart.sheetId)?.entry} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )
        })}

        <footer className="flex flex-col gap-2">
          <h2 className="text-base font-bold text-slate-950 m-0">{t('constants:other-levels')}</h2>
          <LevelNav current={table.level} />
        </footer>
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
          <h1 className="text-3xl font-bold text-slate-950">{t('constants:index.title')}</h1>
          <p className="text-sm text-slate-700">{t('constants:index.intro')}</p>
        </header>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3 list-none p-0 m-0">
          {tables.map((table) => (
            <li key={table.level}>
              <a
                href={constantTablePath(table.level)}
                className="block p-4 bg-white/90 border border-slate-200 rounded-lg shadow-sm no-underline text-slate-950 hover:bg-slate-100"
              >
                <div className="text-xl font-bold">{t('constants:index.level', { level: table.level })}</div>
                <div className="text-xs text-slate-600">{t('constants:index.level-count', table)}</div>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}