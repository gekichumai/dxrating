import {
  DifficultyEnum,
  TypeEnum,
  type ServerEnum,
  type SongCatalogDocument,
  type VersionEnum,
} from '@gekichumai/dxdata'
import { calculateRatingAward } from '@gekichumai/maimai-domain'
import { buildSheetPath } from '@/components/sheet/sheetLinks'

/** The level bands that get a constant table, highest first. URL slugs write `+` as `p` (`/constants/14p`). */
export const CONSTANT_TABLE_LEVELS = ['15', '14+', '14', '13+', '13', '12+', '12', '11+', '11', '10+', '10'] as const
export type ConstantTableLevel = (typeof CONSTANT_TABLE_LEVELS)[number]

export const constantTableSlug = (level: ConstantTableLevel) => level.replace('+', 'p')

export const constantTablePath = (level: ConstantTableLevel) => `/constants/${constantTableSlug(level)}`

export const parseConstantTableSlug = (slug: string): ConstantTableLevel | null =>
  CONSTANT_TABLE_LEVELS.find((level) => constantTableSlug(level) === slug.toLowerCase()) ?? null

/** The constant table a chart of this level belongs to, if any */
export const constantTableLevelOf = (level: string): ConstantTableLevel | null =>
  CONSTANT_TABLE_LEVELS.find((candidate) => candidate === level) ?? null

export type ConstantTableChart = {
  songId: string
  title: string
  artist: string
  type: TypeEnum
  difficulty: DifficultyEnum
  internalLevelValue: number
  version: VersionEnum
  serverIds: ServerEnum[]
  notes: number | null
  bpm: number | null
  /** Single-chart rating at SSS+ (100.5%) and SSS (100.0%) */
  ratingSssPlus: number
  ratingSss: number
  href: string
}

export type ConstantTableGroup = {
  /** One decimal, e.g. `14.7` */
  constant: string
  charts: ConstantTableChart[]
}

export type ConstantTable = {
  level: ConstantTableLevel
  chartCount: number
  groups: ConstantTableGroup[]
}

const difficultyOrder = Object.values(DifficultyEnum)

/**
 * Every playable standard (DX / STD) chart of one level, grouped by internal level from high to low. Utage charts are
 * left out: their levels are not part of the rating ladder.
 */
export function buildConstantTable(document: SongCatalogDocument, level: ConstantTableLevel): ConstantTable {
  const charts: ConstantTableChart[] = []

  for (const song of document.songs) {
    for (const sheet of song.sheets) {
      if (sheet.type !== TypeEnum.DX && sheet.type !== TypeEnum.STD) continue
      if (sheet.level !== level || !(sheet.internalLevelValue > 0) || sheet.serverIds.length === 0) continue

      charts.push({
        songId: song.id,
        title: song.title,
        artist: song.artist,
        type: sheet.type,
        difficulty: sheet.difficulty,
        internalLevelValue: sheet.internalLevelValue,
        version: sheet.version,
        serverIds: sheet.serverIds,
        notes: sheet.noteCounts?.total ?? null,
        bpm: song.bpm ?? null,
        ratingSssPlus: calculateRatingAward(sheet.internalLevelValue, 100.5).ratingAwardValue,
        ratingSss: calculateRatingAward(sheet.internalLevelValue, 100).ratingAwardValue,
        href: buildSheetPath({ songId: song.id, type: sheet.type, difficulty: sheet.difficulty }),
      })
    }
  }

  charts.sort(
    (a, b) =>
      b.internalLevelValue - a.internalLevelValue ||
      a.title.localeCompare(b.title) ||
      a.type.localeCompare(b.type) ||
      difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty),
  )

  const groups: ConstantTableGroup[] = []
  for (const chart of charts) {
    const constant = chart.internalLevelValue.toFixed(1)
    const group = groups.at(-1)
    if (group?.constant === constant) group.charts.push(chart)
    else groups.push({ constant, charts: [chart] })
  }

  return { level, chartCount: charts.length, groups }
}