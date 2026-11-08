import { describe, expect, it } from 'vitest'
import { calculateRatingAward } from '../best50'
import { achievementForRating, nextRatingTarget } from '../rating-targets'

describe('achievementForRating', () => {
  it('finds the lowest achievement reaching each rating', () => {
    for (const level of [11.6, 13.0, 13.7, 14.4, 15.0]) {
      const max = calculateRatingAward(level, 100.5).ratingAwardValue
      for (let target = max - 40; target <= max; target++) {
        const achievement = achievementForRating(level, target)!
        expect(calculateRatingAward(level, achievement).ratingAwardValue).toBeGreaterThanOrEqual(target)
        expect(
          calculateRatingAward(level, (Math.round(achievement * 10000) - 1) / 10000).ratingAwardValue,
        ).toBeLessThan(target)
      }
      expect(achievementForRating(level, max + 1)).toBeNull()
    }
  })

  it('keeps the AP bonus point', () => {
    const max = calculateRatingAward(14, 100.5).ratingAwardValue
    expect(achievementForRating(14, max + 1)).toBeNull()
    expect(achievementForRating(14, max + 1, 'ap')).toBe(100.5)
  })
})

describe('nextRatingTarget', () => {
  it('beats the chart’s own rating when it is in the B50', () => {
    const own = calculateRatingAward(14.0, 100.1).ratingAwardValue
    const target = nextRatingTarget({ internalLevel: 14.0, achievementRate: 100.1, baseline: own })!
    expect(target.next!.gain).toBeGreaterThanOrEqual(1)
    expect(target.next!.achievement).toBeGreaterThan(100.1)
    expect(target.next!.rating).toBe(calculateRatingAward(14.0, target.next!.achievement).ratingAwardValue)
    expect(target.allPerfect).toEqual({
      rating: calculateRatingAward(14.0, 100.5).ratingAwardValue + 1,
      gain: calculateRatingAward(14.0, 100.5).ratingAwardValue + 1 - own,
    })
  })

  it('beats the bucket floor when the chart is outside the B50', () => {
    const target = nextRatingTarget({ internalLevel: 13.0, achievementRate: 98, baseline: 280 })!
    expect(target.next!.rating).toBeGreaterThanOrEqual(281)
    expect(target.next!.gain).toBe(target.next!.rating - 280)
  })

  it('offers only the AP once the score is capped', () => {
    const own = calculateRatingAward(14.0, 100.5).ratingAwardValue
    expect(nextRatingTarget({ internalLevel: 14.0, achievementRate: 100.5, baseline: own })).toEqual({
      next: null,
      allPerfect: { rating: own + 1, gain: 1 },
    })
  })

  it('is null when nothing adds a point', () => {
    const own = calculateRatingAward(14.0, 100.5, 'ap').ratingAwardValue
    expect(nextRatingTarget({ internalLevel: 14.0, achievementRate: 100.5, comboFlag: 'ap', baseline: own })).toBeNull()
    expect(nextRatingTarget({ internalLevel: 10.0, achievementRate: 90, baseline: 300 })).toBeNull()
  })
})