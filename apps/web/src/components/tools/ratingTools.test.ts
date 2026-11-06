import { calculateRatingAward } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import { minimumAchievementForRating, parseNumberInput } from './ratingTools'

describe('minimumAchievementForRating', () => {
  it('finds the lowest achievement reaching a rating', () => {
    for (const [level, target] of [
      [13.2, 280],
      [14.5, 320],
      [12.0, 200],
      [15.0, 337],
    ] as const) {
      const achievement = minimumAchievementForRating(level, target)
      expect(achievement).not.toBeNull()
      expect(calculateRatingAward(level, achievement!).ratingAwardValue).toBeGreaterThanOrEqual(target)
      expect(calculateRatingAward(level, achievement! - 0.0001).ratingAwardValue).toBeLessThan(target)
    }
  })

  it('returns null when 100.5% is not enough', () => {
    const max = calculateRatingAward(13, 100.5).ratingAwardValue
    expect(minimumAchievementForRating(13, max + 1)).toBeNull()
    expect(minimumAchievementForRating(13, max)).toBe(100.5)
  })
})

describe('parseNumberInput', () => {
  it('parses numbers and rejects junk', () => {
    expect(parseNumberInput(' 100.5 ')).toBe(100.5)
    expect(parseNumberInput('')).toBeNull()
    expect(parseNumberInput('abc')).toBeNull()
  })
})