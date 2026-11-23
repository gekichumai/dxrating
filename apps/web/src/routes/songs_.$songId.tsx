import { DifficultyEnum, type Song, TypeEnum } from '@gekichumai/dxdata'
import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { getCatalogDocument } from '@/catalog/catalogSource'
import { findSongById, resolveSongRouteParam } from '@/catalog/songLookup'
import { type SupportedLocale, toSupportedLocale } from '@/setup/locale'
import { SongHubPage } from '@/pages/SongHubPage'
import { m } from '@/paraglide/messages'
import { getSearchAcronymsWithServerAliases } from '@/songs'
import { buildSongHubSeo, formatSeoTitle, resolveSeoLocale } from '@/utils/seo'

type SongSearchParams = {
  type?: string
  difficulty?: string
  locale?: SupportedLocale
}

export const LEGACY_SONG_ROUTE_REDIRECT_STATUS_CODE = 308

type SongSheet = Song['sheets'][number]

type SheetRouteParams = {
  type: TypeEnum
  difficulty: string
}

const getSheetRouteParams = (sheet: SongSheet): SheetRouteParams => ({
  type: sheet.type,
  difficulty: sheet.difficulty,
})

const getPreferredSheet = (sheets: SongSheet[]) => {
  return sheets.find((sheet) => sheet.difficulty === DifficultyEnum.Master) ?? sheets[0]
}

const getDefaultSheetParams = (song: Song) => {
  const preferredSheet = getPreferredSheet(song.sheets)
  return preferredSheet ? getSheetRouteParams(preferredSheet) : { type: TypeEnum.DX, difficulty: DifficultyEnum.Master }
}

const getLegacySheetParams = (song: Song, requestedType?: string, requestedDifficulty?: string) => {
  const matchingSheet = song.sheets.find(
    (sheet) => sheet.type === requestedType && sheet.difficulty === requestedDifficulty,
  )
  if (matchingSheet) {
    return getSheetRouteParams(matchingSheet)
  }

  const requestedTypeSheets = song.sheets.filter((sheet) => sheet.type === requestedType)
  const preferredRequestedTypeSheet = getPreferredSheet(requestedTypeSheets)
  if (preferredRequestedTypeSheet) {
    return getSheetRouteParams(preferredRequestedTypeSheet)
  }

  return getDefaultSheetParams(song)
}

export const resolveLegacySongRouteRedirect = (song: Song, requestedType?: string, requestedDifficulty?: string) => {
  const { type, difficulty } = getLegacySheetParams(song, requestedType, requestedDifficulty)
  return {
    to: '/songs/$songId/$type/$difficulty' as const,
    params: {
      songId: song.id,
      type,
      difficulty,
    },
    statusCode: LEGACY_SONG_ROUTE_REDIRECT_STATUS_CODE,
    replace: true,
  }
}

/** Old `?type=&difficulty=` links still go to that chart; a bare `/songs/<id>` renders the hub */
export const hasLegacySheetQuery = (search: SongSearchParams) => Boolean(search.type || search.difficulty)

/** A legacy song ID moves to its public ID's hub (the router keeps the URL's language prefix) */
export const resolveLegacySongHubRedirect = (redirectSongId: string) => ({
  to: '/songs/$songId' as const,
  params: { songId: redirectSongId },
  statusCode: LEGACY_SONG_ROUTE_REDIRECT_STATUS_CODE,
  replace: true,
})

export const Route = createFileRoute('/songs_/$songId')({
  ssr: true,
  validateSearch: (search: Record<string, unknown>): SongSearchParams => ({
    type: typeof search.type === 'string' ? search.type : undefined,
    difficulty: typeof search.difficulty === 'string' ? search.difficulty : undefined,
    locale: toSupportedLocale(typeof search.locale === 'string' ? search.locale : undefined) ?? undefined,
  }),
  beforeLoad: async ({ params, search }) => {
    const catalogDocument = await getCatalogDocument()
    const resolution = await resolveSongRouteParam(catalogDocument, params.songId)
    if (!resolution) {
      throw notFound()
    }
    if (hasLegacySheetQuery(search)) {
      const song = 'song' in resolution ? resolution.song : findSongById(catalogDocument, resolution.redirectSongId)
      if (!song) throw notFound()
      throw redirect(resolveLegacySongRouteRedirect(song, search.type, search.difficulty))
    }
    if ('redirectSongId' in resolution) {
      throw redirect(resolveLegacySongHubRedirect(resolution.redirectSongId))
    }
  },
  loader: async ({ params }) => {
    const resolution = await resolveSongRouteParam(await getCatalogDocument(), params.songId)
    if (!resolution || !('song' in resolution)) {
      throw notFound()
    }
    const { song } = resolution
    // The song is the page's catalog slice: SSR and hydration render it before the complete catalog loads
    return { song, catalogSongs: [song] }
  },
  head: ({ loaderData, match, matches }) => {
    const locale = resolveSeoLocale([match, ...matches])
    const song = loaderData?.song
    if (!song) {
      return { meta: [{ title: formatSeoTitle(m.song_notFound_title({}, { locale })) }] }
    }
    const seo = buildSongHubSeo(
      {
        ...song,
        aliases: getSearchAcronymsWithServerAliases({ songId: song.id, searchAcronyms: song.searchAcronyms }),
      },
      locale,
    )
    return {
      meta: seo.meta,
      scripts: [{ type: 'application/ld+json', children: JSON.stringify(seo.structuredData) }],
    }
  },
  component: SongHubPage,
})