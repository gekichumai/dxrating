import type { FlattenedSheet } from '../songs'
import { DIFFICULTY_ORDER, TYPE_ORDER } from '../models/constants'

export type TrendingChartResult = {
  songId: string
  sheetType?: string
  sheetDifficulty?: string
}

export function selectRecentlyUpdatedSheets(sheets: FlattenedSheet[]): FlattenedSheet[] {
  return [...sheets].sort((a, b) => {
    const timestampOrder = b.releaseDateTimestamp - a.releaseDateTimestamp
    if (timestampOrder !== 0) return timestampOrder

    const titleOrder = a.title.localeCompare(b.title)
    if (titleOrder !== 0) return titleOrder

    return a.id.localeCompare(b.id)
  })
}

const typeRank = new Map(TYPE_ORDER.map((type, index) => [type, index]))
const difficultyRank = new Map(DIFFICULTY_ORDER.map((difficulty, index) => [difficulty, index]))

function compareRepresentativeSheet(a: FlattenedSheet, b: FlattenedSheet) {
  const ratingEligibleOrder = Number(b.isRatingEligible) - Number(a.isRatingEligible)
  if (ratingEligibleOrder !== 0) return ratingEligibleOrder

  const levelOrder = b.internalLevelValue - a.internalLevelValue
  if (levelOrder !== 0) return levelOrder

  const difficultyOrder =
    (difficultyRank.get(a.difficulty) ?? Number.MAX_SAFE_INTEGER) -
    (difficultyRank.get(b.difficulty) ?? Number.MAX_SAFE_INTEGER)
  if (difficultyOrder !== 0) return difficultyOrder

  const typeOrder =
    (typeRank.get(a.type) ?? Number.MAX_SAFE_INTEGER) - (typeRank.get(b.type) ?? Number.MAX_SAFE_INTEGER)
  if (typeOrder !== 0) return typeOrder

  return a.id.localeCompare(b.id)
}

function selectRepresentativeSheet(result: TrendingChartResult, songSheets: FlattenedSheet[]) {
  if (result.sheetType && result.sheetDifficulty) {
    const exactSheet = songSheets.find(
      (sheet) => sheet.type === result.sheetType && sheet.difficulty === result.sheetDifficulty,
    )
    if (exactSheet) return exactSheet
  }

  return [...songSheets].sort(compareRepresentativeSheet)[0] ?? null
}

export function selectTrendingSheets({
  results,
  sheets,
}: {
  results: TrendingChartResult[]
  sheets: FlattenedSheet[]
}): FlattenedSheet[] {
  const sheetsBySongId = new Map<string, FlattenedSheet[]>()
  for (const sheet of sheets) {
    const songSheets = sheetsBySongId.get(sheet.songId) ?? []
    songSheets.push(sheet)
    sheetsBySongId.set(sheet.songId, songSheets)
  }

  const seenSheetIds = new Set<string>()
  return results.flatMap((result) => {
    const songSheets = sheetsBySongId.get(result.songId)
    if (!songSheets) return []

    const sheet = selectRepresentativeSheet(result, songSheets)
    if (!sheet || seenSheetIds.has(sheet.id)) return []

    seenSheetIds.add(sheet.id)
    return [sheet]
  })
}