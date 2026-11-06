import { VERSION_SORT_ORDER, type DifficultyEnum, type TypeEnum, type VersionEnum } from '@gekichumai/dxdata'
import { calculateBest50, type VersionedSheet } from '@gekichumai/maimai-domain'
import { Button, Chip, CircularProgress, Collapse, MenuItem, TextField } from '@mui/material'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import { type FC, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import IconMdiChevronDown from '~icons/mdi/chevron-down'
import { useSongCatalog, useCompleteSongCatalog } from '@/catalog/CatalogContext'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { difficultyTextStyle, ScorePageFrame, ScorePageHeader } from '@/components/scores/ScorePage'
import { buildSheetPath } from '@/components/sheet/sheetLinks'
import { getSheetTypeDisplayName } from '@/components/song/sheetDisplay'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { useAppContext, useAppContextDXDataVersion } from '@/models/context/useAppContext'
import { DIFFICULTIES } from '@/models/difficulties'
import { useUserRecords } from '@/models/useUserRecords'
import { DEFAULT_LOCALE, toSupportedLocale } from '@/setup/locale'
import { difficultyInkClassName } from '@/utils/difficultyInk'
import { LevelRangePicker } from './LevelRangePicker'
import { type LevelRange, RANGE_FLOOR } from './levelRange'
import { computePushRange } from './pushRange'
import {
  countActiveFilters,
  DEFAULT_RANDOM_FILTERS,
  filterRandomPool,
  pickRandom,
  RANDOM_DIFFICULTIES,
  RANDOM_TYPES,
  type RandomChartFilters,
} from './randomChart'
import { readStoredRange, writeStoredRange } from './rangeStorage'

/**
 * The value once it has stopped changing for `delay` ms, so a slider drag is announced once, not on every step. The
 * first value after `null` (still loading) is taken at once, so the count never shows a stale 0 after loading.
 */
function useSettled<T>(value: T | null, delay: number): T | null {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    if (settled === null || value === null) {
      setSettled(value)
      return
    }
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay, settled])
  return settled
}

const toggle = <T,>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value]

/** Where an SSS+ raises the rating, from the same scores the rating page reads; null until they load or with none */
function usePushRange(): LevelRange | null {
  const { ratingEntries } = useUserRecords()
  const catalog = useCompleteSongCatalog()
  const version = useAppContextDXDataVersion()
  const { region } = useAppContext()
  return useMemo(() => {
    if (!catalog || ratingEntries.length === 0) return null
    return computePushRange(calculateBest50({ catalog, version, region, entries: ratingEntries }))
  }, [catalog, ratingEntries, version, region])
}

export const RandomChartPage: FC = () => {
  const { t, i18n } = useTranslation(['random'])
  const locale = toSupportedLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE
  const { region } = useAppContext()
  const catalog = useCompleteSongCatalog()
  // The selected version's catalog is only needed for the version list, which is the same in every slice
  const versionCatalog = useSongCatalog()
  // The server and the first client render use the default range; the stored or push range is applied after mount
  const [filters, setFilters] = useState<RandomChartFilters>(DEFAULT_RANDOM_FILTERS)
  const [showBelow9, setShowBelow9] = useState(false)
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const moreFiltersId = useId()
  const [result, setResult] = useState<VersionedSheet | null | undefined>(undefined)
  const pushRange = usePushRange()
  // Where the current range came from: the push range only replaces the default, never a stored or chosen range
  const rangeSource = useRef<'default' | 'stored' | 'push' | 'user'>('default')

  useEffect(() => {
    const stored = readStoredRange()
    if (!stored) return
    rangeSource.current = 'stored'
    setFilters((current) => ({ ...current, range: stored }))
    if (stored.min < RANGE_FLOOR) setShowBelow9(true)
  }, [])

  useEffect(() => {
    if (!pushRange || rangeSource.current !== 'default') return
    rangeSource.current = 'push'
    setFilters((current) => ({ ...current, range: pushRange }))
  }, [pushRange])

  const pool = useMemo(
    () => (catalog ? filterRandomPool(catalog.sheets, filters, region, versionCatalog.version) : []),
    [catalog, filters, region, versionCatalog.version],
  )
  const versions = useMemo(() => {
    const appVersionIndex = VERSION_SORT_ORDER.indexOf(versionCatalog.version)
    return VERSION_SORT_ORDER.filter((_, index) => appVersionIndex < 0 || index <= appVersionIndex)
  }, [versionCatalog.version])

  const roll = () => {
    const picked = pickRandom(pool)
    setResult(picked)
    captureAnalyticsEvent('random_chart_rolled', {
      filter_count: countActiveFilters(filters),
      result_found: picked !== null,
    })
  }

  const settledPoolSize = useSettled(catalog ? pool.length : null, 500)

  const update = (patch: Partial<RandomChartFilters>) => setFilters((current) => ({ ...current, ...patch }))
  const setRange = (range: LevelRange) => {
    rangeSource.current = 'user'
    update({ range })
    writeStoredRange(range)
  }
  const extraFilterCount =
    (filters.types.length > 0 ? 1 : 0) +
    (filters.difficulties.length > 0 ? 1 : 0) +
    (filters.versions.length > 0 ? 1 : 0)

  return (
    <ScorePageFrame width="5xl">
      <ScorePageHeader title={t('random:title')} description={t('random:description')} />

      {/* Stacked below lg; on desktop the filters and the rolled chart sit side by side */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <MaterialSurface className="flex flex-col gap-4 p-4">
          <LevelRangePicker
            range={filters.range}
            onChange={setRange}
            showBelow9={showBelow9}
            onShowBelow9Change={setShowBelow9}
            pushRange={pushRange}
          />

          <div className="flex flex-col">
            <button
              type="button"
              aria-expanded={moreFiltersOpen}
              aria-controls={moreFiltersId}
              onClick={() => setMoreFiltersOpen((open) => !open)}
              className="-mx-2 flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border-none bg-transparent px-2 text-start text-sm font-semibold text-fg-1 hover:bg-black/4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <IconMdiChevronDown
                aria-hidden
                className={clsx(
                  'size-5 shrink-0 text-fg-2 transition-transform duration-[var(--duration-fast)]',
                  !moreFiltersOpen && '-rotate-90',
                )}
              />
              {t('random:more-filters')}
              {extraFilterCount > 0 && (
                <span className="rounded-[var(--radius-sm)] bg-accent-subtle px-1.5 text-xs leading-5 text-fg-1 num">
                  {extraFilterCount}
                </span>
              )}
            </button>
            <Collapse in={moreFiltersOpen}>
              <div id={moreFiltersId} className="flex flex-col gap-4 pt-3">
                <fieldset className="flex flex-col gap-2 border-none p-0 m-0">
                  <legend className="mb-2 text-sm font-semibold">{t('random:filters.type')}</legend>
                  <div className="flex flex-wrap gap-2">
                    {RANDOM_TYPES.map((type: TypeEnum) => (
                      <Chip
                        key={type}
                        label={getSheetTypeDisplayName(type, locale)}
                        color={filters.types.includes(type) ? 'primary' : 'default'}
                        variant={filters.types.includes(type) ? 'filled' : 'outlined'}
                        onClick={() => update({ types: toggle(filters.types, type) })}
                        aria-pressed={filters.types.includes(type)}
                        className="!rounded-lg"
                      />
                    ))}
                  </div>
                </fieldset>

                <fieldset className="flex flex-col gap-2 border-none p-0 m-0">
                  <legend className="mb-2 text-sm font-semibold">{t('random:filters.difficulty')}</legend>
                  <div className="flex flex-wrap gap-2">
                    {RANDOM_DIFFICULTIES.map((difficulty: DifficultyEnum) => {
                      const selected = filters.difficulties.includes(difficulty)
                      return (
                        <Chip
                          key={difficulty}
                          label={DIFFICULTIES[difficulty].title}
                          variant={selected ? 'filled' : 'outlined'}
                          onClick={() => update({ difficulties: toggle(filters.difficulties, difficulty) })}
                          aria-pressed={selected}
                          className="!rounded-lg"
                          sx={{
                            // Selected: the darker fill that carries white text at 4.5:1
                            ...(selected
                              ? {
                                  backgroundColor: DIFFICULTIES[difficulty].solid,
                                  borderColor: DIFFICULTIES[difficulty].solid,
                                  color: 'common.white',
                                  '&:hover': {
                                    backgroundColor: DIFFICULTIES[difficulty].solid,
                                    filter: 'brightness(0.92)',
                                  },
                                }
                              : { borderColor: DIFFICULTIES[difficulty].color, color: 'var(--fg-1)' }),
                          }}
                        />
                      )
                    })}
                  </div>
                </fieldset>

                <TextField
                  select
                  size="small"
                  label={t('random:filters.version')}
                  value={filters.versions}
                  SelectProps={{
                    multiple: true,
                    displayEmpty: true,
                    renderValue: (selected: unknown) =>
                      (selected as string[]).length === 0
                        ? t('random:filters.all-versions')
                        : (selected as string[]).join(', '),
                  }}
                  InputLabelProps={{ shrink: true }}
                  onChange={(event) => update({ versions: event.target.value as unknown as VersionEnum[] })}
                >
                  {versions.map((version) => (
                    <MenuItem key={version} value={version}>
                      {version}
                    </MenuItem>
                  ))}
                </TextField>
              </div>
            </Collapse>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="contained" size="large" onClick={roll} disabled={!catalog || pool.length === 0}>
              {t('random:roll')}
            </Button>
            {catalog ? (
              <>
                {/* The visible count follows every step; the announced one waits until the range settles */}
                <span aria-hidden className="text-sm font-semibold text-fg-1 num">
                  {t('random:pool-size', { count: pool.length })}
                </span>
                <output className="sr-only">
                  {settledPoolSize !== null && t('random:pool-size', { count: settledPoolSize })}
                </output>
              </>
            ) : (
              <CircularProgress size="1rem" aria-label={t('random:loading')} />
            )}
          </div>
        </MaterialSurface>

        <div className="flex flex-col lg:sticky lg:top-24">
          {/* Desktop only, before the first roll: keeps the two columns balanced. Mobile shows nothing here, as before */}
          {result === undefined && (
            <MaterialSurface className="hidden lg:flex flex-col items-start gap-1 p-4">
              <h2 className="section-title m-0">{t('random:placeholder.title')}</h2>
              <p className="m-0 text-sm leading-normal text-fg-2 text-pretty">
                {settledPoolSize !== null
                  ? t('random:placeholder.hint', { count: settledPoolSize })
                  : t('random:loading')}
              </p>
            </MaterialSurface>
          )}
          {/* The live region stays mounted so each new roll is announced */}
          <div aria-live="polite" className="flex flex-col">
            {result === null && (
              <MaterialSurface className="p-4 text-sm text-fg-1">{t('random:no-result')}</MaterialSurface>
            )}
            {result && (
              <MaterialSurface className="p-1">
                <Link
                  to={buildSheetPath(result)}
                  className="flex items-start gap-3 rounded-[var(--radius-md)] p-3 text-fg-1 no-underline outline-offset-[-2px] transition-colors duration-[var(--duration-fast)] hover:bg-black/4"
                >
                  <img
                    src={`https://shama.dxrating.net/images/cover/v2/${result.imageName}.jpg`}
                    alt=""
                    width={64}
                    height={64}
                    className="size-16 shrink-0 rounded-[var(--radius-md)] outline outline-1 outline-black/10 -outline-offset-1"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span lang="ja" className="text-lg font-semibold leading-snug break-words">
                      {result.title}
                    </span>
                    <span lang="ja" className="text-sm text-fg-2 break-words">
                      {result.artist}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 text-sm">
                      <span
                        className={`whitespace-nowrap font-semibold ${difficultyInkClassName}`}
                        style={difficultyTextStyle(result.difficulty)}
                      >
                        {DIFFICULTIES[result.difficulty as DifficultyEnum]?.title ?? result.difficulty}
                      </span>
                      <span className="whitespace-nowrap">{getSheetTypeDisplayName(result.type, locale)}</span>
                      <span className="whitespace-nowrap num">
                        {result.level} ({result.internalLevelValue.toFixed(1)})
                      </span>
                      <span className="whitespace-nowrap text-fg-2">{result.version}</span>
                    </span>
                    <span className="mt-1 text-sm font-semibold text-accent-strong underline decoration-1 underline-offset-2">
                      {t('random:open-chart')}
                    </span>
                  </span>
                </Link>
              </MaterialSurface>
            )}
          </div>
        </div>
      </div>
    </ScorePageFrame>
  )
}