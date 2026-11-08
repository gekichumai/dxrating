/**
 * The next step up for one chart in a B50: the lowest achievement that adds at least one point to the B50 total, and,
 * when the score is capped below that, the point an AP adds.
 *
 * A chart in the B50 has to beat its own rating. A chart outside it has to beat the lowest rating of the bucket it
 * competes in (the floor), since reaching that replaces the floor entry. The gain is what the B50 total would gain.
 */
import { calculateRatingAward, type RatingRank } from './best50.ts'
import type { ComboFlag } from './types'

const MAX_ACHIEVEMENT_UNITS = 1_005_000

const isAllPerfect = (comboFlag: ComboFlag | undefined) => comboFlag === 'ap' || comboFlag === 'app'

/**
 * The lowest achievement (%, four decimals) whose rating award on `internalLevel` reaches `targetRating`, keeping the
 * AP bonus of `comboFlag`; null when even 100.5% falls short.
 *
 * The award only grows with the achievement, so this is a binary search over 0.0001% steps on the exact integer
 * formula, rather than a closed form that float rounding can put one step off.
 */
export function achievementForRating(
  internalLevel: number,
  targetRating: number,
  comboFlag?: ComboFlag,
): number | null {
  const award = (units: number) => calculateRatingAward(internalLevel, units / 10000, comboFlag).ratingAwardValue
  if (award(MAX_ACHIEVEMENT_UNITS) < targetRating) return null
  let low = 0
  let high = MAX_ACHIEVEMENT_UNITS
  if (award(low) >= targetRating) return 0
  // award(low) < target <= award(high)
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2)
    if (award(mid) >= targetRating) high = mid
    else low = mid
  }
  return high / 10000
}

export interface RatingStep {
  achievement: number
  rating: number
  rank: RatingRank
  /** What the B50 total gains */
  gain: number
}

export interface NextRatingTarget {
  /** The lowest achievement that adds at least one point; null when 100.5% can't */
  next: RatingStep | null
  /** The rating an AP at 100.5% would give, when the chart has no AP yet and that beats the baseline */
  allPerfect: { rating: number; gain: number } | null
}

/**
 * The next step for a chart scored `achievementRate` with `comboFlag`, against `baseline`: its own rating when it is
 * in the B50, the bucket floor when it is not. Null when neither a better score nor an AP would add a point.
 */
export function nextRatingTarget({
  internalLevel,
  achievementRate,
  comboFlag,
  baseline,
}: {
  internalLevel: number
  achievementRate: number
  comboFlag?: ComboFlag
  baseline: number
}): NextRatingTarget | null {
  const target = baseline + 1
  const achievement = achievementForRating(internalLevel, target, comboFlag)
  let next: RatingStep | null = null
  if (achievement !== null && achievement > achievementRate) {
    const award = calculateRatingAward(internalLevel, achievement, comboFlag)
    next = { achievement, rating: award.ratingAwardValue, rank: award.rank, gain: award.ratingAwardValue - baseline }
  }

  let allPerfect: NextRatingTarget['allPerfect'] = null
  if (!isAllPerfect(comboFlag)) {
    const rating = calculateRatingAward(internalLevel, 100.5, 'ap').ratingAwardValue
    if (rating > baseline) allPerfect = { rating, gain: rating - baseline }
  }

  return next || allPerfect ? { next, allPerfect } : null
}