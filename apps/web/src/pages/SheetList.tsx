import { type DifficultyEnum, TypeEnum, VERSION_ID_MAP, dxdata } from '@gekichumai/dxdata'
import { IconButton, TextField } from '@mui/material'
import * as Sentry from '@sentry/react'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { usePostHog } from 'posthog-js/react'
import { type FC, useCallback, useContext, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParam } from 'react-use'
import IconMdiClose from '~icons/mdi/close'
import MdiIconInfo from '~icons/mdi/information'
import { ResponsiveDialog } from '../components/global/ResponsiveDialog'
import { SheetDialogContent } from '../components/sheet/SheetDialogContent'
import { SheetListContainer } from '../components/sheet/SheetListContainer'
import { SheetSortFilter, type SheetSortFilterForm } from '../components/sheet/SheetSortFilter'
import { SheetDetailsContext, SheetDetailsContextProvider } from '../models/context/SheetDetailsContext'
import { useAppContextDXDataVersion } from '../models/context/useAppContext'
import { type FlattenedSheet, canonicalIdFromParts, useFilteredSheets, useSheets } from '../songs'

const searchRouteApi = getRouteApi('/search')

const chainEvery =
  <T,>(...fns: ((arg: T) => boolean | undefined)[]) =>
  (arg: T) =>
    fns.every((fn) => fn(arg))

const skeletonWidths = Array.from({ length: 20 }).map(() => Math.random() * 6.0 + 5.5)

const SORT_DESCRIPTOR_MAPPING = {
  releaseDate: 'releaseDateTimestamp' as const,
}

const _SheetListInner: FC = () => {
  const posthog = usePostHog()
  const { t } = useTranslation(['sheet'])
  const { data: sheets, isLoading } = useSheets({ acceptsPartialData: true })
  const { setQueryActive } = useContext(SheetDetailsContext)
  const version = useAppContextDXDataVersion()
  const queryParam = useSearchParam('q')
  const [query, setQuery] = useState<string>(queryParam ?? '')
  const { results, elapsed: searchElapsed } = useFilteredSheets(query)
  const [sortFilterOptions, setSortFilterOptions] = useState<SheetSortFilterForm | null>(null)
  const navigate = useNavigate()

  const search = searchRouteApi.useSearch()
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
      releaseDateTimestamp: sheet.releaseDate ? new Date(`${sheet.releaseDate}T06:00:00+09:00`).valueOf() : 0,
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
            to: '/songs/$songId',
            params: { songId: sheet.songId },
            search: { type: sheet.type, difficulty: sheet.difficulty },
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

          (v) => {
            if (favoriteSheetIds) {
              return favoriteSheetIds.has(v.id)
            }
            return true
          },
        )(sheet)
      })
      if (!query) {
        sortFilteredResults.sort((a, b) =>
          sortFilterOptions.sorts.reduce((acc, sort) => {
            if (acc !== 0) {
              return acc
            }
            const descriptor =
              SORT_DESCRIPTOR_MAPPING[sort.descriptor as keyof typeof SORT_DESCRIPTOR_MAPPING] ?? sort.descriptor
            const aValue = a[descriptor]
            const bValue = b[descriptor]

            // null or undefined goes to the end
            if (aValue == null && bValue == null) {
              return 0
            }
            if (aValue == null) {
              return -1
            }
            if (bValue == null) {
              return 1
            }

            if (aValue < bValue) {
              return sort.direction === 'asc' ? -1 : 1
            }
            if (aValue > bValue) {
              return sort.direction === 'asc' ? 1 : -1
            }
            return 0
          }, 0),
        )
      }
    }
    const elapsed = performance.now() - startTime
    Sentry.metrics.distribution('sheet_filter.duration', elapsed, {
      unit: 'millisecond',
      attributes: { has_query: String(!!query), has_filters: String(!!sortFilterOptions) },
    })

    return {
      filteredResults: sortFilteredResults,
      elapsed,
    }
  }, [results, sortFilterOptions, query, version])

  return (
    <div className="flex-container pb-global">
      <ResponsiveDialog
        open={!!activeSheet}
        setOpen={(open) => {
          if (!open) handleSheetDialogChange(null)
        }}
      >
        {() => activeSheet && <SheetDialogContent sheet={activeSheet} />}
      </ResponsiveDialog>

      <TextField
        label={t('sheet:search')}
        variant="outlined"
        value={query}
        fullWidth
        onChange={(e) => {
          setQuery(e.target.value)
          setQueryActive(!!e.target.value)
        }}
        InputProps={{
          endAdornment: query && (
            <IconButton
              onClick={() => {
                setQuery('')
                setQueryActive(false)
                posthog?.capture('sheet_search_clear_button_clicked')
              }}
              size="small"
            >
              <IconMdiClose />
            </IconButton>
          ),
        }}
        data-attr="sheet-search"
      />

      <SheetSortFilter
        onChange={(v) => {
          setSortFilterOptions(v)
        }}
      />

      <div className="text-sm rounded-full shadow-lg px-4 py-2 bg-blue-200 relative overflow-hidden select-none font-bold">
        <div
          className="absolute -inset-4 bg-blue-900/20 -skew-x-8 translate-x-4 transition-width"
          style={{
            width: `${(filteredResults.length / (sheets?.length ?? filteredResults.length)) * 100}%`,
          }}
        />
        <div className="relative z-1 flex items-center gap-2">
          <MdiIconInfo className="text-blue-900" />
          <div className="text-blue-900">
            {t('sheet:search-summary', {
              found: isLoading ? '...' : filteredResults.length,
              total: isLoading ? '...' : sheets?.length,
              elapsed: (searchElapsed + filteringElapsed).toFixed(1),
            })}
          </div>
        </div>
      </div>

      {isLoading ? (
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
      ) : (
        <SheetListContainer
          sheets={filteredResults}
          activeSheetId={activeSheetId}
          onSheetDialogChange={handleSheetDialogChange}
        />
      )}
    </div>
  )
}

const SheetListInner = Sentry.withProfiler(_SheetListInner)

export const SheetList: FC = () => {
  return (
    <SheetDetailsContextProvider>
      <SheetListInner />
    </SheetDetailsContextProvider>
  )
}