import { type Song, TypeEnum, dxdata } from '@gekichumai/dxdata'
import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { TYPE_ORDER, getHighestDifficulty } from '@/models/constants'

type SongSearchParams = {
  type?: string
  difficulty?: string
}

export const LEGACY_SONG_ROUTE_REDIRECT_STATUS_CODE = 308

const getDefaultSheetParams = (song: Song) => {
  const availableTypes = TYPE_ORDER.filter((type) => song.sheets.some((sheet) => sheet.type === type))
  const type = availableTypes[0] ?? TypeEnum.DX
  const difficulty = getHighestDifficulty(song.sheets.filter((sheet) => sheet.type === type))
  return { type, difficulty }
}

const getLegacySheetParams = (song: Song, requestedType?: string, requestedDifficulty?: string) => {
  const matchingSheet = song.sheets.find(
    (sheet) => sheet.type === requestedType && sheet.difficulty === requestedDifficulty,
  )
  if (matchingSheet) {
    return {
      type: matchingSheet.type,
      difficulty: matchingSheet.difficulty,
    }
  }

  const requestedTypeSheets = song.sheets.filter((sheet) => sheet.type === requestedType)
  if (requestedTypeSheets.length > 0) {
    return {
      type: requestedType as TypeEnum,
      difficulty: getHighestDifficulty(requestedTypeSheets),
    }
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