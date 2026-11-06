import { describe, expect, it } from 'vitest'
import { formatAchievementRate } from '../AchievementRatingTable'

describe('formatAchievementRate', () => {
  it('shows a threshold in its shortest form', () => {
    expect(formatAchievementRate(100.5)).toBe('100.5%')
    expect(formatAchievementRate(97)).toBe('97%')
  })

  it('keeps the decimals of a played score, up to four', () => {
    expect(formatAchievementRate(99.1234)).toBe('99.1234%')
    expect(formatAchievementRate(100.52)).toBe('100.52%')
    expect(formatAchievementRate(98.123449)).toBe('98.1234%')
  })
})