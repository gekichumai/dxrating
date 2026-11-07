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
import clsx from 'clsx'
import {
  type FC,
  type ReactNode,
  startTransition,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { useEffectOnce, useUpdateEffect } from 'react-use'
import IconMdiClose from '~icons/mdi/close'
import MdiIconInfo from '~icons/mdi/information-outline'
import { MaterialSurface } from '../components/global/MaterialSurface'
import { ResponsiveDialog } from '../components/global/ResponsiveDialog'
import { SearchQuerySeedList } from '../components/sheet/SearchQuerySeedList'
import type { SearchQuerySeedSheet } from '../components/sheet/searchQuerySeed'
import { SheetDialogContent } from '../components/sheet/SheetDialogContent'
import { SheetGridContainer, SheetGridSkeleton } from '../components/sheet/SheetGridContainer'
import { SHEET_LIST_FIRST_SCREEN_ROWS, SheetListContainer } from '../components/sheet/SheetListContainer'
import { SheetListLayoutToggle } from '../components/sheet/SheetListLayoutToggle'
import { type SheetListLayout, useSheetListLayout } from '../components/sheet/sheetListLayout'
import { SheetRowLayoutContext } from '../components/sheet/sheetRowLayout'
import {
  getDefaultSheetSortFilterForm,
  SheetSortFilter,
  SheetSortFilterTrigger,
  countActiveSortFilters,
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
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

const searchRouteApi = getRouteApi('/')

const chainEvery =
  <T,>(...fns: ((arg: T) => boolean | undefined)[]) =>
  (arg: T) =>
    fns.every((fn) => fn(arg))

const skeletonWidths = Array.from({ length: 20 }).map((_, index) => 5.5 + (index % 7) * 0.8)

/**
 * Where each layout shows. Once the layout is known only that one renders. Before that (the server render and
 * hydration, see useSheetListLayout) both render and CSS shows the default for the width, so the cached HTML suits
 * every screen and nothing moves when hydration settles it. The `lg` breakpoint matches SHEET_GRID_DEFAULT_MEDIA_QUERY.
 */
const layoutSlots = (layout: SheetListLayout | null) => ({
  list: layout === 'grid' ? null : clsx('w-full', layout === null && 'lg:hidden'),
  grid: layout === 'list' ? null : clsx('w-full', layout === null && 'hidden lg:block'),
})

const SheetListSkeleton: FC = () => (
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

/**
 * The search field. It owns its text, so a keystroke re-renders only the field; the query goes to the list in a
 * transition. `query` is the list's query: when it changes from outside (Back to another ?q=, a link), the field
 * follows; its own keystrokes coming back late (an older transition committing) are ignored, so they never overwrite
 * newer typing.
 */
/** How long typing pauses before the query is written to the URL */
const URL_QUERY_DELAY_MS = 400

const SheetSearchField: FC<{ query: string; onQueryChange: (query: string) => void; resultCount: number }> = ({
  query,
  onQueryChange,
  resultCount,
}) => {
  const locale = useLocale()
  const [value, setValue] = useState(query)
  const sent = useRef(new Set<string>())

  useUpdateEffect(() => {
    if (sent.current.has(query)) {
      if (query === value) sent.current.clear()
      return
    }
    sent.current.clear()
    setValue(query)
  }, [query])

  const change = (next: string) => {
    setValue(next)
    sent.current.add(next)
    startTransition(() => onQueryChange(next))
  }

  return (
    <TextField
      className="min-w-0 flex-1"
      label={m.sheet_search({}, { locale })}
      placeholder={m.sheet_searchPlaceholder({}, { locale })}
      variant="outlined"
      value={value}
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
        change(e.target.value)
      }}
      InputProps={{
        endAdornment: value && (
          <IconButton
            onClick={() => {
              change('')
              captureAnalyticsEvent('sheet_search_clear_button_clicked', {
                previous_query_length: value.length,
                result_count: resultCount,
              })
            }}
            size="small"
            aria-label={m.sheet_searchClear({}, { locale })}
          >
            <IconMdiClose aria-hidden="true" />
          </IconButton>
        ),
      }}
      data-attr="sheet-search"
    />
  )
}

const SheetListInnerContent: FC<{
  search: SearchParams
  seedSheets: readonly SearchQuerySeedSheet[]
  hub?: ReactNode
}> = ({ search, seedSheets, hub }) => {
  const locale = useLocale()
  const { data: sheets, isLoading } = useSheets()
  const version = useAppContextDXDataVersion()
  const [sortFilterOptions, setSortFilterOptions] = useState<SheetSortFilterForm>(getDefaultSheetSortFilterForm)
  const [sortFilterExpanded, setSortFilterExpanded] = useState(false)
  const [sortFilterPending, startSortFilterTransition] = useTransition()
  const [hydrated, setHydrated] = useState(false)
  const sortFilterContentId = useId()
  const navigate = useNavigate()
  const [layout, setLayout] = useSheetListLayout()
  const slots = layoutSlots(layout)
  const changeLayout = useCallback(
    (next: SheetListLayout) => {
      if (layout) captureAnalyticsEvent('sheet_list_layout_changed', { layout: next, previous_layout: layout })
      setLayout(next)
    },
    [layout, setLayout],
  )

  const query = search.q ?? ''
  // The query the results follow. The field (SheetSearchField) keeps its own text and hands each keystroke over in a
  // transition, so typing repaints only the field; the search, filtering, list and the ?q= navigation (which
  // re-renders the route) run behind the paint, and a newer keystroke interrupts a stale render. Keystroke INP was
  // ~200-300ms at 4x CPU with all of it in the input event
  const [resultsQuery, setResultsQuery] = useState(query)
  const { results, elapsed: searchElapsed } = useFilteredSheets(resultsQuery)

  useUpdateEffect(() => {
    setResultsQuery(query)
  }, [query])

  useEffectOnce(() => {
    setHydrated(true)
  })

  // The ?q= update waits until typing pauses. The router's state is an external store, so its update renders
  // synchronously, with the route and this list: done on every keystroke, it pulled the whole re-render back into
  // the input event, and a keystroke cost 300-400ms at 6x CPU
  const urlQueryTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(urlQueryTimer.current), [])

  /** Called in a transition by the search field */
  const updateQuery = useCallback(
    (nextQuery: string) => {
      setResultsQuery(nextQuery)
      clearTimeout(urlQueryTimer.current)
      urlQueryTimer.current = setTimeout(() => {
        void navigate({
          to: '/',
          search: (prev: Record<string, unknown>) => ({
            ...prev,
            q: nextQuery || undefined,
          }),
          replace: true,
          resetScroll: false,
        })
      }, URL_QUERY_DELAY_MS)
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
      resultsQuery,
      version,
      songCatalogPositions,
    )
    const elapsed = performance.now() - startTime
    Sentry.metrics.distribution('sheet_filter.duration', elapsed, {
      unit: 'millisecond',
      attributes: { has_query: String(!!resultsQuery), has_filters: String(!!sortFilterOptions) },
    })

    return {
      filteredResults: sortFilteredResults,
      elapsed,
    }
  }, [results, sortFilterOptions, resultsQuery, version, songCatalogPositions])
  const showSeedResults = isLoading && resultsQuery && seedSheets.length > 0
  // Until the complete catalog loads (and during SSR), the default list shows its first rows from the page's slice
  const firstScreenSheets = useMemo(
    () => (isLoading && !resultsQuery ? getSheetListFirstScreen(catalogDocument, version, sortFilterOptions) : null),
    [isLoading, resultsQuery, catalogDocument, version, sortFilterOptions],
  )
  const listSheets = isLoading ? (firstScreenSheets?.length ? firstScreenSheets : null) : filteredResults
  const summaryTotal = sheets?.length ?? filteredResults.length
  const summaryProgress = summaryTotal > 0 ? filteredResults.length / summaryTotal : 0
  // The locale comes from the request (cookie or header), so server and client format counts identically
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale])
  const summaryFound = isLoading ? '…' : numberFormat.format(filteredResults.length)
  const summaryCount = isLoading ? '…' : numberFormat.format(sheets?.length ?? 0)

  return (
    <SheetDetailsContextProvider queryActive={!!resultsQuery}>
      {sortFilterOptions && !isLoading && (
        <SheetSearchAnalytics
          key={`${resultsQuery}:${filteredResults.length}:${JSON.stringify(sortFilterOptions)}`}
          query={resultsQuery}
          resultCount={filteredResults.length}
          durationMs={searchElapsed + filteringElapsed}
          sortFilter={sortFilterOptions}
        />
      )}
      <div className="flex-container pb-global">
        <h1 className="sr-only">{m.root_pages_search_title({}, { locale })}</h1>

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
            activeCount={countActiveSortFilters(sortFilterOptions)}
            onToggle={toggleSortFilter}
            className="self-stretch"
          />

          <SheetSearchField query={resultsQuery} onQueryChange={updateQuery} resultCount={filteredResults.length} />
        </div>

        <SheetSortFilter
          expanded={sortFilterExpanded}
          contentId={sortFilterContentId}
          showDefaultTrigger={false}
          onChange={(v) => {
            setSortFilterOptions(v)
          }}
        />

        {!resultsQuery && hub}

        {/* What the page is, in words: the hub above is links and covers, which say little to a first-time visitor
            or a crawler. Hidden while a query runs, like the hub; the query comes from the URL, so SSR matches. */}
        {!resultsQuery && (
          <p className="m-0 max-w-[72ch] self-start px-1 text-sm leading-relaxed text-fg-2 text-pretty">
            {m.root_pages_search_introduction({}, { locale })}
          </p>
        )}

        {/* The result count, with the list / grid switch beside it, as in the iOS app's results header */}
        <div className="flex w-full items-stretch gap-2">
          <div className="glass-thin relative min-w-0 flex-1 overflow-hidden px-4 py-2 text-sm font-semibold text-fg-1">
            <div
              aria-hidden="true"
              className="absolute inset-0 origin-left bg-accent-subtle transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
              style={{ transform: `scaleX(${summaryProgress})` }}
            />
            <div className="relative z-1 flex h-full items-center gap-2" aria-hidden="true">
              <MdiIconInfo className="shrink-0 text-accent-strong" />
              <div className="min-w-0 num">
                {m.sheet_searchSummary(
                  {
                    found: summaryFound,
                    total: summaryCount,
                    elapsed: hydrated ? (searchElapsed + filteringElapsed).toFixed(1) : '…',
                  },
                  { locale },
                )}
              </div>
            </div>
            {/* Rendered empty first and always mounted, so each new count is announced politely */}
            <output aria-live="polite" className="sr-only">
              {hydrated && !isLoading
                ? m.sheet_searchSummaryStatus({ found: summaryFound, total: summaryCount }, { locale })
                : ''}
            </output>
          </div>

          <SheetListLayoutToggle layout={layout} onChange={changeLayout} />
        </div>

        {!listSheets ? (
          showSeedResults ? (
            // The server-rendered rows take the same one-line table layout from lg as the list that replaces them
            <SheetRowLayoutContext.Provider value="table">
              <SearchQuerySeedList sheets={seedSheets} />
            </SheetRowLayoutContext.Provider>
          ) : (
            <>
              {slots.list !== null && (
                <div className={slots.list}>
                  <SheetListSkeleton />
                </div>
              )}
              {slots.grid !== null && (
                <div className={slots.grid}>
                  <SheetGridSkeleton />
                </div>
              )}
            </>
          )
        ) : listSheets.length === 0 ? (
          <MaterialSurface className="flex w-full flex-col items-center gap-1 px-4 py-8 text-center">
            <p className="m-0 text-base font-semibold text-fg-1">{m.sheet_searchEmpty_title({}, { locale })}</p>
            <p className="m-0 max-w-[50ch] text-sm text-fg-2 text-pretty">
              {m.sheet_searchEmpty_description({}, { locale })}
            </p>
          </MaterialSurface>
        ) : (
          // Each layout keeps its own slot, so the one that stays when the other drops out after hydration is not
          // remounted
          <>
            {slots.list !== null && (
              <div className={slots.list}>
                <SheetListContainer
                  sheets={listSheets}
                  activeSheetId={activeSheetId}
                  onSheetDialogChange={handleSheetDialogChange}
                  analyticsSource="search_results"
                  analyticsQueryPresent={!!resultsQuery}
                  analyticsResultCount={listSheets.length}
                />
              </div>
            )}
            {slots.grid !== null && (
              <div className={slots.grid}>
                <SheetGridContainer
                  sheets={listSheets}
                  activeSheetId={activeSheetId}
                  onSheetDialogChange={handleSheetDialogChange}
                  analyticsSource="search_results"
                  analyticsQueryPresent={!!resultsQuery}
                  analyticsResultCount={listSheets.length}
                />
              </div>
            )}
          </>
        )}
      </div>
    </SheetDetailsContextProvider>
  )
}

export const SheetList: FC<SheetListProps> = ({ seedSheets = [], hub }) => {
  const search = searchRouteApi.useSearch()

  return <SheetListInnerContent search={search} seedSheets={seedSheets} hub={hub} />
}