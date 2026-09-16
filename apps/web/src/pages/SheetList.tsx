import { CategoryEnum, DifficultyEnum, TypeEnum, VERSION_ID_MAP, VersionEnum, dxdata } from '@gekichumai/dxdata'
import { IconButton, TextField } from '@mui/material'
import * as Sentry from '@sentry/tanstackstart-react'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { type FC, useCallback, useId, useMemo, useState, useTransition } from 'react'
import { useTranslation } from 'react-i18next'
import { useEffectOnce, useUpdateEffect } from 'react-use'
import IconMdiClose from '~icons/mdi/close'
import MdiIconInfo from '~icons/mdi/information'
import { ResponsiveDialog } from '../components/global/ResponsiveDialog'
import { SearchQuerySeedList } from '../components/sheet/SearchQuerySeedList'
import { SearchIntroduction } from '../components/sheet/SearchIntroduction'
import type { SearchQuerySeedSheet } from '../components/sheet/searchQuerySeed'
import { SheetDialogContent } from '../components/sheet/SheetDialogContent'
import { SheetListContainer } from '../components/sheet/SheetListContainer'
import { SheetSortFilter, SheetSortFilterTrigger, type SheetSortFilterForm } from '../components/sheet/SheetSortFilter'
import { SheetDetailsContextProvider } from '../models/context/SheetDetailsContext'
import { captureAnalyticsEvent } from '../lib/analytics'
import { useAppContextDXDataVersion } from '../models/context/useAppContext'
import { type FlattenedSheet, canonicalIdFromParts, useFilteredSheets, useSheets } from '../songs'
import { sheetReleaseDateTimestamp } from '../utils/dateFormatting'
import { sheetMatchesDifficultyFilter } from './sheetDifficultyFilter'
import { compareSheetsBySorts } from './sheetSorting'

const searchRouteApi = getRouteApi('/search')

const chainEvery =
  <T,>(...fns: ((arg: T) => boolean | undefined)[]) =>
  (arg: T) =>
    fns.every((fn) => fn(arg))

const skeletonWidths = Array.from({ length: 20 }).map((_, index) => 5.5 + (index % 7) * 0.8)

type SearchParams = ReturnType<typeof searchRouteApi.useSearch>
type SheetListProps = {
  seedSheets?: readonly SearchQuerySeedSheet[]
}

const summarizeSortFilter = (form: SheetSortFilterForm) => {
  const { filters, sorts } = form
  const activeFilterCount = [
    filters.versions.length !== Object.values(VersionEnum).length,
    filters.internalLevelValue?.min !== 1 || filters.internalLevelValue?.max !== 15,
    filters.tags.length > 0,
    filters.categories.length !== Object.values(CategoryEnum).length,
    filters.difficulties.length !== Object.values(DifficultyEnum).length,
    filters.favoritesOnly,
  ].filter(Boolean).length

  return {
    active_filter_count: activeFilterCount,
    selected_version_count: filters.versions.length,
    selected_difficulty_count: filters.difficulties.length,
    selected_category_count: filters.categories.length,
    selected_tag_count: filters.tags.length,
    favorites_only: filters.favoritesOnly,
    sort: sorts.map(({ descriptor, direction }) => `${descriptor}:${direction}`).join(','),
  }
}

const SheetSearchAnalytics: FC<{
  query: string
  resultCount: number
  durationMs: number
  sortFilter: SheetSortFilterForm
}> = ({ query, resultCount, durationMs, sortFilter }) => {
  useEffectOnce(() => {
    const filterSummary = summarizeSortFilter(sortFilter)
    if (!query && filterSummary.active_filter_count === 0) return

    const timeout = window.setTimeout(() => {
      captureAnalyticsEvent('sheet_search_performed', {
        query_length: query.length,
        result_count: resultCount,
        zero_results: resultCount === 0,
        duration_ms: durationMs,
        ...filterSummary,
      })
    }, 750)

    return () => window.clearTimeout(timeout)
  })

  return null
}

const SheetListInnerContent: FC<{ search: SearchParams; seedSheets: readonly SearchQuerySeedSheet[] }> = ({
  search,
  seedSheets,
}) => {
  const { t } = useTranslation(['sheet'])
  const { data: sheets, isLoading } = useSheets({ acceptsPartialData: true })
  const version = useAppContextDXDataVersion()
  const [sortFilterOptions, setSortFilterOptions] = useState<SheetSortFilterForm | null>(null)
  const [sortFilterExpanded, setSortFilterExpanded] = useState(false)
  const [sortFilterPending, startSortFilterTransition] = useTransition()
  const [hydrated, setHydrated] = useState(false)
  const sortFilterContentId = useId()
  const navigate = useNavigate()

  const query = search.q ?? ''
  const [inputQuery, setInputQuery] = useState(query)
  const { results, elapsed: searchElapsed } = useFilteredSheets(inputQuery)

  useUpdateEffect(() => {
    setInputQuery(query)
  }, [query])

  useEffectOnce(() => {
    setHydrated(true)
  })

  const updateQuery = useCallback(
    (nextQuery: string) => {
      setInputQuery(nextQuery)
      navigate({
        to: '/search',
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          q: nextQuery || undefined,
        }),
        replace: true,
        resetScroll: false,
      })
    },
    [navigate],
  )

  const toggleSortFilter = useCallback(() => {
    startSortFilterTransition(() => {
      setSortFilterExpanded((current) => !current)
    })
  }, [])

  const activeSheet = useMemo<FlattenedSheet | null>(() => {
    const { songId, type, difficulty } = search
    if (!songId || !type || !difficulty) return null
    const song = dxdata.songs.find((s) => s.songId === songId)
    if (!song) return null
    const sheet = song.sheets.find((s) => s.type === type && s.difficulty === difficulty)
    if (!sheet) return null
    const isTypeUtage = sheet.type === TypeEnum.UTAGE || sheet.type === TypeEnum.UTAGE2P
    return {
      ...song,
      ...sheet,
      id: canonicalIdFromParts(songId, type as TypeEnum, difficulty as DifficultyEnum),
      searchAcronyms: song.searchAcronyms,
      isTypeUtage,
      isRatingEligible: !isTypeUtage,
      releaseDateTimestamp: sheetReleaseDateTimestamp(sheet.releaseDate),
      internalLevelValue: sheet.multiverInternalLevelValue
        ? (sheet.multiverInternalLevelValue[version] ?? sheet.internalLevelValue)
        : sheet.internalLevelValue,
    } as FlattenedSheet
  }, [search, version])
  const activeSheetId = activeSheet?.id ?? null

  const handleSheetDialogChange = useCallback(
    (sheet: FlattenedSheet | null) => {
      if (sheet) {
        navigate({
          to: '/search',
          search: (prev: Record<string, unknown>) => ({
            ...prev,
            songId: sheet.songId,
            type: sheet.type,
            difficulty: sheet.difficulty,
          }),
          mask: {
            to: '/songs/$songId/$type/$difficulty',
            params: { songId: sheet.songId, type: sheet.type, difficulty: sheet.difficulty },
          },
          resetScroll: false,
        })
      } else {
        navigate({
          to: '/search',
          search: (prev: Record<string, unknown>) => {
            const { songId: _, type: __, difficulty: ___, ...rest } = prev
            return rest
          },
          resetScroll: false,
        })
      }
    },
    [navigate],
  )

  const { filteredResults, elapsed: filteringElapsed } = useMemo(() => {
    const startTime = performance.now()
    let sortFilteredResults: FlattenedSheet[] = results
    if (sortFilterOptions) {
      const currentVersionId = VERSION_ID_MAP.get(version) ?? 0
      const validVersions = Array.from(VERSION_ID_MAP.entries())
        .filter(([, id]) => id <= currentVersionId)
        .map(([v]) => v)
      const favoriteSheetIds = sortFilterOptions.filters.favoritesOnly
        ? new Set<string>(JSON.parse(localStorage.getItem('favorite-sheets') ?? '[]'))
        : null
      sortFilteredResults = results.filter((sheet) => {
        return chainEvery<FlattenedSheet>(
          (v) => !!v,
          (v) => {
            if (sortFilterOptions.filters.internalLevelValue) {
              const { min, max } = sortFilterOptions.filters.internalLevelValue
              return v.internalLevelValue >= min && v.internalLevelValue <= max
            }
            return true
          },
          (v) => {
            if (sortFilterOptions.filters.versions) {
              const versions = sortFilterOptions.filters.versions.filter((v) => validVersions.includes(v))
              return versions.includes(v.version)
            }
            return true
          },
          (v) => {
            if (sortFilterOptions.filters.tags.length) {
              const tags = sortFilterOptions.filters.tags
              return tags.every((tag) => v.tags.includes(tag))
            }
            return true
          },

          (v) => {
            if (sortFilterOptions.filters.categories) {
              const categories = sortFilterOptions.filters.categories
              return categories.some((category) => v.category.includes(category))
            }
            return true
          },

          (v) => sheetMatchesDifficultyFilter(v, sortFilterOptions.filters.difficulties),

          (v) => {
            if (favoriteSheetIds) {
              return favoriteSheetIds.has(v.id)
            }
            return true
          },
        )(sheet)
      })
      if (!inputQuery) {
        sortFilteredResults.sort((a, b) => compareSheetsBySorts(a, b, sortFilterOptions.sorts))
      }
    }
    const elapsed = performance.now() - startTime
    Sentry.metrics.distribution('sheet_filter.duration', elapsed, {
      unit: 'millisecond',
      attributes: { has_query: String(!!inputQuery), has_filters: String(!!sortFilterOptions) },
    })

    return {
      filteredResults: sortFilteredResults,
      elapsed,
    }
  }, [results, sortFilterOptions, inputQuery, version])
  const showSeedResults = isLoading && inputQuery && seedSheets.length > 0
  const summaryTotal = sheets?.length ?? filteredResults.length
  const summaryProgress = summaryTotal > 0 ? filteredResults.length / summaryTotal : 0

  return (
    <SheetDetailsContextProvider queryActive={!!inputQuery}>
      {sortFilterOptions && !isLoading && (
        <SheetSearchAnalytics
          key={`${inputQuery}:${filteredResults.length}:${JSON.stringify(sortFilterOptions)}`}
          query={inputQuery}
          resultCount={filteredResults.length}
          durationMs={searchElapsed + filteringElapsed}
          sortFilter={sortFilterOptions}
        />
      )}
      <div className="flex-container pb-global">
        {!inputQuery && <SearchIntroduction />}
        <ResponsiveDialog
          open={!!activeSheet}
          setOpen={(open) => {
            if (!open) handleSheetDialogChange(null)
          }}
        >
          {() => activeSheet && <SheetDialogContent sheet={activeSheet} />}
        </ResponsiveDialog>

        <div className="flex w-full items-stretch gap-2">
          <SheetSortFilterTrigger
            variant="compact"
            expanded={sortFilterExpanded}
            contentId={sortFilterContentId}
            pending={sortFilterPending}
            onToggle={toggleSortFilter}
            className="self-stretch"
          />

          <TextField
            className="min-w-0 flex-1"
            label={t('sheet:search')}
            variant="outlined"
            value={inputQuery}
            fullWidth
            onChange={(e) => {
              updateQuery(e.target.value)
            }}
            InputProps={{
              endAdornment: inputQuery && (
                <IconButton
                  onClick={() => {
                    updateQuery('')
                    captureAnalyticsEvent('sheet_search_clear_button_clicked', {
                      previous_query_length: inputQuery.length,
                      result_count: filteredResults.length,
                    })
                  }}
                  size="small"
                >
                  <IconMdiClose />
                </IconButton>
              ),
            }}
            data-attr="sheet-search"
          />
        </div>

        <SheetSortFilter
          expanded={sortFilterExpanded}
          contentId={sortFilterContentId}
          showDefaultTrigger={false}
          onChange={(v) => {
            setSortFilterOptions(v)
          }}
        />

        <div className="text-sm rounded-full shadow-lg px-4 py-2 bg-blue-200 relative overflow-hidden select-none font-bold">
          <div
            className="absolute -inset-4 bg-blue-900/20 -skew-x-8 translate-x-4 transition-width"
            style={{
              width: `${summaryProgress * 100}%`,
            }}
          />
          <div className="relative z-1 flex items-center gap-2">
            <MdiIconInfo className="text-blue-900" />
            <div className="text-blue-900">
              {t('sheet:search-summary', {
                found: isLoading ? '...' : filteredResults.length,
                total: isLoading ? '...' : sheets?.length,
                elapsed: hydrated ? (searchElapsed + filteringElapsed).toFixed(1) : '...',
              })}
            </div>
          </div>
        </div>

        {isLoading ? (
          showSeedResults ? (
            <SearchQuerySeedList sheets={seedSheets} />
          ) : (
            <div className="flex flex-col w-full">
              {skeletonWidths.map((width, i) => (
                <div
                  className="animate-pulse flex items-center justify-start gap-4 w-full h-[78px] px-5 py-2"
                  // oxlint-disable-next-line react/no-array-index-key -- index is stable
                  key={i}
                  style={{
                    animationDelay: `${i * 40}ms`,
                  }}
                >
                  <div className="h-12 w-12 min-w-[3rem] min-h-[3rem] rounded bg-slate-6/50" />
                  <div className="flex flex-col gap-1">
                    <div className="bg-slate-5/50 h-5 mb-1" style={{ width: `${width}rem` }}>
                      &nbsp;
                    </div>
                    <div className="w-24 bg-slate-3/50 h-3">&nbsp;</div>
                  </div>

                  <div className="flex-1" />
                  <div className="w-10 bg-slate-5/50 h-6 mr-2">&nbsp;</div>
                </div>
              ))}
            </div>
          )
        ) : (
          <SheetListContainer
            sheets={filteredResults}
            activeSheetId={activeSheetId}
            onSheetDialogChange={handleSheetDialogChange}
            analyticsSource="search_results"
            analyticsQueryPresent={!!inputQuery}
            analyticsResultCount={filteredResults.length}
          />
        )}
      </div>
    </SheetDetailsContextProvider>
  )
}

export const SheetList: FC<SheetListProps> = ({ seedSheets = [] }) => {
  const search = searchRouteApi.useSearch()

  return <SheetListInnerContent search={search} seedSheets={seedSheets} />
}