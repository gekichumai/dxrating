import {
  CategoryEnum,
  DifficultyEnum,
  type Song,
  type SongCatalogDocument,
  type TypeEnum,
  VERSION_ID_MAP,
  VersionEnum,
} from '@gekichumai/dxdata'
import { getSongCatalog } from '@gekichumai/maimai-domain'
import { IconButton, TextField } from '@mui/material'
import * as Sentry from '@sentry/tanstackstart-react'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { type FC, type ReactNode, useCallback, useId, useMemo, useState, useTransition } from 'react'
import { useTranslation } from 'react-i18next'
import { useEffectOnce, useUpdateEffect } from 'react-use'
import IconMdiClose from '~icons/mdi/close'
import MdiIconInfo from '~icons/mdi/information-outline'
import { MaterialSurface } from '../components/global/MaterialSurface'
import { ResponsiveDialog } from '../components/global/ResponsiveDialog'
import { SearchQuerySeedList } from '../components/sheet/SearchQuerySeedList'
import type { SearchQuerySeedSheet } from '../components/sheet/searchQuerySeed'
import { SheetDialogContent } from '../components/sheet/SheetDialogContent'
import { SHEET_LIST_FIRST_SCREEN_ROWS, SheetListContainer } from '../components/sheet/SheetListContainer'
import { SheetRowLayoutContext } from '../components/sheet/sheetRowLayout'
import {
  getDefaultSheetSortFilterForm,
  SheetSortFilter,
  SheetSortFilterTrigger,
  type SheetSortFilterForm,
} from '../components/sheet/SheetSortFilter'
import { SheetDetailsContextProvider } from '../models/context/SheetDetailsContext'
import { captureAnalyticsEvent } from '../lib/analytics'
import { DXVersionToDXDataVersionEnumMap, getDefaultAppContext } from '../models/context/AppContext'
import { useAppContextDXDataVersion } from '../models/context/useAppContext'
import { readFavoriteSheetIds } from '../models/favorite'
import { useCatalogDocument, useSongCatalog } from '../catalog/CatalogContext'
import { type FlattenedSheet, getFlattenedSheets, useFilteredSheets, useSheets } from '../songs'
import { sheetReleaseDateTimestamp } from '../utils/dateFormatting'
import { sheetMatchesDifficultyFilter } from './sheetDifficultyFilter'
import { compareSheetsBySorts, getSongCatalogPositions } from './sheetSorting'

const searchRouteApi = getRouteApi('/')

const chainEvery =
  <T,>(...fns: ((arg: T) => boolean | undefined)[]) =>
  (arg: T) =>
    fns.every((fn) => fn(arg))

const skeletonWidths = Array.from({ length: 20 }).map((_, index) => 5.5 + (index % 7) * 0.8)

type SearchParams = ReturnType<typeof searchRouteApi.useSearch>
type SheetListProps = {
  seedSheets?: readonly SearchQuerySeedSheet[]
  /** Hub modules shown under the search box while no query is entered */
  hub?: ReactNode
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

// Filtering and sorting the full catalog is the bulk of a home page render. The inputs are stable references (the cached
// catalog plus a serializable form), so keep the last result and reuse it across remounts and SSR requests.
let lastSortFilterResult:
  | {
      results: FlattenedSheet[]
      key: string
      version: VersionEnum
      positions: ReadonlyMap<string, number>
      sheets: FlattenedSheet[]
    }
  | undefined

const getSortFilteredSheets = (
  results: FlattenedSheet[],
  sortFilterOptions: SheetSortFilterForm | undefined,
  inputQuery: string,
  version: VersionEnum,
  songCatalogPositions: ReadonlyMap<string, number>,
): FlattenedSheet[] => {
  // Favorites live in localStorage and can change between calls, so that path is never cached.
  const cacheable = !sortFilterOptions?.filters.favoritesOnly
  const key = cacheable ? JSON.stringify([inputQuery, sortFilterOptions ?? null]) : ''
  if (
    cacheable &&
    lastSortFilterResult?.results === results &&
    lastSortFilterResult.version === version &&
    lastSortFilterResult.positions === songCatalogPositions &&
    lastSortFilterResult.key === key
  ) {
    return lastSortFilterResult.sheets
  }

  const sheets = computeSortFilteredSheets(results, sortFilterOptions, inputQuery, version, songCatalogPositions)
  if (cacheable) lastSortFilterResult = { results, key, version, positions: songCatalogPositions, sheets }
  return sheets
}

/** The rows a list without a query shows first: what SSR and the first client render show from the page's slice */
export const getSheetListFirstScreen = (
  document: SongCatalogDocument,
  version: VersionEnum = DXVersionToDXDataVersionEnumMap[getDefaultAppContext().version],
  sortFilterOptions: SheetSortFilterForm | undefined = getDefaultSheetSortFilterForm(),
): FlattenedSheet[] =>
  computeSortFilteredSheets(
    getFlattenedSheets(getSongCatalog(document, version)),
    sortFilterOptions,
    '',
    version,
    getSongCatalogPositions(document),
  ).slice(0, SHEET_LIST_FIRST_SCREEN_ROWS)

/**
 * The songs of the default list's first rows, for the home page's catalog slice. Ranked within the slice they come out
 * in the same order: the slice holds every song of those rows, in catalog order.
 */
export const getSheetListFirstScreenSongs = (document: SongCatalogDocument): Song[] => {
  const songIds = new Set(getSheetListFirstScreen(document).map((row) => row.songId))
  return document.songs.filter((song) => songIds.has(song.id))
}

const computeSortFilteredSheets = (
  results: FlattenedSheet[],
  sortFilterOptions: SheetSortFilterForm | undefined,
  inputQuery: string,
  version: VersionEnum,
  songCatalogPositions: ReadonlyMap<string, number>,
): FlattenedSheet[] => {
  let sortFilteredResults: FlattenedSheet[] = results
  if (sortFilterOptions) {
    const currentVersionId = VERSION_ID_MAP.get(version) ?? 0
    const validVersions = Array.from(VERSION_ID_MAP.entries())
      .filter(([, id]) => id <= currentVersionId)
      .map(([v]) => v)
    const favoriteSheetIds = sortFilterOptions.filters.favoritesOnly ? new Set<string>(readFavoriteSheetIds()) : null
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
      sortFilteredResults.sort((a, b) => compareSheetsBySorts(a, b, sortFilterOptions.sorts, songCatalogPositions))
    }
  }
  return sortFilteredResults
}

const SheetListInnerContent: FC<{
  search: SearchParams
  seedSheets: readonly SearchQuerySeedSheet[]
  hub?: ReactNode
}> = ({ search, seedSheets, hub }) => {
  const { t, i18n } = useTranslation(['sheet', 'root'])
  const { data: sheets, isLoading } = useSheets()
  const version = useAppContextDXDataVersion()
  const [sortFilterOptions, setSortFilterOptions] = useState<SheetSortFilterForm>(getDefaultSheetSortFilterForm)
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
        to: '/',
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

  const catalog = useSongCatalog()
  const catalogDocument = useCatalogDocument()
  const songCatalogPositions = getSongCatalogPositions(catalogDocument)
  const activeSheet = useMemo<FlattenedSheet | null>(() => {
    const { songId, type, difficulty } = search
    if (!songId || !type || !difficulty) return null
    const versioned = catalog.getByIdentity({
      songId,
      type: type as TypeEnum,
      difficulty: difficulty as DifficultyEnum,
    })
    if (!versioned) return null
    return {
      ...versioned,
      difficulty: versioned.difficulty as DifficultyEnum,
      releaseDateTimestamp: sheetReleaseDateTimestamp(versioned.releaseDate),
      tags: [],
    }
  }, [search, catalog])
  const activeSheetId = activeSheet?.id ?? null

  const handleSheetDialogChange = useCallback(
    (sheet: FlattenedSheet | null) => {
      if (sheet) {
        navigate({
          to: '/',
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
          to: '/',
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
    const sortFilteredResults = getSortFilteredSheets(
      results,
      sortFilterOptions,
      inputQuery,
      version,
      songCatalogPositions,
    )
    const elapsed = performance.now() - startTime
    Sentry.metrics.distribution('sheet_filter.duration', elapsed, {
      unit: 'millisecond',
      attributes: { has_query: String(!!inputQuery), has_filters: String(!!sortFilterOptions) },
    })

    return {
      filteredResults: sortFilteredResults,
      elapsed,
    }
  }, [results, sortFilterOptions, inputQuery, version, songCatalogPositions])
  const showSeedResults = isLoading && inputQuery && seedSheets.length > 0
  // Until the complete catalog loads (and during SSR), the default list shows its first rows from the page's slice
  const firstScreenSheets = useMemo(
    () => (isLoading && !inputQuery ? getSheetListFirstScreen(catalogDocument, version, sortFilterOptions) : null),
    [isLoading, inputQuery, catalogDocument, version, sortFilterOptions],
  )
  const listSheets = isLoading ? (firstScreenSheets?.length ? firstScreenSheets : null) : filteredResults
  const summaryTotal = sheets?.length ?? filteredResults.length
  const summaryProgress = summaryTotal > 0 ? filteredResults.length / summaryTotal : 0
  // The locale comes from the request (cookie or header), so server and client format counts identically
  const numberFormat = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language])
  const summaryFound = isLoading ? '…' : numberFormat.format(filteredResults.length)
  const summaryCount = isLoading ? '…' : numberFormat.format(sheets?.length ?? 0)

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
        <h1 className="sr-only">{t('root:pages.search.title')}</h1>

        <ResponsiveDialog
          open={!!activeSheet}
          setOpen={(open) => {
            if (!open) handleSheetDialogChange(null)
          }}
          hideCloseButton
        >
          {() =>
            activeSheet && <SheetDialogContent sheet={activeSheet} onClose={() => handleSheetDialogChange(null)} />
          }
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
            placeholder={t('sheet:search-placeholder')}
            variant="outlined"
            value={inputQuery}
            fullWidth
            // Over the background art the field needs the blurred material, not just the inset tint
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'var(--glass-thin-bg)',
                backdropFilter: 'var(--glass-blur-thin)',
                WebkitBackdropFilter: 'var(--glass-blur-thin)',
              },
            }}
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
                  aria-label={t('sheet:search-clear')}
                >
                  <IconMdiClose aria-hidden="true" />
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

        {!inputQuery && hub}

        {/* What the page is, in words: the hub above is links and covers, which say little to a first-time visitor
            or a crawler. Hidden while a query runs, like the hub; the query comes from the URL, so SSR matches. */}
        {!inputQuery && (
          <p className="m-0 max-w-[72ch] self-start px-1 text-sm leading-relaxed text-fg-2 text-pretty">
            {t('root:pages.search.introduction')}
          </p>
        )}

        <div className="glass-thin relative overflow-hidden px-4 py-2 text-sm font-semibold text-fg-1">
          <div
            aria-hidden="true"
            className="absolute inset-0 origin-left bg-accent-subtle transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
            style={{ transform: `scaleX(${summaryProgress})` }}
          />
          <div className="relative z-1 flex items-center gap-2" aria-hidden="true">
            <MdiIconInfo className="shrink-0 text-accent-strong" />
            <div className="num">
              {t('sheet:search-summary', {
                found: summaryFound,
                total: summaryCount,
                elapsed: hydrated ? (searchElapsed + filteringElapsed).toFixed(1) : '…',
              })}
            </div>
          </div>
          {/* Rendered empty first and always mounted, so each new count is announced politely */}
          <output aria-live="polite" className="sr-only">
            {hydrated && !isLoading
              ? t('sheet:search-summary-status', { found: summaryFound, total: summaryCount })
              : ''}
          </output>
        </div>

        {!listSheets ? (
          showSeedResults ? (
            // The server-rendered rows take the same one-line table layout from lg as the list that replaces them
            <SheetRowLayoutContext.Provider value="table">
              <SearchQuerySeedList sheets={seedSheets} />
            </SheetRowLayoutContext.Provider>
          ) : (
            <MaterialSurface className="flex flex-col w-full p-1" aria-hidden="true">
              {skeletonWidths.map((width, i) => (
                <div
                  // 78px stacked rows, then the 56px one-line table rows of SheetListContainer from lg
                  className="animate-pulse flex items-center justify-start gap-4 w-full h-[78px] lg:h-14 px-3 py-2"
                  // oxlint-disable-next-line react/no-array-index-key -- index is stable
                  key={i}
                  style={{
                    animationDelay: `${i * 40}ms`,
                  }}
                >
                  <div className="h-12 w-12 min-w-[3rem] min-h-[3rem] lg:h-10 lg:w-10 lg:min-w-10 lg:min-h-10 rounded-[var(--radius-xs)] bg-black/8" />
                  <div className="flex flex-col gap-1">
                    <div className="bg-black/8 h-5 mb-1 rounded-[var(--radius-xs)]" style={{ width: `${width}rem` }}>
                      &nbsp;
                    </div>
                    <div className="w-24 bg-black/5 h-3 rounded-[var(--radius-xs)]">&nbsp;</div>
                  </div>

                  <div className="flex-1" />
                  <div className="w-10 bg-black/8 h-6 mr-2 rounded-[var(--radius-xs)]">&nbsp;</div>
                </div>
              ))}
            </MaterialSurface>
          )
        ) : listSheets.length === 0 ? (
          <MaterialSurface className="flex w-full flex-col items-center gap-1 px-4 py-8 text-center">
            <p className="m-0 text-base font-semibold text-fg-1">{t('sheet:search-empty.title')}</p>
            <p className="m-0 max-w-[50ch] text-sm text-fg-2 text-pretty">{t('sheet:search-empty.description')}</p>
          </MaterialSurface>
        ) : (
          <SheetListContainer
            sheets={listSheets}
            activeSheetId={activeSheetId}
            onSheetDialogChange={handleSheetDialogChange}
            analyticsSource="search_results"
            analyticsQueryPresent={!!inputQuery}
            analyticsResultCount={listSheets.length}
          />
        )}
      </div>
    </SheetDetailsContextProvider>
  )
}

export const SheetList: FC<SheetListProps> = ({ seedSheets = [], hub }) => {
  const search = searchRouteApi.useSearch()

  return <SheetListInnerContent search={search} seedSheets={seedSheets} hub={hub} />
}