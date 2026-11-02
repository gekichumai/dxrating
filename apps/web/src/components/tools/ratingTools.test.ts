import { calculateAchievement, calculateRatingAward } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import { calculateTolerance, minimumAchievementForRating, parseNumberInput, toleranceRows } from './ratingTools'

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

describe('toleranceRows', () => {
  it('keeps each type within the allowed loss', () => {
    const counts = { tap: 500, hold: 60, slide: 80, touch: 20, break: 40 }
    const result = calculateTolerance(counts, 100.5)
    for (const row of toleranceRows(counts, result)) {
      expect(calculateAchievement(counts, { great: { [row.type]: row.great } })).toBeGreaterThanOrEqual(100.5)
      if (row.great < row.count) {
        expect(calculateAchievement(counts, { great: { [row.type]: row.great + 1 } })).toBeLessThan(100.5)
      }
    }
  })

  it('omits note types the chart lacks', () => {
    const counts = { tap: 300, hold: 30, slide: 30, touch: 0, break: 10 }
    expect(toleranceRows(counts, calculateTolerance(counts, 100)).map((r) => r.type)).toEqual(['tap', 'hold', 'slide'])
  })
})

describe('parseNumberInput', () => {
  it('parses numbers and rejects junk', () => {
    expect(parseNumberInput(' 100.5 ')).toBe(100.5)
    expect(parseNumberInput('')).toBeNull()
    expect(parseNumberInput('abc')).toBeNull()
  })
})