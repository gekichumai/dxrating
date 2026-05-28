import { DifficultyEnum, type Song, TypeEnum, dxdata } from '@gekichumai/dxdata'
import { createFileRoute, notFound, redirect } from '@tanstack/react-router'

type SongSearchParams = {
  type?: string
  difficulty?: string
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
      songId: song.songId,
      type,
      difficulty,
    },
    statusCode: LEGACY_SONG_ROUTE_REDIRECT_STATUS_CODE,
    replace: true,
  }
}

export const Route = createFileRoute('/songs_/$songId')({
  ssr: true,
  validateSearch: (search: Record<string, unknown>): SongSearchParams => ({
    type: typeof search.type === 'string' ? search.type : undefined,
    difficulty: typeof search.difficulty === 'string' ? search.difficulty : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    const song = dxdata.songs.find((s) => s.songId === params.songId)
    if (!song) {
      throw notFound()
    }

    throw redirect(resolveLegacySongRouteRedirect(song, search.type, search.difficulty))
  },
})