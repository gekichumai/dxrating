import { DifficultyEnum } from '@gekichumai/dxdata'
import type { PlateRecord, PlateRegion } from '@gekichumai/maimai-domain'
import { type FC, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompleteCatalogDocument } from '@/catalog/CatalogContext'
import {
  Breadcrumb,
  difficultyTextClassName,
  difficultyTextStyle,
  FilterChip,
  SegmentedNav,
} from '@/components/completion/TableChrome'
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

const COMBO_RANK: Record<NonNullable<PlateRecord['comboFlag']>, number> = { fc: 1, fcp: 2, ap: 3, app: 4 }
const SYNC_RANK: Record<NonNullable<PlateRecord['syncFlag']>, number> = { sync: 1, fs: 2, fsp: 3, fsd: 4, fsdp: 5 }
const rankOf = <K extends string>(ranks: Record<K, number>, flag: K | null | undefined) => (flag ? ranks[flag] : 0)

/**
 * Records keyed by sheet ID, in the shape the plate rules read. Duplicate entries of a sheet are merged field by
 * field (best achievement, best combo, best sync): an AP with a lower score still counts for 神.
 * Empty until mounted, so the first client render matches the user-agnostic server (and edge-cached) HTML.
 */
const usePlateRecords = () => {
  const { entries, isDemo } = useUserRecords()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const records = useMemo(() => {
    const map = new Map<string, PlateRecord>()
    if (!mounted) return map
    for (const entry of entries) {
      const existing = map.get(entry.sheetId)
      map.set(entry.sheetId, {
        achievementRate: Math.max(existing?.achievementRate ?? 0, entry.achievementRate),
        comboFlag:
          rankOf(COMBO_RANK, entry.comboFlag) > rankOf(COMBO_RANK, existing?.comboFlag)
            ? entry.comboFlag
            : (existing?.comboFlag ?? null),
        syncFlag:
          rankOf(SYNC_RANK, entry.syncFlag) > rankOf(SYNC_RANK, existing?.syncFlag)
            ? entry.syncFlag
            : (existing?.syncFlag ?? null),
      })
    }
    return map
  }, [entries, mounted])
  return { records, ready: mounted, hasRecords: mounted && entries.length > 0, isDemo: mounted && isDemo }
}

const PlateBreadcrumb: FC<{ leaf?: string; region: PlateRegion }> = ({ leaf, region }) => {
  const { t } = useTranslation(['plates'])
  return (
    <Breadcrumb
      items={
        leaf
          ? [{ href: regionHref('/plates', region), label: t('plates:breadcrumb') }, { label: leaf }]
          : [{ label: t('plates:breadcrumb') }]
      }
    />
  )
}

const RegionSwitch: FC<{ path: string; region: PlateRegion }> = ({ path, region }) => {
  const { t } = useTranslation(['plates'])
  return (
    <SegmentedNav
      label={t('plates:region.label')}
      items={PLATE_REGIONS.map((candidate) => ({
        key: candidate,
        href: regionHref(path, candidate),
        label: t(`plates:region.${candidate}`),
        current: candidate === region,
      }))}
    />
  )
}

/** Percent with one decimal, rounded down so an unfinished plate never reads 100.0% */
const usePercentFormat = () => {
  const locale = useLocale()
  return useMemo(() => {
    const format = new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
    return (percent: number) => format.format(Math.floor(percent * 10) / 1000)
  }, [locale])
}

const ProgressBar: FC<{ percent: number; className?: string }> = ({ percent, className }) => (
  <div className={`h-2 rounded-full bg-black/8 overflow-hidden ${className ?? ''}`}>
    <div
      className="h-full rounded-full bg-accent transition-[width] duration-300 ease-[var(--ease-out)] motion-reduce:transition-none"
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
  const formatPercent = usePercentFormat()

  // The user overlay is client-only: SSR HTML depends on URL + locale alone
  const percents = useMemo(() => {
    if (!document || !hasRecords) return null
    const result = new Map<string, number>()
    for (const group of groups) {
      for (const plate of group.plates) {
        const data = buildPlatePageData(document, region, plate.id)
        if (!data) continue
        const progress = evaluatePlatePage(data, records)
        result.set(plate.id, progressPercent(progress.completedSheets, progress.totalSheets))
      }
    }
    return result
  }, [document, hasRecords, groups, region, records])

  return (
    <div className="flex-container w-full max-w-5xl px-4 pb-global">
      <div className="w-full flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <PlateBreadcrumb region={region} />
          <h1 className="page-title m-0 [word-break:auto-phrase]">{t('plates:index.title')}</h1>
          <p className="page-description m-0">{t('plates:index.intro')}</p>
          <RegionSwitch path="/plates" region={region} />
        </header>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-none p-0 m-0">
          {groups.map((group) => (
            <li key={group.id}>
              <MaterialSurface className="p-3 flex flex-col gap-2 h-full">
                <div className="flex items-baseline gap-2">
                  <h2 className="m-0 text-2xl font-semibold text-fg-1">{group[script]}</h2>
                  <span className="text-xs text-fg-2 truncate">
                    {group.versions.length > 2
                      ? `${group.versions[0]} – ${group.versions.at(-1)}`
                      : group.versions.join(' / ')}
                  </span>
                  {group.unverified && (
                    <span className="ms-auto shrink-0 text-xs px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-solid border-amber-600/40 text-amber-800">
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
                        className="glass-inset px-2 py-1.5 no-underline flex flex-col gap-1 transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-surface/80"
                      >
                        <span className="text-sm font-semibold text-fg-1">{plate.names[script]}</span>
                        {percent !== undefined ? (
                          <>
                            <ProgressBar percent={percent} className="h-1!" />
                            <span className="text-xs num text-fg-2">{formatPercent(percent)}</span>
                          </>
                        ) : (
                          <span className="text-xs text-fg-2">{t(`plates:condition-short.${plate.kind}`)}</span>
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

/** Marks a chart set whose Re:MASTER differs between servers: it still counts toward the plate (meta#18) */
const RemasterVariantLabel: FC = () => {
  const { t } = useTranslation(['plates'])
  return (
    <span
      title={t('plates:remaster-variant.description')}
      className="min-w-0 max-w-full px-1.5 py-0.5 rounded-[var(--radius-sm)] text-xs font-medium [overflow-wrap:anywhere] text-accent-strong bg-accent-subtle border border-solid border-[color-mix(in_oklab,var(--accent-strong)_35%,transparent)]"
    >
      {t('plates:remaster-variant.label')}
      <span className="sr-only">: {t('plates:remaster-variant.description')}</span>
    </span>
  )
}

export const PlatePage: FC<{ data: PlatePageData }> = ({ data }) => {
  const { t } = useTranslation(['plates'])
  const locale = useLocale()
  const name = data.names[plateScript(locale)]
  const versions =
    data.versions.length > 2 ? `${data.versions[0]} – ${data.versions.at(-1)}` : data.versions.join(' / ')
  const values = { plate: name, charts: data.charts.length, sheets: data.totalSheets, versions }
  const { records, ready, hasRecords, isDemo } = usePlateRecords()
  const formatPercent = usePercentFormat()
  const progress = useMemo(() => evaluatePlatePage(data, records), [data, records])

  const [remainingOnly, setRemainingOnly] = useState(false)
  const [difficulty, setDifficulty] = useState<DifficultyEnum | null>(null)

  // Fire once per plate after mount, when the client overlay is known
  const viewedPlate = useRef<string | null>(null)
  useEffect(() => {
    if (!ready || viewedPlate.current === data.plateId) return
    viewedPlate.current = data.plateId
    captureAnalyticsEvent('plate_viewed', {
      plate_id: data.plateId,
      region: data.region,
      completed_charts: progress.completedCharts,
      total_charts: progress.totalCharts,
    })
  }, [ready, data.plateId, data.region, progress])

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

  // By chart (sheet), not by finished song: 37 of 264 charts is progress even when no song is fully done
  const percent = progressPercent(progress.completedSheets, progress.totalSheets)
  const hasRemaster = data.charts.some((chart) => chart.sheets.some((s) => s.difficulty === DifficultyEnum.ReMaster))

  return (
    <div className="flex-container w-full max-w-5xl px-4 pb-global">
      <div className="w-full flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <PlateBreadcrumb leaf={name} region={data.region} />
          <h1 className="page-title m-0 [word-break:auto-phrase]">{t('plates:title', values)}</h1>
          <p className="page-description m-0">{t('plates:intro', values)}</p>
          <RegionSwitch path={platePath(data.plateId)} region={data.region} />
        </header>

        <MaterialSurface as="section" aria-labelledby="plate-condition" className="p-4 flex flex-col gap-2">
          <h2 id="plate-condition" className="section-title m-0">
            {t('plates:condition.title')}
          </h2>
          <p className="text-sm font-semibold text-fg-1 m-0">{t(`plates:condition.${data.kind}`)}</p>
          <p className="text-xs text-fg-2 m-0">{t('plates:condition.scope')}</p>
          {data.includesRemaster && <p className="text-xs text-fg-2 m-0">{t('plates:condition.remaster')}</p>}
          {data.charts.some((chart) => chart.remasterDiffersByServer) && (
            <p className="text-xs text-fg-2 m-0">{t('plates:condition.remaster-variant')}</p>
          )}
          {data.region === 'cn' && data.versions.length === 2 && !data.includesRemaster && (
            <p className="text-xs text-fg-2 m-0">{t('plates:condition.cn-merged')}</p>
          )}
          {data.unverified && <p className="text-xs text-amber-800 m-0">{t('plates:condition.unverified')}</p>}
        </MaterialSurface>

        <MaterialSurface as="section" aria-labelledby="plate-progress" className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 id="plate-progress" className="section-title m-0">
              {t('plates:progress.title')}
            </h2>
            {isDemo && (
              <span className="text-xs px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-solid border-sky-600/40 text-sky-800">
                {t('plates:progress.demo')}
              </span>
            )}
            {hasRecords && (
              <ShareImageButton
                size="small"
                className="ms-auto!"
                filename={`dxrating-plate-${data.plateId}.png`}
                shareTitle={t('plates:share.title', { plate: name })}
                imageAlt={t('plates:share.alt', { plate: name })}
                getImage={() =>
                  buildPlateShareImage({
                    plateName: name,
                    kind: data.kind,
                    progress,
                    records,
                    labels: {
                      subtitle: t('plates:share.subtitle', {
                        versions,
                        condition: t(`plates:condition-short.${data.kind}`),
                      }),
                      // The count the headline percentage is computed from (charts, not finished songs)
                      progress: t('plates:progress.sheets', {
                        done: progress.completedSheets,
                        total: progress.totalSheets,
                      }),
                      percent: formatPercent(percent),
                      remaining: t('plates:share.remaining-count', {
                        count: progress.totalSheets - progress.completedSheets,
                      }),
                      order: t('plates:share.order'),
                      unplayed: t('plates:share.unplayed'),
                      more: (count) => t('plates:share.more', { count }),
                      allDone: t('plates:share.all-done'),
                    },
                  })
                }
                onExported={(outcome) =>
                  captureAnalyticsEvent('plate_share_exported', { plate_id: data.plateId, outcome })
                }
              />
            )}
          </div>
          {hasRecords ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-3xl font-semibold num tracking-[-0.01em] text-fg-1">
                  {formatPercent(percent)}
                </span>
                <span className="text-sm text-fg-2 num">
                  <span className="whitespace-nowrap">
                    {t('plates:progress.sheets', { done: progress.completedSheets, total: progress.totalSheets })}
                  </span>
                  {' · '}
                  <span className="whitespace-nowrap">
                    {t('plates:progress.charts', { done: progress.completedCharts, total: progress.totalCharts })}
                  </span>
                </span>
              </div>
              <ProgressBar percent={percent} />
            </>
          ) : (
            <p className="text-sm text-fg-2 m-0">
              {t('plates:progress.empty')}{' '}
              <a href="/rating" className="link">
                {t('plates:progress.import')}
              </a>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip active={remainingOnly} onClick={() => setRemainingOnly((value) => !value)}>
              {t('plates:filter.remaining')}
            </FilterChip>
            <span className="w-px h-4 bg-black/12 mx-1" aria-hidden />
            <FilterChip active={difficulty === null} onClick={() => setDifficulty(null)}>
              {t('plates:filter.all')}
            </FilterChip>
            {DIFFICULTY_FILTERS.filter((d) => d !== DifficultyEnum.ReMaster || hasRemaster).map((d) => (
              <FilterChip
                key={d}
                active={difficulty === d}
                solid={DIFFICULTIES[d].solid}
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
            <div className="flex items-baseline justify-between gap-2 px-4 py-2 border-b border-b-solid border-[var(--glass-border)]">
              <h2 id={`plate-level-${group.level}`} className="m-0 text-lg font-semibold text-fg-1">
                Lv.{group.level}
              </h2>
              {hasRecords && (
                <span className="text-xs num text-fg-2">
                  <span aria-hidden>{t('plates:group-count', { done: group.done, total: group.total })}</span>
                  <span className="sr-only">
                    {t('plates:group-count-sr', { done: group.done, total: group.total })}
                  </span>
                </span>
              )}
            </div>
            {group.charts.length === 0 ? (
              <p className="px-4 py-3 text-sm text-fg-2 m-0">{t('plates:all-done')}</p>
            ) : (
              <ul className="list-none m-0 p-0 divide-y divide-black/5">
                {group.charts.map((status) => {
                  const { chart } = status
                  const sheets = difficulty ? chart.sheets.filter((s) => s.difficulty === difficulty) : chart.sheets
                  const doneHere = hasRecords && sheets.every((sheet) => status.met.get(sheet.id))
                  return (
                    <li
                      key={`${chart.songId}-${chart.type}`}
                      className="flex flex-wrap xs:flex-nowrap items-center gap-x-3 gap-y-1.5 px-4 py-2"
                    >
                      <img
                        src={coverImageUrl(chart.imageName)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        width={40}
                        height={40}
                        className={`size-10 rounded-[var(--radius-md)] shrink-0 object-cover outline outline-1 -outline-offset-1 outline-black/10 ${doneHere ? 'opacity-50' : ''}`}
                      />
                      <div className="min-w-0 flex-1">
                        <a
                          href={buildSheetPath({
                            songId: chart.songId,
                            type: chart.type,
                            difficulty: sheets.at(-1)?.difficulty ?? DifficultyEnum.Master,
                          })}
                          lang="ja"
                          className="line-clamp-2 [overflow-wrap:anywhere] text-sm font-semibold text-fg-1 no-underline hover:underline underline-offset-2"
                        >
                          {chart.title}
                        </a>
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0 text-xs text-fg-2">
                          <span className="truncate shrink-0 max-w-full" title={chart.version}>
                            {getSheetTypeDisplayName(chart.type, locale)} · {chart.version}
                          </span>
                          {chart.remasterDiffersByServer && <RemasterVariantLabel />}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 shrink-0 basis-full xs:basis-auto ps-[52px] xs:ps-0">
                        {sheets.map((sheet) => {
                          const met = status.met.get(sheet.id)
                          const style = DIFFICULTIES[sheet.difficulty]
                          const title = style?.title ?? sheet.difficulty
                          return (
                            <span
                              key={sheet.id}
                              title={`${title} ${sheet.level}${met ? ` · ${t('plates:done')}` : ''}`}
                              className={`min-w-8 px-1 h-6 rounded-[var(--radius-sm)] text-xs font-semibold num inline-flex items-center justify-center border ${
                                sheet.difficulty === DifficultyEnum.ReMaster ? 'border-dashed' : 'border-solid'
                              } ${met ? '' : difficultyTextClassName}`}
                              style={
                                met
                                  ? { backgroundColor: style?.solid, borderColor: style?.solid, color: '#fff' }
                                  : { ...difficultyTextStyle(sheet.difficulty), borderColor: style?.color }
                              }
                            >
                              <span className="sr-only">{title} </span>
                              {sheet.level}
                              {met && <span className="sr-only"> {t('plates:done')}</span>}
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
          <a href={regionHref('/plates', data.region)} className="link self-start text-sm">
            {t('plates:other-plates')}
            <span aria-hidden> →</span>
          </a>
        </footer>
      </div>
    </div>
  )
}