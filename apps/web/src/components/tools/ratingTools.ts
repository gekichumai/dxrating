import { SCORE_COEFFICIENT_TABLE, calculateRatingAward } from '@gekichumai/maimai-domain'

export const MIN_INTERNAL_LEVEL = 1
export const MAX_INTERNAL_LEVEL = 15
export const MAX_ACHIEVEMENT = 101

/** Achievement steps shown in the rating table, highest first */
export const RATING_TABLE_ACHIEVEMENTS = [100.5, 100, 99.5, 99, 98, 97, 94, 90, 80] as const

/** Target presets offered by the tolerance calculator */
export const TOLERANCE_TARGET_PRESETS = [97, 98, 99, 99.5, 100, 100.5] as const

export const clampInternalLevel = (value: number) =>
  Math.min(MAX_INTERNAL_LEVEL, Math.max(MIN_INTERNAL_LEVEL, Math.round(value * 10) / 10))

/** Parses a user-typed number; null when empty or not a finite number */
export const parseNumberInput = (value: string): number | null => {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Lowest achievement (in %, four decimals) whose rating award reaches `targetRating` on a chart of `internalLevel`,
 * without an AP bonus; null when even 100.5% falls short.
 */
export function minimumAchievementForRating(internalLevel: number, targetRating: number): number | null {
  const levelTenths = Math.round(internalLevel * 10)
  if (levelTenths <= 0) return null
  if (targetRating <= 0) return 0
  let best: number | null = null
  for (let i = 0; i < SCORE_COEFFICIENT_TABLE.length; i++) {
    const [lower, coefficient] = SCORE_COEFFICIENT_TABLE[i]!
    const coefficientTenths = Math.round(coefficient * 10)
    if (coefficientTenths <= 0) continue
    const lowerUnits = Math.round(lower * 10000)
    const next = SCORE_COEFFICIENT_TABLE[i + 1]
    const upperUnits = next ? Math.round(next[0] * 10000) : 1005001
    const needed = Math.max(lowerUnits, Math.ceil((targetRating * 100000000) / (levelTenths * coefficientTenths)))
    if (needed < upperUnits && needed <= 1005000) {
      best = best === null ? needed : Math.min(best, needed)
    }
  }
  if (best === null) return null
  // Guard against float rounding in the closed form
  while (best > 0 && calculateRatingAward(internalLevel, (best - 1) / 10000).ratingAwardValue >= targetRating) best--
  while (best <= 1005000 && calculateRatingAward(internalLevel, best / 10000).ratingAwardValue < targetRating) best++
  return best > 1005000 ? null : best / 10000
}

export const ratingFor = (internalLevel: number, achievement: number) =>
  calculateRatingAward(internalLevel, achievement)