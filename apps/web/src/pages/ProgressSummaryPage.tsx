import { TypeEnum } from '@gekichumai/dxdata'
import { dxScoreProgress, maxDxScore, type VersionedSheet } from '@gekichumai/maimai-domain'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { type CSSProperties, type FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import IconMdiStarFourPoints from '~icons/mdi/star-four-points'
import { useCompleteSongCatalog } from '@/catalog/CatalogContext'
import {
  CONSTANT_TABLE_LEVELS,
  type ConstantTableLevel,
  constantTableSlug,
} from '@/components/chartDiscovery/constantTables'
import {
  COMPLETION_TARGET_LABELS,
  type CompletionTarget,
  DEFAULT_COMPLETION_TARGET,
  meetsTarget,
} from '@/components/completion/completion'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import {
  DemoScoresNotice,
  ImportScoresLink,
  NoScoresState,
  ScorePageFrame,
  ScorePageHeader,
} from '@/components/scores/ScorePage'
import { useUserRecords } from '@/models/useUserRecords'

/** Matrix columns; each cell links into the constant table with that target */
export const PROGRESS_COLUMNS: CompletionTarget[] = ['s', 'ss', 'sss', 'sssp', 'fc', 'ap', 'app', 'fsd']

/** Same chart set as the constant tables: rated standard / DX charts that are on some server */
const isTableSheet = (sheet: VersionedSheet) =>
  (sheet.type === TypeEnum.DX || sheet.type === TypeEnum.STD) &&
  sheet.internalLevelValue > 0 &&
  sheet.serverIds.length > 0

export interface ProgressRow {
  level: ConstantTableLevel
  total: number
  played: number
  counts: Record<CompletionTarget, number>
}

export function buildProgressRows(
  sheets: readonly VersionedSheet[],
  records: ReadonlyMap<string, { best: Parameters<typeof meetsTarget>[0] & object }>,
): ProgressRow[] {
  const rows = new Map<string, ProgressRow>(
    CONSTANT_TABLE_LEVELS.map((level) => [
      level,
      {
        level,
        total: 0,
        played: 0,
        counts: Object.fromEntries(PROGRESS_COLUMNS.map((c) => [c, 0])) as ProgressRow['counts'],
      },
    ]),
  )
  for (const sheet of sheets) {
    const row = rows.get(sheet.level)
    if (!row || !isTableSheet(sheet)) continue
    row.total++
    const record = records.get(sheet.id)?.best
    if (!record) continue
    row.played++
    for (const column of PROGRESS_COLUMNS) if (meetsTarget(record, column)) row.counts[column]++
  }
  return [...rows.values()]
}

/** DX score star columns: charts at or above each star, as the grade columns count a better result too */
export const DX_STAR_COLUMNS = [1, 2, 3, 4, 5] as const

export interface DxStarRow {
  level: ConstantTableLevel
  total: number
  /** Played charts whose best play reports a DX score */
  withDxScore: number
  /** Charts at ✦n or above, index n − 1 */
  atLeast: number[]
  /** Mean share of the maximum over `withDxScore` charts, in percent; null when there are none */
  averagePercent: number | null
}

export function buildDxStarRows(
  sheets: readonly VersionedSheet[],
  records: ReadonlyMap<string, { best: { dxScore: number | null } }>,
): DxStarRow[] {
  const rows = new Map<string, Omit<DxStarRow, 'averagePercent'> & { percentSum: number }>(
    CONSTANT_TABLE_LEVELS.map((level) => [
      level,
      { level, total: 0, withDxScore: 0, atLeast: DX_STAR_COLUMNS.map(() => 0), percentSum: 0 },
    ]),
  )
  for (const sheet of sheets) {
    const row = rows.get(sheet.level)
    if (!row || !isTableSheet(sheet)) continue
    row.total++
    const progress = dxScoreProgress(records.get(sheet.id)?.best.dxScore, maxDxScore(sheet.noteCounts))
    if (!progress) continue
    row.withDxScore++
    row.percentSum += progress.percent
    for (let star = 1; star <= progress.stars; star++) row.atLeast[star - 1]!++
  }
  return [...rows.values()].map(({ percentSum, ...row }) => ({
    ...row,
    averagePercent: row.withDxScore ? Math.floor((percentSum / row.withDxScore) * 100) / 100 : null,
  }))
}

const targetSearch = (target: CompletionTarget) => (target === DEFAULT_COMPLETION_TARGET ? {} : { target })

// The level column stays put while the counts scroll sideways: glass over the scrolled cells, with an edge line
const stickyColumn =
  'sticky left-0 z-1 bg-[var(--glass-bg)] backdrop-blur-md shadow-[inset_-1px_0_0_var(--glass-border)]'

export const ProgressSummaryPage: FC = () => {
  const { t } = useTranslation(['completion'])
  // Totals need every chart: the route's catalog slice has none, so wait for the complete catalog
  const catalog = useCompleteSongCatalog()
  const { bySheetId, isDemo } = useUserRecords()
  const rows = useMemo(() => (catalog ? buildProgressRows(catalog.sheets, bySheetId) : null), [catalog, bySheetId])
  const dxRows = useMemo(() => (catalog ? buildDxStarRows(catalog.sheets, bySheetId) : null), [catalog, bySheetId])

  return (
    <ScorePageFrame width="5xl">
      <ScorePageHeader title={t('completion:progress.title')} description={t('completion:progress.intro')}>
        {isDemo && <DemoScoresNotice className="mt-3">{t('completion:demo')}</DemoScoresNotice>}
      </ScorePageHeader>

      {bySheetId.size === 0 ? (
        <NoScoresState
          title={t('completion:progress.empty-title')}
          description={t('completion:progress.empty')}
          action={<ImportScoresLink>{t('completion:progress.import')}</ImportScoresLink>}
        />
      ) : !rows ? (
        <MaterialSurface className="p-4 text-sm text-fg-2">
          <output>{t('completion:progress.loading')}</output>
        </MaterialSurface>
      ) : (
        <MaterialSurface className="w-full overflow-hidden">
          <div className="scroll-fade-x scroll-fade-x-end-only overflow-x-auto overscroll-x-contain">
            {/* Fixed layout from md: the eight target columns share the width equally, so the heat cells form an even
                grid. Below md the table keeps its natural width and scrolls sideways under the sticky level column */}
            <table className="w-full text-sm border-collapse md:table-fixed">
              <colgroup>
                <col className="md:w-24" />
                <col className="md:w-28" />
                {PROGRESS_COLUMNS.map((column) => (
                  <col key={column} />
                ))}
              </colgroup>
              <thead className="text-xs text-left text-fg-2">
                <tr>
                  <th scope="col" className={clsx('px-3 py-2 font-semibold', stickyColumn)}>
                    {t('completion:progress.level')}
                  </th>
                  <th scope="col" className="px-2 py-2 font-semibold text-right whitespace-nowrap">
                    {t('completion:progress.played')}
                  </th>
                  {PROGRESS_COLUMNS.map((column) => (
                    <th key={column} scope="col" className="px-2 py-2 font-semibold text-right whitespace-nowrap">
                      {COMPLETION_TARGET_LABELS[column]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.level}
                    className="border-t border-solid border-[var(--glass-border)] border-x-0 border-b-0"
                  >
                    <th scope="row" className={clsx('px-1 py-1 text-left whitespace-nowrap', stickyColumn)}>
                      <Link
                        to="/constants/$level"
                        params={{ level: constantTableSlug(row.level) }}
                        className="block px-2 py-1 rounded-[var(--radius-sm)] font-semibold text-accent-strong no-underline hover:underline"
                      >
                        Lv.{row.level}
                      </Link>
                    </th>
                    <td className="px-2 py-2 text-right num whitespace-nowrap text-fg-1">
                      {row.played}
                      <span className="text-fg-2">/{row.total}</span>
                    </td>
                    {PROGRESS_COLUMNS.map((column) => {
                      const count = row.counts[column]
                      const ratio = row.total ? count / row.total : 0
                      return (
                        <td key={column} className="px-1 py-1 text-right num">
                          <Link
                            to="/constants/$level"
                            params={{ level: constantTableSlug(row.level) }}
                            search={targetSearch(column)}
                            // Fill strength is the share cleared, tinted with the version accent
                            style={
                              count
                                ? ({ '--fill': `${Math.round((0.08 + ratio * 0.34) * 100)}%` } as CSSProperties)
                                : undefined
                            }
                            className={clsx(
                              'block px-1.5 py-1 rounded-[var(--radius-sm)] no-underline text-fg-1',
                              'outline-offset-[-1px] hover:outline hover:outline-1 hover:outline-[var(--accent-strong)]',
                              count && 'bg-[color-mix(in_oklab,var(--accent)_var(--fill),transparent)]',
                            )}
                            aria-label={t('completion:progress.cell-label', {
                              level: row.level,
                              target: COMPLETION_TARGET_LABELS[column],
                              count,
                              total: row.total,
                            })}
                          >
                            {count}
                          </Link>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MaterialSurface>
      )}

      {rows && dxRows && dxRows.some((row) => row.withDxScore > 0) && <DxStarTable rows={dxRows} />}
    </ScorePageFrame>
  )
}
/**
 * DX score stars per level, under the grade matrix: charts at or above each star, filled like the grade cells, and
 * the mean share of the maximum. Only charts whose best play reports a DX score count; the played column says how
 * many that is. The constant tables have no DX score target, so these cells are not links.
 */
const DxStarTable: FC<{ rows: DxStarRow[] }> = ({ rows }) => {
  const { t } = useTranslation(['completion'])
  return (
    <section aria-labelledby="dx-star-progress-title" className="mt-6">
      <h2 id="dx-star-progress-title" className="mb-1 text-base font-semibold text-fg-1">
        {t('completion:progress.dx.title')}
      </h2>
      <p className="mb-3 text-sm text-fg-2 text-pretty max-w-[65ch]">{t('completion:progress.dx.intro')}</p>
      <MaterialSurface className="w-full overflow-hidden">
        <div className="scroll-fade-x scroll-fade-x-end-only overflow-x-auto overscroll-x-contain">
          <table className="w-full text-sm border-collapse md:table-fixed">
            <colgroup>
              <col className="md:w-24" />
              <col className="md:w-28" />
              {DX_STAR_COLUMNS.map((star) => (
                <col key={star} />
              ))}
              <col className="md:w-28" />
            </colgroup>
            <thead className="text-xs text-left text-fg-2">
              <tr>
                <th scope="col" className={clsx('px-3 py-2 font-semibold', stickyColumn)}>
                  {t('completion:progress.level')}
                </th>
                <th scope="col" className="px-2 py-2 font-semibold text-right whitespace-nowrap">
                  {t('completion:progress.dx.with-score')}
                </th>
                {DX_STAR_COLUMNS.map((star) => (
                  <th key={star} scope="col" className="px-2 py-2 font-semibold text-right whitespace-nowrap">
                    <span className="inline-flex items-center justify-end gap-px text-[#8A5A00] dark:text-[#F2C94C]">
                      <IconMdiStarFourPoints aria-hidden className="size-[0.95em]" />
                      <span aria-hidden>{star}</span>
                    </span>
                    <span className="sr-only">{t('completion:progress.dx.star', { star })}</span>
                  </th>
                ))}
                <th scope="col" className="px-2 py-2 font-semibold text-right whitespace-nowrap">
                  {t('completion:progress.dx.average')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.level}
                  className="border-t border-solid border-[var(--glass-border)] border-x-0 border-b-0"
                >
                  <th scope="row" className={clsx('px-3 py-2 text-left whitespace-nowrap font-semibold', stickyColumn)}>
                    Lv.{row.level}
                  </th>
                  <td className="px-2 py-2 text-right num whitespace-nowrap text-fg-1">
                    {row.withDxScore}
                    <span className="text-fg-2">/{row.total}</span>
                  </td>
                  {DX_STAR_COLUMNS.map((star, index) => {
                    const count = row.atLeast[index]!
                    const ratio = row.total ? count / row.total : 0
                    return (
                      <td key={star} className="px-1 py-1 text-right num">
                        <span
                          style={
                            count
                              ? ({ '--fill': `${Math.round((0.08 + ratio * 0.34) * 100)}%` } as CSSProperties)
                              : undefined
                          }
                          className={clsx(
                            'block px-1.5 py-1 rounded-[var(--radius-sm)] text-fg-1',
                            count && 'bg-[color-mix(in_oklab,var(--accent)_var(--fill),transparent)]',
                          )}
                        >
                          <span aria-hidden>{count}</span>
                          <span className="sr-only">
                            {t('completion:progress.dx.cell-label', {
                              level: row.level,
                              star,
                              count,
                              total: row.total,
                            })}
                          </span>
                        </span>
                      </td>
                    )
                  })}
                  <td className="px-2 py-2 text-right num whitespace-nowrap text-fg-1">
                    {row.averagePercent === null ? (
                      <span className="text-fg-2" aria-hidden>
                        –
                      </span>
                    ) : (
                      `${row.averagePercent.toFixed(2)}%`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MaterialSurface>
    </section>
  )
}