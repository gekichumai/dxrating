import { DifficultyEnum } from '@gekichumai/dxdata'
import { PLATE_KIND_LABELS, type PlateRecord, type PlateRegion } from '@gekichumai/maimai-domain'
import { type FC, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompleteCatalogDocument } from '@/catalog/CatalogContext'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { ShareImageButton } from '@/components/global/ShareImageButton'
import {
  buildPlatePageData,
  DEFAULT_PLATE_REGION,
  evaluatePlatePage,
  groupPlateChartsByLevel,
  PLATE_REGIONS,
  type PlateIndexGroup,
  type PlatePageData,
  platePath,
  plateScript,
  progressPercent,
} from '@/components/plates/plateData'
import { buildPlateShareImage } from '@/components/plates/plateShareImage'
import { buildSheetPath } from '@/components/sheet/sheetLinks'
import { getSheetTypeDisplayName } from '@/components/song/sheetDisplay'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { DIFFICULTIES } from '@/models/difficulties'
import { useUserRecords } from '@/models/useUserRecords'
import { DEFAULT_LOCALE, type SupportedLocale, toSupportedLocale } from '@/setup/locale'
import { coverImageUrl } from '@/utils/shareImage/shareImage'

const useLocale = (): SupportedLocale => {
  const { i18n } = useTranslation()
  return toSupportedLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE
}

const regionHref = (path: string, region: PlateRegion) =>
  region === DEFAULT_PLATE_REGION ? path : `${path}?region=${region}`

/** Records keyed by sheet ID, in the shape the plate rules read */
const usePlateRecords = () => {
  const { bySheetId, entries, isDemo } = useUserRecords()
  const records = useMemo(() => {
    const map = new Map<string, PlateRecord>()
    for (const [sheetId, record] of bySheetId) map.set(sheetId, record.entry)
    return map
  }, [bySheetId])
  return { records, hasRecords: entries.length > 0, isDemo }
}

const Breadcrumb: FC<{ leaf?: string }> = ({ leaf }) => {
  const { t } = useTranslation(['plates'])
  return (
    <nav className="text-xs text-slate-600 dark:text-slate-400" aria-label="Breadcrumb">
      <a href="/" className="text-inherit">
        DXRating
      </a>
      {' › '}
      {leaf ? (
        <>
          <a href="/plates" className="text-inherit">
            {t('plates:breadcrumb')}
          </a>
          {' › '}
          <span>{leaf}</span>
        </>
      ) : (
        <span>{t('plates:breadcrumb')}</span>
      )}
    </nav>
  )
}

const RegionSwitch: FC<{ path: string; region: PlateRegion }> = ({ path, region }) => {
  const { t } = useTranslation(['plates'])
  return (
    <nav aria-label={t('plates:region.label')} className="material-surface-thin inline-flex self-start p-1 gap-1">
      {PLATE_REGIONS.map((candidate) => (
        <a
          key={candidate}
          href={regionHref(path, candidate)}
          aria-current={candidate === region ? 'page' : undefined}
          className={`px-3 py-1 rounded-lg text-sm no-underline ${
            candidate === region
              ? 'bg-white/80 dark:bg-white/15 text-slate-950 dark:text-white font-bold shadow-sm'
              : 'text-slate-700 dark:text-slate-300 hover:bg-white/40 dark:hover:bg-white/8'
          }`}
        >
          {t(`plates:region.${candidate}`)}
        </a>
      ))}
    </nav>
  )
}

const ProgressBar: FC<{ percent: number; className?: string }> = ({ percent, className }) => (
  <div className={`h-2 rounded-full bg-black/8 dark:bg-white/10 overflow-hidden ${className ?? ''}`}>
    <div
      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width]"
      style={{ width: `${Math.min(100, percent)}%` }}
    />
  </div>
)

export const PlateIndexPage: FC<{ region: PlateRegion; groups: PlateIndexGroup[] }> = ({ region, groups }) => {
  const { t } = useTranslation(['plates'])
  const locale = useLocale()
  const script = plateScript(locale)
  const document = useCompleteCatalogDocument()
  const { records, hasRecords } = usePlateRecords()

  // The user overlay is client-only: SSR HTML depends on URL + locale alone
  const percents = useMemo(() => {
    if (!document || !hasRecords) return null
    const result = new Map<string, number>()
    for (const group of groups) {
      for (const plate of group.plates) {
        const data = buildPlatePageData(document, region, plate.id)
        if (!data) continue
        const progress = evaluatePlatePage(data, records)
        result.set(plate.id, progressPercent(progress.completedCharts, progress.totalCharts))
      }
    }
    return result
  }, [document, hasRecords, groups, region, records])

  return (
    <div className="flex-container w-full max-w-5xl px-4 pb-global">
      <div className="w-full flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <Breadcrumb />
          <h1 className="text-3xl font-bold text-slate-950 dark:text-white m-0">{t('plates:index.title')}</h1>
          <p className="text-sm text-slate-700 dark:text-slate-300 m-0">{t('plates:index.intro')}</p>
          <RegionSwitch path="/plates" region={region} />
        </header>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-none p-0 m-0">
          {groups.map((group) => (
            <li key={group.id}>
              <MaterialSurface className="p-3 flex flex-col gap-2 h-full">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-950 dark:text-white">{group[script]}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400 truncate">
                    {group.versions.length > 2
                      ? `${group.versions[0]} – ${group.versions.at(-1)}`
                      : group.versions.join(' / ')}
                  </span>
                  {group.unverified && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-md border border-solid border-amber-500/40 text-amber-700 dark:text-amber-300">
                      {t('plates:unverified')}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 xs:grid-cols-4 gap-2">
                  {group.plates.map((plate) => {
                    const percent = percents?.get(plate.id)
                    return (
                      <a
                        key={plate.id}
                        href={regionHref(platePath(plate.id), region)}
                        className="material-surface-thin rounded-lg! px-2 py-1.5 no-underline flex flex-col gap-1 hover:bg-white/60 dark:hover:bg-white/8 transition-colors"
                      >
                        <span className="text-sm font-bold text-slate-950 dark:text-white">{plate.names[script]}</span>
                        {percent !== undefined ? (
                          <>
                            <ProgressBar percent={percent} className="h-1!" />
                            <span className="text-[11px] tabular-nums text-slate-600 dark:text-slate-400">
                              {percent.toFixed(1)}%
                            </span>
                          </>
                        ) : (
                          <span className="text-[11px] text-slate-500">{PLATE_KIND_LABELS[plate.kind][script]}</span>
                        )}
                      </a>
                    )
                  })}
                </div>
              </MaterialSurface>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const DIFFICULTY_FILTERS = [
  DifficultyEnum.Basic,
  DifficultyEnum.Advanced,
  DifficultyEnum.Expert,
  DifficultyEnum.Master,
  DifficultyEnum.ReMaster,
] as const

const FilterChip: FC<{ active: boolean; onClick: () => void; children: React.ReactNode; color?: string }> = ({
  active,
  onClick,
  children,
  color,
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`px-3 py-1 rounded-lg text-xs cursor-pointer border border-solid transition-colors ${
      active
        ? 'border-transparent bg-slate-900/85 text-white dark:bg-white/85 dark:text-slate-950'
        : 'border-black/8 dark:border-white/10 bg-white/40 dark:bg-white/5 text-slate-800 dark:text-slate-200'
    }`}
    style={active && color ? { backgroundColor: color, color: '#fff' } : undefined}
  >
    {children}
  </button>
)

export const PlatePage: FC<{ data: PlatePageData }> = ({ data }) => {
  const { t } = useTranslation(['plates'])
  const locale = useLocale()
  const name = data.names[plateScript(locale)]
  const versions =
    data.versions.length > 2 ? `${data.versions[0]} – ${data.versions.at(-1)}` : data.versions.join(' / ')
  const values = { plate: name, charts: data.charts.length, sheets: data.totalSheets, versions }
  const { records, hasRecords, isDemo } = usePlateRecords()
  const progress = useMemo(() => evaluatePlatePage(data, records), [data, records])

  const [remainingOnly, setRemainingOnly] = useState(false)
  const [difficulty, setDifficulty] = useState<DifficultyEnum | null>(null)

  // Fire once per plate after mount, when the client overlay is known
  const viewedPlate = useRef<string | null>(null)
  useEffect(() => {
    if (viewedPlate.current === data.plateId) return
    viewedPlate.current = data.plateId
    captureAnalyticsEvent('plate_viewed', {
      plate_id: data.plateId,
      region: data.region,
      completed_charts: progress.completedCharts,
      total_charts: progress.totalCharts,
    })
  }, [data.plateId, data.region, progress])

  const visible = useMemo(() => {
    const byChart = new Map(progress.charts.map((status) => [status.chart, status]))
    return groupPlateChartsByLevel(data.charts)
      .map((group) => {
        const statuses = group.charts.map((chart) => byChart.get(chart)!)
        const charts = statuses.filter((status) => {
          const sheets = difficulty
            ? status.chart.sheets.filter((s) => s.difficulty === difficulty)
            : status.chart.sheets
          if (sheets.length === 0) return false
          return !remainingOnly || sheets.some((sheet) => !status.met.get(sheet.id))
        })
        return { level: group.level, charts, done: statuses.filter((s) => s.complete).length, total: statuses.length }
      })
      .filter((group) => group.charts.length > 0 || !remainingOnly)
  }, [data.charts, progress, difficulty, remainingOnly])

  const percent = progressPercent(progress.completedCharts, progress.totalCharts)
  const hasRemaster = data.charts.some((chart) => chart.sheets.some((s) => s.difficulty === DifficultyEnum.ReMaster))

  return (
    <div className="flex-container w-full max-w-5xl px-4 pb-global">
      <div className="w-full flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <Breadcrumb leaf={name} />
          <h1 className="text-3xl font-bold text-slate-950 dark:text-white m-0">{t('plates:title', values)}</h1>
          <p className="text-sm text-slate-700 dark:text-slate-300 m-0">{t('plates:intro', values)}</p>
          <RegionSwitch path={platePath(data.plateId)} region={data.region} />
        </header>

        <MaterialSurface as="section" aria-labelledby="plate-condition" className="p-4 flex flex-col gap-2">
          <h2 id="plate-condition" className="text-base font-bold text-slate-950 dark:text-white m-0">
            {t('plates:condition.title')}
          </h2>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 m-0">
            {t(`plates:condition.${data.kind}`)}
          </p>
          <p className="text-xs text-slate-700 dark:text-slate-300 m-0">{t('plates:condition.scope')}</p>
          {data.includesRemaster && (
            <p className="text-xs text-slate-700 dark:text-slate-300 m-0">{t('plates:condition.remaster')}</p>
          )}
          {data.region === 'cn' && data.versions.length === 2 && !data.includesRemaster && (
            <p className="text-xs text-slate-700 dark:text-slate-300 m-0">{t('plates:condition.cn-merged')}</p>
          )}
          {data.unverified && (
            <p className="text-xs text-amber-700 dark:text-amber-300 m-0">{t('plates:condition.unverified')}</p>
          )}
        </MaterialSurface>

        <MaterialSurface as="section" aria-labelledby="plate-progress" className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 id="plate-progress" className="text-base font-bold text-slate-950 dark:text-white m-0">
              {t('plates:progress.title')}
            </h2>
            {isDemo && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md border border-solid border-sky-500/40 text-sky-700 dark:text-sky-300">
                {t('plates:progress.demo')}
              </span>
            )}
            <ShareImageButton
              size="small"
              className="ml-auto!"
              disabled={!hasRecords}
              filename={`dxrating-plate-${data.plateId}.png`}
              shareTitle={t('plates:share.title', { plate: name })}
              getImage={() =>
                buildPlateShareImage({
                  plateName: name,
                  subtitle: versions,
                  progressLabel: t('plates:progress.charts', {
                    done: progress.completedCharts,
                    total: progress.totalCharts,
                  }),
                  remainingLabel: t('plates:filter.remaining'),
                  progress,
                })
              }
              onExported={(outcome) =>
                captureAnalyticsEvent('plate_share_exported', { plate_id: data.plateId, outcome })
              }
            />
          </div>
          {hasRecords ? (
            <>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold tabular-nums text-slate-950 dark:text-white">
                  {percent.toFixed(1)}%
                </span>
                <span className="text-sm text-slate-700 dark:text-slate-300 tabular-nums">
                  {t('plates:progress.charts', { done: progress.completedCharts, total: progress.totalCharts })}
                  {' · '}
                  {t('plates:progress.sheets', { done: progress.completedSheets, total: progress.totalSheets })}
                </span>
              </div>
              <ProgressBar percent={percent} />
            </>
          ) : (
            <p className="text-sm text-slate-700 dark:text-slate-300 m-0">
              {t('plates:progress.empty')}{' '}
              <a href="/rating" className="font-medium">
                {t('plates:progress.import')}
              </a>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip active={remainingOnly} onClick={() => setRemainingOnly((value) => !value)}>
              {t('plates:filter.remaining')}
            </FilterChip>
            <span className="w-px h-4 bg-black/10 dark:bg-white/15 mx-1" aria-hidden />
            <FilterChip active={difficulty === null} onClick={() => setDifficulty(null)}>
              {t('plates:filter.all')}
            </FilterChip>
            {DIFFICULTY_FILTERS.filter((d) => d !== DifficultyEnum.ReMaster || hasRemaster).map((d) => (
              <FilterChip
                key={d}
                active={difficulty === d}
                color={DIFFICULTIES[d].color}
                onClick={() => setDifficulty(difficulty === d ? null : d)}
              >
                {DIFFICULTIES[d].title}
              </FilterChip>
            ))}
          </div>
        </MaterialSurface>

        {visible.map((group) => (
          <MaterialSurface
            as="section"
            key={group.level}
            aria-labelledby={`plate-level-${group.level}`}
            className="overflow-hidden"
          >
            <h2
              id={`plate-level-${group.level}`}
              className="flex items-baseline justify-between gap-2 px-4 py-2 m-0 text-lg font-bold text-slate-950 dark:text-white border-b border-b-solid border-black/6 dark:border-white/8"
            >
              <span>Lv.{group.level}</span>
              {hasRecords && (
                <span className="text-xs font-normal tabular-nums text-slate-600 dark:text-slate-400">
                  {t('plates:group-count', { done: group.done, total: group.total })}
                </span>
              )}
            </h2>
            {group.charts.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 m-0">{t('plates:all-done')}</p>
            ) : (
              <ul className="list-none m-0 p-0 divide-y divide-black/5 dark:divide-white/6">
                {group.charts.map((status) => {
                  const { chart } = status
                  const sheets = difficulty ? chart.sheets.filter((s) => s.difficulty === difficulty) : chart.sheets
                  const doneHere = hasRecords && sheets.every((sheet) => status.met.get(sheet.id))
                  return (
                    <li key={`${chart.songId}-${chart.type}`} className="flex items-center gap-3 px-4 py-2">
                      <img
                        src={coverImageUrl(chart.imageName)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        width={40}
                        height={40}
                        className={`size-10 rounded-lg shrink-0 object-cover ${doneHere ? 'opacity-50' : ''}`}
                      />
                      <div className="min-w-0 flex-1">
                        <a
                          href={buildSheetPath({
                            songId: chart.songId,
                            type: chart.type,
                            difficulty: sheets.at(-1)?.difficulty ?? DifficultyEnum.Master,
                          })}
                          className="block truncate text-sm font-medium text-slate-950 dark:text-white no-underline hover:underline"
                        >
                          {chart.title}
                        </a>
                        <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                          {getSheetTypeDisplayName(chart.type, locale)} · {chart.version}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {sheets.map((sheet) => {
                          const met = status.met.get(sheet.id)
                          const color = DIFFICULTIES[sheet.difficulty]?.color
                          return (
                            <span
                              key={sheet.id}
                              title={`${DIFFICULTIES[sheet.difficulty]?.title} ${sheet.level}${met ? ` · ${t('plates:done')}` : ''}`}
                              className="min-w-7 px-1 h-6 rounded-md text-[11px] font-bold tabular-nums inline-flex items-center justify-center border border-solid"
                              style={
                                met
                                  ? { backgroundColor: color, borderColor: color, color: '#fff' }
                                  : { borderColor: color, color }
                              }
                            >
                              {sheet.level}
                            </span>
                          )
                        })}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </MaterialSurface>
        ))}

        <footer className="flex flex-col gap-2">
          <a href={regionHref('/plates', data.region)} className="text-sm font-medium">
            {t('plates:other-plates')} →
          </a>
        </footer>
      </div>
    </div>
  )
}