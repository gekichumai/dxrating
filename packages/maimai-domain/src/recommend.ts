/** Rating-raise suggestions (上分推荐): charts where a reachable achievement step beats the B50 floor */
import type { VersionEnum } from '@gekichumai/dxdata'
import { type Best50Result, calculateRatingAward, isB15Sheet, isB35Sheet } from './best50.ts'
import type { ComboFlag, Region, VersionedSheet } from './types'

export const RECOMMEND_TARGETS = [97, 98, 99, 99.5, 100, 100.5] as const

export interface RecommendRecord {
  achievementRate: number
  comboFlag?: ComboFlag
}

export interface RatingRecommendation {
  sheet: VersionedSheet
  bucket: 'b15' | 'b35'
  currentAchievement: number | null
  currentRating: number
  targetAchievement: number
  targetRating: number
  /** B50 total gain if the target is reached */
  gain: number
}

const BUCKET_SIZE = { b15: 15, b35: 35 } as const

export function recommendRatingRaises({
  sheets,
  best50,
  records,
  version,
  region,
  targets = RECOMMEND_TARGETS,
  minLevel = 0,
  maxLevel = 15,
  limit = 30,
}: {
  sheets: readonly VersionedSheet[]
  best50: Best50Result
  records: ReadonlyMap<string, RecommendRecord>
  version: VersionEnum
  region: Region
  targets?: readonly number[]
  minLevel?: number
  maxLevel?: number
  limit?: number
}): RatingRecommendation[] {
  const inBest = new Map(
    [...best50.b15, ...best50.b35].map((entry) => [entry.entry.sheetId, entry.rating.ratingAwardValue]),
  )
  const floor = (bucket: 'b15' | 'b35') => {
    const list = best50[bucket]
    return list.length < BUCKET_SIZE[bucket] ? 0 : Math.min(...list.map((entry) => entry.rating.ratingAwardValue))
  }
  const floors = { b15: floor('b15'), b35: floor('b35') }
  const result: RatingRecommendation[] = []

  for (const sheet of sheets) {
    if (!sheet.isRatingEligible) continue
    if (region !== '_generic' && !sheet.serverIds.includes(region)) continue
    if (sheet.internalLevelValue < minLevel || sheet.internalLevelValue > maxLevel) continue
    const bucket = isB15Sheet(sheet.version, version, region)
      ? 'b15'
      : isB35Sheet(sheet.version, version, region)
        ? 'b35'
        : null
    if (!bucket) continue
    const record = records.get(sheet.id)
    const current = record?.achievementRate ?? null
    const currentRating = record
      ? calculateRatingAward(sheet.internalLevelValue, record.achievementRate).ratingAwardValue
      : 0
    const baseline = inBest.get(sheet.id) ?? floors[bucket]
    for (const target of targets) {
      if (current !== null && current >= target) continue
      const targetRating = calculateRatingAward(sheet.internalLevelValue, target).ratingAwardValue
      const gain = targetRating - Math.max(baseline, inBest.has(sheet.id) ? 0 : currentRating)
      if (gain > 0) {
        result.push({
          sheet,
          bucket,
          currentAchievement: current,
          currentRating,
          targetAchievement: target,
          targetRating,
          gain,
        })
        break
      }
    }
  }
  return result
    .sort(
      (a, b) =>
        b.gain - a.gain ||
        a.targetAchievement - b.targetAchievement ||
        a.sheet.internalLevelValue - b.sheet.internalLevelValue,
    )
    .slice(0, limit)
}