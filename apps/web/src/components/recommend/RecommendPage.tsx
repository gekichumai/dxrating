import {
  calculateBest50,
  recommendRatingRaises,
  type RatingEntry,
  type RatingRecommendation,
  type RecommendRecord,
} from '@gekichumai/maimai-domain'
import type { DifficultyEnum } from '@gekichumai/dxdata'
import { CircularProgress } from '@mui/material'
import { Link } from '@tanstack/react-router'
import { type FC, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompleteSongCatalog } from '@/catalog/CatalogContext'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { buildSheetPath } from '@/components/sheet/sheetLinks'
import { getSheetTypeDisplayName } from '@/components/song/sheetDisplay'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { useAppContext, useAppContextDXDataVersion } from '@/models/context/useAppContext'
import { DIFFICULTIES } from '@/models/difficulties'
import { useUserRecords } from '@/models/useUserRecords'
import { DEFAULT_LOCALE, toSupportedLocale } from '@/setup/locale'

const PER_BUCKET = 20

export const RecommendPage: FC = () => {
  const { t } = useTranslation(['recommend'])
  const { region } = useAppContext()
  const version = useAppContextDXDataVersion()
  const catalog = useCompleteSongCatalog()
  const { records, isDemo } = useUserRecords()

  const result = useMemo(() => {
    if (!catalog) return null
    const entries: RatingEntry[] = []
    const recordMap = new Map<string, RecommendRecord>()
    for (const { entry } of records) {
      const identity = entry.identity ?? catalog.getById(entry.sheetId)?.identity
      if (!identity) continue
      entries.push({
        sheetId: entry.sheetId,
        identity,
        achievementRate: entry.achievementRate,
        comboFlag: entry.comboFlag,
        syncFlag: entry.syncFlag,
      })
      recordMap.set(entry.sheetId, { achievementRate: entry.achievementRate, comboFlag: entry.comboFlag })
    }
    const best50 = calculateBest50({ catalog, version, region, entries })
    const suggestions = recommendRatingRaises({
      sheets: catalog.sheets,
      best50,
      records: recordMap,
      version,
      region,
      limit: Number.POSITIVE_INFINITY,
    })
    const floorOf = (list: typeof best50.b15) =>
      list.length === 0 ? 0 : Math.min(...list.map((item) => item.rating.ratingAwardValue))
    return {
      b15: suggestions.filter((item) => item.bucket === 'b15').slice(0, PER_BUCKET),
      b35: suggestions.filter((item) => item.bucket === 'b35').slice(0, PER_BUCKET),
      b15Floor: floorOf(best50.b15),
      b35Floor: floorOf(best50.b35),
      total: best50.statistics.b50Sum,
      hasRecords: entries.length > 0,
    }
  }, [catalog, records, version, region])

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
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-4 px-4 pb-global">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{t('recommend:title')}</h1>
        <p className="text-sm opacity-70">{t('recommend:description')}</p>
        {isDemo && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t('recommend:demo')}</p>}
      </header>

      {!result ? (
        <div className="flex justify-center py-12" aria-busy="true">
          <CircularProgress size="2rem" />
        </div>
      ) : !result.hasRecords ? (
        <MaterialSurface className="flex flex-col gap-2 p-4 text-sm">
          <p className="m-0">{t('recommend:empty')}</p>
          <Link to="/rating" className="text-blue-600 dark:text-blue-400">
            {t('recommend:go-to-rating')}
          </Link>
        </MaterialSurface>
      ) : (
        <>
          <MaterialSurface className="grid grid-cols-3 gap-2 p-4 text-center">
            <Stat label={t('recommend:stats.total')} value={result.total} />
            <Stat label={t('recommend:stats.b15-floor')} value={result.b15Floor} />
            <Stat label={t('recommend:stats.b35-floor')} value={result.b35Floor} />
          </MaterialSurface>
          <RecommendSection title={t('recommend:new')} items={result.b15} />
          <RecommendSection title={t('recommend:old')} items={result.b35} />
        </>
      )}
    </div>
  )
}

const Stat: FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex flex-col">
    <span className="text-xs opacity-70">{label}</span>
    <span className="text-xl font-bold tabular-nums">{value}</span>
  </div>
)

const RecommendSection: FC<{ title: string; items: RatingRecommendation[] }> = ({ title, items }) => {
  const { t, i18n } = useTranslation(['recommend'])
  const locale = toSupportedLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-lg font-bold">{title}</h2>
      <MaterialSurface className="overflow-hidden">
        {items.length === 0 ? (
          <p className="m-0 p-4 text-sm">{t('recommend:none')}</p>
        ) : (
          <ol className="m-0 list-none p-0 divide-y divide-zinc-500/15">
            {items.map((item) => {
              const difficulty = DIFFICULTIES[item.sheet.difficulty as DifficultyEnum]
              return (
                <li key={item.sheet.id}>
                  <Link
                    to={buildSheetPath(item.sheet)}
                    className="flex items-center gap-3 px-4 py-3 text-inherit no-underline hover:bg-zinc-500/10"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold">{item.sheet.title}</span>
                      <span className="flex flex-wrap gap-2 text-xs">
                        <span>{getSheetTypeDisplayName(item.sheet.type, locale)}</span>
                        <span className="font-semibold" style={{ color: difficulty?.color }}>
                          {difficulty?.title ?? item.sheet.difficulty}
                        </span>
                        <span className="tabular-nums">{item.sheet.internalLevelValue.toFixed(1)}</span>
                      </span>
                    </span>
                    <span className="flex flex-col items-end text-sm tabular-nums">
                      <span>
                        {item.currentAchievement === null
                          ? t('recommend:unplayed')
                          : `${item.currentAchievement.toFixed(4)}%`}
                        {' → '}
                        <strong>{item.targetAchievement}%</strong>
                      </span>
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        {t('recommend:gain', { gain: item.gain })}
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