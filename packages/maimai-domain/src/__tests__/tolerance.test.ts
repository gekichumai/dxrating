import { describe, expect, it } from 'vitest'
import { calculateAchievement, calculateTolerance, toToleranceNoteCounts, totalBaseScore } from '../tolerance'

const counts = { tap: 500, hold: 50, slide: 50, touch: 0, break: 20 }

describe('tolerance', () => {
  it('computes base score', () => {
    expect(totalBaseScore(counts)).toBe(500 * 500 + 50 * 1000 + 50 * 1500 + 20 * 2500)
  })
  it('all critical is 101%', () => {
    expect(calculateAchievement(counts)).toBe(101)
  })
  it('allowed TAP GREATs keep the target', () => {
    const t = calculateTolerance(counts, 100.5)
    expect(t.maxTapGreat).toBeGreaterThan(0)
    expect(calculateAchievement(counts, { great: { tap: t.maxTapGreat } })).toBeGreaterThanOrEqual(100.5)
    expect(calculateAchievement(counts, { great: { tap: t.maxTapGreat + 1 } })).toBeLessThan(100.5)
  })
  it('break 50 / 100 losses follow the bonus split', () => {
    const t = calculateTolerance(counts, 100.5)
    expect(t.break50Loss).toBeCloseTo(0.25 / 20)
    expect(t.break100Loss).toBeCloseTo(0.5 / 20)
    expect(t.maxBreak50).toBe(20)
    expect(calculateAchievement(counts, { break: { perfect50: 20 } })).toBe(100.75)
    expect(calculateAchievement(counts, { break: { perfect100: 20 } })).toBe(100.5)
    expect(t.maxBreak100).toBe(20)
  })
  it('handles 101 and unreachable targets', () => {
    expect(calculateTolerance(counts, 101).maxTapGreat).toBe(0)
    expect(calculateTolerance(counts, 102).feasible).toBe(false)
  })
  it('a miss of everything is 0', () => {
    expect(calculateAchievement(counts, { miss: { tap: 500, hold: 50, slide: 50 }, break: { miss: 20 } })).toBe(0)
  })
  it('normalises catalog counts', () => {
    expect(toToleranceNoteCounts({ tap: 1, break: 2, total: 3 })).toEqual({
      tap: 1,
      hold: 0,
      slide: 0,
      touch: 0,
      break: 2,
    })
    expect(toToleranceNoteCounts({})).toBeNull()
  })
})