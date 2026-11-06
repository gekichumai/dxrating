import { TypeEnum } from '@gekichumai/dxdata'
import type { VersionedSheet } from '@gekichumai/maimai-domain'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { type CSSProperties, type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

const targetSearch = (target: CompletionTarget) => (target === DEFAULT_COMPLETION_TARGET ? {} : { target })

/** Whether a horizontal scroller still has content past its end edge, to show the edge fade only then */
function useOverflowEnd<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [hasMore, setHasMore] = useState(false)
  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    setHasMore(el.scrollWidth - el.clientWidth - Math.abs(el.scrollLeft) > 1)
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    el.addEventListener('scroll', measure, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', measure)
    }
  }, [measure])
  return { ref, hasMore, measure }
}

// The level column stays put while the counts scroll sideways: glass over the scrolled cells, with an edge line
const stickyColumn =
  'sticky left-0 z-1 bg-[var(--glass-bg)] backdrop-blur-md shadow-[inset_-1px_0_0_var(--glass-border)]'

export const ProgressSummaryPage: FC = () => {
  const { t } = useTranslation(['completion'])
  // Totals need every chart: the route's catalog slice has none, so wait for the complete catalog
  const catalog = useCompleteSongCatalog()
  const { bySheetId, isDemo } = useUserRecords()
  const rows = useMemo(() => (catalog ? buildProgressRows(catalog.sheets, bySheetId) : null), [catalog, bySheetId])

  const scroller = useOverflowEnd<HTMLDivElement>()
  const { measure } = scroller
  useEffect(measure, [rows, measure])

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
        <MaterialSurface
          ref={scroller.ref}
          className={clsx(
            'w-full overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]',
            scroller.hasMore && '[mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]',
          )}
        >
          <table className="w-full text-sm border-collapse">
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
        </MaterialSurface>
      )}
    </ScorePageFrame>
  )
}