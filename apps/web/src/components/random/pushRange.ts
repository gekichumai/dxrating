import { type Best50Result, calculateRatingAward } from '@gekichumai/maimai-domain'
import { clampTenths, type LevelRange, RANGE_CEILING, RANGE_FLOOR_EXTENDED, toTenths } from './levelRange'

const SSS_PLUS = 100.5
const BUCKET_SIZE = { b15: 15, b35: 35 } as const

/**
 * The internal levels where an SSS+ would raise the user's rating ("my push range"), or null with no B50.
 *
 * The math: a chart enters the B50 when its rating beats the lowest entry of its bucket, the floor. At SSS+
 * (100.5%, coefficient 22.4) a chart of internal level L is worth floor(L × 100.5 × 22.4 / 100) = floor(L × 22.512).
 * So the low end is the smallest L, in 0.1 steps, whose SSS+ rating is above the floor. Old and new charts go into
 * different buckets (B35 and B15) with different floors, and the random pool holds both, so the lower of the two
 * floors is used: below it, no chart of either kind can count. A bucket that is not full yet has no floor (any chart
 * would count), so only full buckets set it; with neither full, the low end is the easiest chart already in the B50.
 *
 * The high end is the hardest chart in the B50. Higher charts would raise the rating too, but nothing the user has
 * played up there has counted yet, so an SSS+ there is not a realistic push. When the floor is so high that the low
 * end passes that chart, the range is just the low end. When not even 15.0 at SSS+ beats the floor, there is nothing
 * left to push and the result is null.
 */
export function computePushRange(best50: Pick<Best50Result, 'b15' | 'b35'>): LevelRange | null {
  const entries = [...best50.b15, ...best50.b35]
  if (entries.length === 0) return null

  const levels = entries.map((entry) => toTenths(entry.sheet.internalLevelValue))
  const fullFloors = (['b15', 'b35'] as const)
    .filter((bucket) => best50[bucket].length >= BUCKET_SIZE[bucket])
    .map((bucket) => Math.min(...best50[bucket].map((entry) => entry.rating.ratingAwardValue)))

  let min: number
  if (fullFloors.length === 0) {
    min = Math.min(...levels)
  } else {
    const floor = Math.min(...fullFloors)
    const lowest = lowestLevelAbove(floor)
    if (lowest === null) return null
    min = lowest
  }
  min = clampTenths(min, RANGE_FLOOR_EXTENDED)
  const max = Math.max(min, clampTenths(Math.max(...levels), RANGE_FLOOR_EXTENDED))
  return { min, max }
}

/** The smallest internal level, in tenths, whose SSS+ rating is above `rating` */
function lowestLevelAbove(rating: number): number | null {
  for (let tenths = RANGE_FLOOR_EXTENDED; tenths <= RANGE_CEILING; tenths++) {
    if (calculateRatingAward(tenths / 10, SSS_PLUS).ratingAwardValue > rating) return tenths
  }
  return null
}