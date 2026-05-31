import {
  DifficultyEnum,
  TypeEnum,
  dxdata,
  type Regions,
  type Sheet,
  type Song,
  type VersionEnum,
} from '@gekichumai/dxdata'
import { buildSheetPath } from '@/components/sheet/sheetLinks'

export const RECENT_CHART_LIMIT = 500

export type RecentChartLink = {
  songId: string
  title: string
  artist: string
  imageName: string
  type: TypeEnum
  difficulty: DifficultyEnum
  level: string
  internalLevelValue: number
  version: VersionEnum
  regions: Regions
  isLocked: boolean
  isTypeUtage: boolean
  releaseDate?: string
  href: string
}

const typeOrder = Object.values(TypeEnum)
const difficultyOrder = Object.values(DifficultyEnum)
const excludedRecentChartDifficulties = new Set<string>([DifficultyEnum.Basic, DifficultyEnum.Advanced])

const releaseDateTimestamp = (releaseDate: string | undefined) => {
  if (!releaseDate) return 0
  const timestamp = new Date(`${releaseDate}T00:00:00Z`).valueOf()
  return Number.isFinite(timestamp) ? timestamp : 0
}

const compareRecentChartLinks = (a: RecentChartLink, b: RecentChartLink) => {
  const releaseDateComparison = releaseDateTimestamp(b.releaseDate) - releaseDateTimestamp(a.releaseDate)
  if (releaseDateComparison !== 0) return releaseDateComparison

  const titleComparison = a.title.localeCompare(b.title)
  if (titleComparison !== 0) return titleComparison

  const typeComparison = typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type)
  if (typeComparison !== 0) return typeComparison

  return difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty)
}

const toRecentChartLink = (song: Song, sheet: Sheet): RecentChartLink => ({
  songId: song.songId,
  title: song.title,
  artist: song.artist,
  imageName: song.imageName,
  type: sheet.type,
  difficulty: sheet.difficulty,
  level: sheet.level,
  internalLevelValue: sheet.internalLevelValue,
  version: sheet.version,
  regions: sheet.regions,
  isLocked: song.isLocked,
  isTypeUtage: sheet.type === TypeEnum.UTAGE || sheet.type === TypeEnum.UTAGE2P,
  releaseDate: sheet.releaseDate,
  href: buildSheetPath({ songId: song.songId, type: sheet.type, difficulty: sheet.difficulty }),
})

const createRecentChartLinks = (songs: readonly Song[]) =>
  songs
    .flatMap((song) => song.sheets.map((sheet) => toRecentChartLink(song, sheet)))
    .filter((chart) => !excludedRecentChartDifficulties.has(chart.difficulty))
    .sort(compareRecentChartLinks)
    .slice(0, RECENT_CHART_LIMIT)

let defaultRecentChartLinks: RecentChartLink[] | null = null

export const buildRecentChartLinks = (songs?: readonly Song[]): RecentChartLink[] => {
  if (songs) return createRecentChartLinks(songs)

  defaultRecentChartLinks ??= createRecentChartLinks(dxdata.songs)
  return defaultRecentChartLinks.slice()
}