import { DifficultyEnum, TypeEnum, dxdata, type Sheet, type Song } from '@gekichumai/dxdata'
import { formatSheetIdentity, type SheetIdentity } from '@gekichumai/maimai-domain'
import { buildSheetPath } from '@/components/sheet/sheetLinks'
import type { FlattenedSheet } from '@/songs'

export const TRENDING_CHART_LIMIT = 100

export type TrendingChartResult = {
  songId: string
  sheetType?: TypeEnum
  sheetDifficulty?: DifficultyEnum
}

export type TrendingChartLink = FlattenedSheet & { href: string }

const typeOrder = [TypeEnum.DX, TypeEnum.STD, TypeEnum.UTAGE, TypeEnum.UTAGE2P]
const difficultyOrder = [
  DifficultyEnum.ReMaster,
  DifficultyEnum.Master,
  DifficultyEnum.Expert,
  DifficultyEnum.Advanced,
  DifficultyEnum.Basic,
]

const isRatingEligibleType = (type: TypeEnum) => type !== TypeEnum.UTAGE && type !== TypeEnum.UTAGE2P

const compareRepresentativeSheets = (a: Sheet, b: Sheet) => {
  const ratingEligibleComparison = Number(isRatingEligibleType(b.type)) - Number(isRatingEligibleType(a.type))
  if (ratingEligibleComparison !== 0) return ratingEligibleComparison

  const levelComparison = b.internalLevelValue - a.internalLevelValue
  if (levelComparison !== 0) return levelComparison

  const difficultyComparison = difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty)
  if (difficultyComparison !== 0) return difficultyComparison

  return typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type)
}

const selectRepresentativeSheet = (result: TrendingChartResult, song: Song) => {
  if (result.sheetType && result.sheetDifficulty) {
    const exactSheet = song.sheets.find(
      (sheet) => sheet.type === result.sheetType && sheet.difficulty === result.sheetDifficulty,
    )
    if (exactSheet) return exactSheet
  }

  return [...song.sheets].sort(compareRepresentativeSheets)[0] ?? null
}

const releaseDateTimestamp = (releaseDate: string | undefined) => {
  if (!releaseDate) return 0
  const timestamp = new Date(`${releaseDate}T06:00:00+09:00`).valueOf()
  return Number.isFinite(timestamp) ? timestamp : 0
}

const toTrendingChartLink = (song: Song, sheet: Sheet): TrendingChartLink => {
  const identity = {
    songId: song.songId,
    type: sheet.type,
    difficulty: sheet.difficulty,
  } as SheetIdentity
  const isTypeUtage = sheet.type === TypeEnum.UTAGE || sheet.type === TypeEnum.UTAGE2P

  return {
    ...song,
    ...sheet,
    difficulty: sheet.difficulty,
    id: formatSheetIdentity(identity),
    identity,
    isTypeUtage,
    isRatingEligible: !isTypeUtage,
    releaseDateTimestamp: releaseDateTimestamp(sheet.releaseDate),
    tags: [],
    href: buildSheetPath(identity),
  }
}

let defaultSongsById: Map<string, Song> | null = null

const getSongsById = (songs: readonly Song[]) => {
  if (songs === dxdata.songs) {
    defaultSongsById ??= new Map(dxdata.songs.map((song) => [song.songId, song]))
    return defaultSongsById
  }

  return new Map(songs.map((song) => [song.songId, song]))
}

export const buildTrendingChartLinks = (
  results: readonly TrendingChartResult[],
  songs: readonly Song[] = dxdata.songs,
): TrendingChartLink[] => {
  if (results.length === 0) return []

  const songsById = getSongsById(songs)
  const seenChartHrefs = new Set<string>()

  return results
    .flatMap((result) => {
      const song = songsById.get(result.songId)
      if (!song) return []

      const sheet = selectRepresentativeSheet(result, song)
      if (!sheet) return []

      const chart = toTrendingChartLink(song, sheet)
      if (seenChartHrefs.has(chart.href)) return []

      seenChartHrefs.add(chart.href)
      return [chart]
    })
    .slice(0, TRENDING_CHART_LIMIT)
}