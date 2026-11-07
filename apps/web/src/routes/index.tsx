import { isPublicSongId } from '@gekichumai/maimai-domain'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { getCatalogDocument } from '@/catalog/catalogSource'
import { loadLegacySongIds } from '@/catalog/legacySongIds'
import { resolveLegacySongId } from '@/catalog/songLookup'
import type { Song } from '@gekichumai/dxdata'
import { getSheetListFirstScreenSongs, SheetList } from '@/pages/SheetList'
import { buildSearchSeo, buildSongSheetTitle, resolveSeoLocale, type SongSheetSeoSheet } from '@/utils/seo'
import { HomeHub } from '@/components/home/HomeHub'
import { buildHomeRecentSongs, type HomeRecentSong } from '@/components/home/homeModules'
import {
  buildSearchQuerySeedSheets,
  SEARCH_QUERY_MAX_LENGTH,
  type SearchQuerySeedSheet,
} from '@/components/sheet/searchQuerySeed'

type SearchParams = {
  q?: string
  songId?: string
  type?: string
  difficulty?: string
}

type SearchLoaderData = {
  seedSheets: SearchQuerySeedSheet[]
  /** The page's catalog slice: the songs of the default list's first rows */
  catalogSongs: Song[]
  /** Hub module: newest songs (user-agnostic, rendered during SSR) */
  recentSongs: HomeRecentSong[]
  /** The chart open in the dialog (?songId&type&difficulty), for the tab title */
  dialogSheet?: { song: { title: string }; sheet: SongSheetSeoSheet }
}

/** The chart a dialog link names, if the catalog has it */
const findDialogSheet = (
  document: Awaited<ReturnType<typeof getCatalogDocument>>,
  { songId, type, difficulty }: SearchParams,
): SearchLoaderData['dialogSheet'] => {
  if (!songId || !type || !difficulty) return undefined
  const song = document.songs.find((candidate) => candidate.id === songId)
  const sheet = song?.sheets.find((candidate) => candidate.type === type && candidate.difficulty === difficulty)
  if (!song || !sheet) return undefined
  return {
    song: { title: song.title },
    // Neither the level nor the internal level: the dialog shows the ones of the visitor's game version (multiver,
    // e.g. a chart re-rated from 13.9 to 14), which only the client knows, so the title names just the chart
    sheet: { type: sheet.type, difficulty: sheet.difficulty },
  }
}

const searchString = (value: unknown) => {
  const stringValue =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : undefined

  if (stringValue && stringValue.length > SEARCH_QUERY_MAX_LENGTH) {
    throw new RangeError(`Search query must not exceed ${SEARCH_QUERY_MAX_LENGTH} characters`)
  }
  return stringValue
}

export const loadSearchRouteData = async (
  search: SearchParams,
  // Seed rows stand in for results while the complete catalog loads, which only a server render (a shared or
  // reloaded ?q= link) needs: in the browser this loader runs on each ?q= update and awaits the complete catalog
  // first, so a second search here only cost input latency (INP) and was never shown
  { withSeeds = import.meta.env.SSR }: { withSeeds?: boolean } = {},
): Promise<SearchLoaderData> => {
  const document = await getCatalogDocument()
  const dialogSheet = findDialogSheet(document, search)
  if (search.q)
    return {
      seedSheets: withSeeds ? buildSearchQuerySeedSheets(search.q, document) : [],
      catalogSongs: [],
      recentSongs: [],
      dialogSheet,
    }
  // Only server renders (and the hydration that follows) render from the slice; the browser has the complete catalog
  return {
    seedSheets: [],
    catalogSongs: import.meta.env.SSR ? getSheetListFirstScreenSongs(document) : [],
    recentSongs: buildHomeRecentSongs(document),
    dialogSheet,
  }
}

export const validateSearchParams = (search: Record<string, unknown>): SearchParams => ({
  q: searchString(search.q),
  songId: typeof search.songId === 'string' ? search.songId : undefined,
  type: typeof search.type === 'string' ? search.type : undefined,
  difficulty: typeof search.difficulty === 'string' ? search.difficulty : undefined,
})

export const Route = createFileRoute('/')({
  ssr: true,
  head: ({ match, matches, loaderData }) => {
    const locale = resolveSeoLocale([match, ...matches])
    const seo = buildSearchSeo(locale)
    // With a chart dialog open, the tab names the chart, as the chart's own page does; the rest of the head is
    // the search page's (the dialog URL is not a page of its own)
    const dialogSheet = (loaderData as SearchLoaderData | undefined)?.dialogSheet
    if (!dialogSheet) return { meta: seo.meta }
    const title = buildSongSheetTitle(dialogSheet.song, dialogSheet.sheet, locale)
    return { meta: [{ title }, ...seo.meta.filter((entry) => !('title' in entry))] }
  },
  validateSearch: validateSearchParams,
  loaderDeps: ({ search }): SearchParams => ({
    q: search.q,
    songId: search.songId,
    type: search.type,
    difficulty: search.difficulty,
  }),
  loader: async ({ deps }: { deps: SearchParams }) => {
    // Chart dialog links from before public song IDs name the song by its legacy ID
    if (deps.songId && !isPublicSongId(deps.songId)) {
      const songId = resolveLegacySongId(await getCatalogDocument(), deps.songId, await loadLegacySongIds())
      if (songId) {
        throw redirect({ to: '/', search: (prev) => ({ ...prev, songId }), statusCode: 308, replace: true })
      }
    }
    return loadSearchRouteData(deps)
  },
  component: SearchRouteComponent,
})

function SearchRouteComponent() {
  const loaderData = Route.useLoaderData() as SearchLoaderData | undefined

  return (
    <SheetList
      seedSheets={loaderData?.seedSheets ?? []}
      hub={<HomeHub recentSongs={loaderData?.recentSongs ?? []} />}
    />
  )
}