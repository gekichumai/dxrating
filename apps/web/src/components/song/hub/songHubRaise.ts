import type { VersionEnum } from '@gekichumai/dxdata'
import {
  type Region,
  type SongCatalog,
  type VersionedSheet,
  calculateBest50,
  recommendRatingRaises,
} from '@gekichumai/maimai-domain'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'

export interface SongHubRaise {
  targetAchievement: number
  gain: number
}

/**
 * For each of a song's sheets, the lowest achievement step that raises the user's B50 total, and by how much.
 * Sheets without a reachable gain are absent from the result.
 */
export function computeSongHubRaises({
  songSheets,
  entries,
  catalog,
  version,
  region,
}: {
  songSheets: readonly VersionedSheet[]
  entries: readonly PlayEntry[]
  catalog: SongCatalog
  version: VersionEnum
  region: Region
}): Map<string, SongHubRaise> {
  const result = new Map<string, SongHubRaise>()
  if (songSheets.length === 0) return result

  const ratingEntries = entries.flatMap((entry) => {
    const identity = entry.identity ?? catalog.getById(entry.sheetId)?.identity
    return identity
      ? [{ sheetId: entry.sheetId, identity, achievementRate: entry.achievementRate, comboFlag: entry.comboFlag }]
      : []
  })
  const best50 = calculateBest50({ catalog, version, region, entries: ratingEntries })

  const records = new Map<string, { achievementRate: number }>()
  for (const entry of entries) {
    const existing = records.get(entry.sheetId)
    if (!existing || existing.achievementRate < entry.achievementRate) {
      records.set(entry.sheetId, { achievementRate: entry.achievementRate })
    }
  }

  const recommendations = recommendRatingRaises({
    sheets: songSheets,
    best50,
    records,
    version,
    region,
    limit: Number.POSITIVE_INFINITY,
  })
  for (const recommendation of recommendations) {
    const existing = result.get(recommendation.sheet.id)
    if (!existing || recommendation.targetAchievement < existing.targetAchievement) {
      result.set(recommendation.sheet.id, {
        targetAchievement: recommendation.targetAchievement,
        gain: recommendation.gain,
      })
    }
  }
  return result
}
