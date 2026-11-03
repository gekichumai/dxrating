import { TypeEnum } from '@gekichumai/dxdata'
import type { VersionedSheet } from '@gekichumai/maimai-domain'
import { type FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompleteSongCatalog } from '@/catalog/CatalogContext'
import {
  CONSTANT_TABLE_LEVELS,
  type ConstantTableLevel,
  constantTablePath,
} from '@/components/chartDiscovery/constantTables'
import {
  COMPLETION_TARGET_LABELS,
  type CompletionTarget,
  DEFAULT_COMPLETION_TARGET,
  meetsTarget,
} from '@/components/completion/completion'
import { MaterialSurface } from '@/components/global/MaterialSurface'
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

const targetHref = (level: ConstantTableLevel, target: CompletionTarget) =>
  target === DEFAULT_COMPLETION_TARGET ? constantTablePath(level) : `${constantTablePath(level)}?target=${target}`

export const ProgressSummaryPage: FC = () => {
  const { t } = useTranslation(['completion'])
  // Totals need every chart: the route's catalog slice has none, so wait for the complete catalog
  const catalog = useCompleteSongCatalog()
  const { bySheetId, isDemo } = useUserRecords()
  const rows = useMemo(() => (catalog ? buildProgressRows(catalog.sheets, bySheetId) : null), [catalog, bySheetId])

  return (
    <div className="flex-container w-full max-w-5xl px-4 pb-global">
      <div className="w-full flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold m-0">{t('completion:progress.title')}</h1>
          <p className="text-sm opacity-80 m-0">{t('completion:progress.intro')}</p>
          {isDemo && <p className="text-xs opacity-70 m-0">{t('completion:demo')}</p>}
        </header>

        {bySheetId.size === 0 ? (
          <MaterialSurface variant="thin" className="px-4 py-3 text-sm flex flex-wrap gap-x-3 gap-y-1">
            <span>{t('completion:empty')}</span>
            <a href="/rating">{t('completion:empty-link')}</a>
          </MaterialSurface>
        ) : !rows ? (
          <MaterialSurface variant="thin" className="px-4 py-3 text-sm">
            <output>{t('completion:progress.loading')}</output>
          </MaterialSurface>
        ) : (
          <MaterialSurface className="w-full overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="text-xs text-left opacity-80">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium sticky left-0">
                    {t('completion:progress.level')}
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium text-right">
                    {t('completion:progress.played')}
                  </th>
                  {PROGRESS_COLUMNS.map((column) => (
                    <th key={column} scope="col" className="px-2 py-2 font-medium text-right whitespace-nowrap">
                      {COMPLETION_TARGET_LABELS[column]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.level}
                    className="border-t border-solid border-black/6 dark:border-white/8 border-x-0 border-b-0"
                  >
                    <th scope="row" className="px-3 py-2 text-left whitespace-nowrap">
                      <a href={constantTablePath(row.level)}>Lv.{row.level}</a>
                    </th>
                    <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                      {row.played}
                      <span className="opacity-60">/{row.total}</span>
                    </td>
                    {PROGRESS_COLUMNS.map((column) => {
                      const count = row.counts[column]
                      const ratio = row.total ? count / row.total : 0
                      return (
                        <td key={column} className="px-1 py-1 text-right tabular-nums">
                          <a
                            href={targetHref(row.level, column)}
                            className="block px-1.5 py-1 rounded-md no-underline text-inherit hover:bg-violet-500/15"
                            style={{ backgroundColor: count ? `rgb(139 92 246 / ${0.06 + ratio * 0.4})` : undefined }}
                            aria-label={t('completion:progress.cell-label', {
                              level: row.level,
                              target: COMPLETION_TARGET_LABELS[column],
                              count,
                              total: row.total,
                            })}
                          >
                            {count}
                          </a>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </MaterialSurface>
        )}
      </div>
    </div>
  )
}