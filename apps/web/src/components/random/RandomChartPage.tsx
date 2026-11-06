import { VERSION_SORT_ORDER, type DifficultyEnum, type TypeEnum, type VersionEnum } from '@gekichumai/dxdata'
import type { VersionedSheet } from '@gekichumai/maimai-domain'
import { Button, Chip, CircularProgress, MenuItem, Slider, TextField } from '@mui/material'
import { Link } from '@tanstack/react-router'
import { type FC, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSongCatalog, useCompleteSongCatalog } from '@/catalog/CatalogContext'
import { MaterialSurface } from '@/components/global/MaterialSurface'
import { difficultyTextStyle, ScorePageFrame, ScorePageHeader } from '@/components/scores/ScorePage'
import { buildSheetPath } from '@/components/sheet/sheetLinks'
import { getSheetTypeDisplayName } from '@/components/song/sheetDisplay'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { useAppContext } from '@/models/context/useAppContext'
import { DIFFICULTIES } from '@/models/difficulties'
import { DEFAULT_LOCALE, toSupportedLocale } from '@/setup/locale'
import { difficultyInkClassName } from '@/utils/difficultyInk'
import {
  countActiveFilters,
  DEFAULT_RANDOM_FILTERS,
  filterRandomPool,
  pickRandom,
  RANDOM_DIFFICULTIES,
  RANDOM_LEVEL_MAX,
  RANDOM_LEVEL_MIN,
  RANDOM_TYPES,
  type RandomChartFilters,
} from './randomChart'

/** The value once it has stopped changing for `delay` ms, so a slider drag is announced once, not on every step */
function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}

const toggle = <T,>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value]

export const RandomChartPage: FC = () => {
  const { t, i18n } = useTranslation(['random'])
  const locale = toSupportedLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE
  const { region } = useAppContext()
  const catalog = useCompleteSongCatalog()
  // The selected version's catalog is only needed for the version list, which is the same in every slice
  const versionCatalog = useSongCatalog()
  const [filters, setFilters] = useState<RandomChartFilters>(DEFAULT_RANDOM_FILTERS)
  const [result, setResult] = useState<VersionedSheet | null | undefined>(undefined)

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

  const settledPoolSize = useSettled(pool.length, 500)

  const update = (patch: Partial<RandomChartFilters>) => setFilters((current) => ({ ...current, ...patch }))

  return (
    <ScorePageFrame>
      <ScorePageHeader title={t('random:title')} description={t('random:description')} />

      <MaterialSurface className="flex flex-col gap-4 p-4">
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
                  onClick={() =>
                    update({
                      difficulties: toggle(filters.difficulties, difficulty),
                    })
                  }
                  aria-pressed={selected}
                  className="!rounded-lg"
                  sx={{
                    // Selected: the darker fill that carries white text at 4.5:1
                    ...(selected
                      ? {
                          backgroundColor: DIFFICULTIES[difficulty].solid,
                          borderColor: DIFFICULTIES[difficulty].solid,
                          color: 'common.white',
                          '&:hover': { backgroundColor: DIFFICULTIES[difficulty].solid, filter: 'brightness(0.92)' },
                        }
                      : { borderColor: DIFFICULTIES[difficulty].color, color: 'var(--fg-1)' }),
                  }}
                />
              )
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1">
          <span id="random-level-label" className="text-sm font-semibold">
            {t('random:filters.level', {
              min: filters.minLevel,
              max: filters.maxLevel,
            })}
          </span>
          <Slider
            className="mx-2 w-auto"
            aria-labelledby="random-level-label"
            value={[filters.minLevel, filters.maxLevel]}
            min={RANDOM_LEVEL_MIN}
            max={RANDOM_LEVEL_MAX}
            step={1}
            marks
            valueLabelDisplay="auto"
            disableSwap
            onChange={(_, value) => {
              const [minLevel, maxLevel] = value as number[]
              update({ minLevel: minLevel!, maxLevel: maxLevel! })
            }}
          />
        </div>

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

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="contained" size="large" onClick={roll} disabled={!catalog || pool.length === 0}>
            {t('random:roll')}
          </Button>
          <output className="text-sm text-fg-2 num">
            {catalog ? (
              t('random:pool-size', { count: settledPoolSize })
            ) : (
              <CircularProgress size="1rem" aria-label={t('random:loading')} />
            )}
          </output>
        </div>
      </MaterialSurface>

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
    </ScorePageFrame>
  )
}