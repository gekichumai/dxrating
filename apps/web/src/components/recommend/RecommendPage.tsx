import {
  calculateBest50,
  recommendRatingRaises,
  type RatingEntry,
  type RatingRecommendation,
  type RecommendRecord,
  type SongCatalog,
} from '@gekichumai/maimai-domain'
import type { DifficultyEnum, VersionEnum } from '@gekichumai/dxdata'
import { CircularProgress } from '@mui/material'
import { Link } from '@tanstack/react-router'
import { type FC, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompleteSongCatalog } from '@/catalog/CatalogContext'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import {
  DemoScoresNotice,
  ImportScoresLink,
  NoScoresState,
  ScorePageFrame,
  ScorePageHeader,
  difficultyTextStyle,
} from '@/components/scores/ScorePage'
import { buildSheetPath } from '@/components/sheet/sheetLinks'
import { getSheetTypeDisplayName } from '@/components/song/sheetDisplay'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { useAppContext, useAppContextDXDataVersion } from '@/models/context/useAppContext'
import { DIFFICULTIES } from '@/models/difficulties'
import type { Region } from '@/models/context/AppContext'
import { type UserRecords, useUserRecords } from '@/models/useUserRecords'
import { DEFAULT_LOCALE, toSupportedLocale } from '@/setup/locale'
import { difficultyInkClassName } from '@/utils/difficultyInk'

const PER_BUCKET = 20

/**
 * B50 from every stored entry (rating-aware deduplication and import bucket hints are left to the domain, as in
 * the calculator); per-chart records only drive the recommendation lookup.
 */
export function computeRecommendations({
  catalog,
  ratingEntries,
  records,
  version,
  region,
}: {
  catalog: SongCatalog
  ratingEntries: RatingEntry[]
  records: UserRecords['records']
  version: VersionEnum
  region: Region
}) {
  const recordMap = new Map<string, RecommendRecord>(
    records.map(({ entry, source }) => [
      entry.sheetId,
      { achievementRate: entry.achievementRate, comboFlag: entry.comboFlag, source },
    ]),
  )
  const best50 = calculateBest50({ catalog, version, region, entries: ratingEntries })
  const suggestions = recommendRatingRaises({
    sheets: catalog.sheets,
    best50,
    records: recordMap,
    version,
    region,
    limit: Number.POSITIVE_INFINITY,
  })
  // Same rule as recommendRatingRaises: a bucket that is not full yet has a floor of 0
  const floorOf = (list: typeof best50.b15, size: number) =>
    list.length < size ? 0 : Math.min(...list.map((item) => item.rating.ratingAwardValue))
  return {
    b15: suggestions.filter((item) => item.bucket === 'b15').slice(0, PER_BUCKET),
    b35: suggestions.filter((item) => item.bucket === 'b35').slice(0, PER_BUCKET),
    b15Floor: floorOf(best50.b15, 15),
    b35Floor: floorOf(best50.b35, 35),
    total: best50.statistics.b50Sum,
    hasRecords: ratingEntries.length > 0,
  }
}

export const RecommendPage: FC = () => {
  const { t } = useTranslation(['recommend'])
  const { region } = useAppContext()
  const version = useAppContextDXDataVersion()
  const catalog = useCompleteSongCatalog()
  const { records, ratingEntries, isDemo } = useUserRecords()

  const result = useMemo(
    () => (catalog ? computeRecommendations({ catalog, ratingEntries, records, version, region }) : null),
    [catalog, ratingEntries, records, version, region],
  )

  const reported = useRef(false)
  useEffect(() => {
    if (!result || reported.current) return
    reported.current = true
    captureAnalyticsEvent('recommend_viewed', {
      suggestion_count: result.b15.length + result.b35.length,
      b50_floor: result.b35Floor,
    })
  }, [result])

  return (
    <ScorePageFrame width="6xl">
      <ScorePageHeader title={t('recommend:title')} description={t('recommend:description')}>
        {isDemo && <DemoScoresNotice className="mt-3">{t('recommend:demo')}</DemoScoresNotice>}
      </ScorePageHeader>

      {!result ? (
        <div className="flex justify-center py-12" aria-busy="true">
          <CircularProgress size="2rem" aria-label={t('recommend:loading')} />
        </div>
      ) : !result.hasRecords ? (
        <NoScoresState
          title={t('recommend:empty-title')}
          description={t('recommend:empty')}
          action={<ImportScoresLink>{t('recommend:go-to-rating')}</ImportScoresLink>}
        />
      ) : (
        <>
          <MaterialSurface
            as="dl"
            className="m-0 grid grid-cols-3 items-end gap-2 p-4 text-center lg:items-baseline lg:gap-4 lg:p-3 lg:text-start"
          >
            <Stat label={t('recommend:stats.total')} value={result.total} />
            <Stat label={t('recommend:stats.b15-floor')} value={result.b15Floor} />
            <Stat label={t('recommend:stats.b35-floor')} value={result.b35Floor} />
          </MaterialSurface>
          {/* B15 and B35 side by side on desktop, so both lists start above the fold */}
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
            <RecommendSection title={t('recommend:new')} items={result.b15} />
            <RecommendSection title={t('recommend:old')} items={result.b35} />
          </div>
        </>
      )}
    </ScorePageFrame>
  )
}

// Label above value; the grid aligns cell bottoms, so a label that wraps grows upwards and values stay level. On
// desktop the strip is compact: label and value on one baseline, left-aligned
const Stat: FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex flex-col gap-0.5 lg:flex-row lg:items-baseline lg:gap-2">
    <dt className="text-xs leading-tight text-fg-2 text-balance">{label}</dt>
    <dd className="m-0 text-xl font-semibold display-num text-fg-1 lg:text-lg">{value}</dd>
  </div>
)

const RecommendSection: FC<{
  title: string
  items: RatingRecommendation[]
}> = ({ title, items }) => {
  const { t, i18n } = useTranslation(['recommend'])
  const locale = toSupportedLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE
  return (
    <section className="flex flex-col gap-2">
      <h2 className="section-title m-0 text-lg">{title}</h2>
      <MaterialSurface>
        {items.length === 0 ? (
          <p className="m-0 p-4 text-sm text-fg-2">{t('recommend:none')}</p>
        ) : (
          <ol className="m-0 list-none p-1 flex flex-col">
            {items.map((item) => {
              const difficulty = DIFFICULTIES[item.sheet.difficulty as DifficultyEnum]
              return (
                <li key={item.sheet.id}>
                  <Link
                    to={buildSheetPath(item.sheet)}
                    className="flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 text-fg-1 no-underline outline-offset-[-2px] transition-colors duration-[var(--duration-fast)] hover:bg-black/4"
                  >
                    <img
                      src={`https://shama.dxrating.net/images/cover/v2/${item.sheet.imageName}.jpg`}
                      alt=""
                      loading="lazy"
                      width={44}
                      height={44}
                      className="size-11 shrink-0 self-start rounded-[var(--radius-md)] outline outline-1 outline-black/10 -outline-offset-1 sm:self-center"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span lang="ja" className="line-clamp-2 break-words font-semibold text-sm">
                          {item.sheet.title}
                        </span>
                        <span className="flex flex-wrap gap-x-2 text-xs text-fg-2">
                          <span
                            className={`whitespace-nowrap font-semibold ${difficultyInkClassName}`}
                            style={difficultyTextStyle(item.sheet.difficulty)}
                          >
                            {difficulty?.title ?? item.sheet.difficulty}
                          </span>
                          <span className="whitespace-nowrap">{getSheetTypeDisplayName(item.sheet.type, locale)}</span>
                          <span className="whitespace-nowrap num">{item.sheet.internalLevelValue.toFixed(1)}</span>
                        </span>
                      </span>
                      <span className="flex flex-row flex-wrap items-baseline gap-x-2 text-sm num sm:flex-col sm:items-end">
                        <span className="whitespace-nowrap">
                          {item.currentAchievement === null
                            ? t('recommend:unplayed')
                            : `${item.currentAchievement.toFixed(4)}%`}
                          {' → '}
                          <strong className="font-semibold">{item.targetAchievement}%</strong>
                        </span>
                        <span className="whitespace-nowrap text-xs font-semibold text-status-positive">
                          {t('recommend:gain', { gain: item.gain })}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </MaterialSurface>
    </section>
  )
}