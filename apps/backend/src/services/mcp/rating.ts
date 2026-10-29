import {
  calculateRatingAward,
  SCORE_COEFFICIENT_TABLE,
  type ComboFlag,
  type RatingRank,
} from '@gekichumai/maimai-domain'
import { z } from 'zod'

// The rating of a chart for an achievement, in the units of the MCP tools: an achievement is an integer of 1/10000 of
// a percent (100.7543% is 1007543), never a decimal, so a model copies it without rounding; ratings are integers.

/** The highest achievement there is, 101.0000% */
export const MAX_ACHIEVEMENT = 1_010_000
/** Achievements above SSS+ (100.5000%) give the rating of SSS+ */
export const RATING_ACHIEVEMENT_CAP = 1_005_000

export const achievementSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_ACHIEVEMENT)
  .describe('Achievement in 1/10000 of a percent, an integer: 100.7543% is 1007543, 99.5% is 995000')

export const comboSchema = z
  .enum(['fc', 'fcp', 'ap', 'app'])
  .optional()
  .describe('Combo lamp: fc, fcp (FC+), ap or app (AP+). AP and AP+ add 1 to the rating.')

const RANK_LABELS: Record<RatingRank, string> = {
  d: 'D',
  c: 'C',
  b: 'B',
  bb: 'BB',
  bbb: 'BBB',
  a: 'A',
  aa: 'AA',
  aaa: 'AAA',
  s: 'S',
  sp: 'S+',
  ss: 'SS',
  ssp: 'SS+',
  sss: 'SSS',
  sssp: 'SSS+',
}

export const rankLabel = (rank: RatingRank) => RANK_LABELS[rank]

/** The rating of a chart of internalLevel for achievement, with the rank and its coefficient */
export function ratingOf(internalLevel: number, achievement: number, combo?: ComboFlag) {
  const award = calculateRatingAward(internalLevel, achievement / 10_000, combo)
  return { rating: award.ratingAwardValue, rank: rankLabel(award.rank), coefficient: award.coefficient }
}

/** The lowest achievement of each rank from A up, which players aim for */
export const RANK_THRESHOLDS: { rank: string; achievement: number }[] = SCORE_COEFFICIENT_TABLE.flatMap(
  ([percent, , rank], i) => {
    const previous = SCORE_COEFFICIENT_TABLE[i - 1]
    if (previous?.[2] === rank || percent < 80) return []
    return [{ rank: rankLabel(rank), achievement: Math.round(percent * 10_000) }]
  },
)

/** The rating of a chart of internalLevel at the lowest achievement of each rank from A up */
export function thresholdsOf(internalLevel: number) {
  return RANK_THRESHOLDS.map(({ rank, achievement }) => ({
    rank,
    achievement,
    rating: ratingOf(internalLevel, achievement).rating,
  }))
}

/**
 * The lowest achievement that gives a chart of internalLevel at least rating (without the AP bonus), or null when no
 * achievement does. The rating only grows with the achievement, so a binary search finds it.
 */
export function minAchievementFor(internalLevel: number, rating: number): number | null {
  if (ratingOf(internalLevel, RATING_ACHIEVEMENT_CAP).rating < rating) return null
  let low = 0
  let high = RATING_ACHIEVEMENT_CAP
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (ratingOf(internalLevel, mid).rating >= rating) high = mid
    else low = mid + 1
  }
  return low
}