import { describe, expect, it } from 'vitest'
import {
  NOTE_TYPES,
  calculateAchievement,
  calculateTolerance,
  combinationToJudgements,
  evaluateCombination,
  judgementLoss,
  judgementsFor,
  toToleranceNoteCounts,
  totalBaseScore,
} from '../tolerance'

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
describe('tolerance combinations', () => {
  // Base score 425,000: one TAP GREAT costs 100 / 425,000 = 0.0235294%
  it('prices each judgement against the base score and the BREAK bonus', () => {
    expect(judgementLoss(counts, 'tap', 'great')).toBeCloseTo((100 / 425000) * 100, 10)
    expect(judgementLoss(counts, 'hold', 'good')).toBeCloseTo((500 / 425000) * 100, 10)
    expect(judgementLoss(counts, 'slide', 'miss')).toBeCloseTo((1500 / 425000) * 100, 10)
    expect(judgementLoss(counts, 'break', 'perfect50')).toBeCloseTo(0.25 / 20, 10)
    expect(judgementLoss(counts, 'break', 'perfect100')).toBeCloseTo(0.5 / 20, 10)
    // Lowest BREAK GREAT: 1250 of 2500 base, 40% of the bonus
    expect(judgementLoss(counts, 'break', 'great')).toBeCloseTo((1250 / 425000) * 100 + 0.6 / 20, 10)
    expect(judgementLoss(counts, 'break', 'miss')).toBeCloseTo((2500 / 425000) * 100 + 1 / 20, 10)
  })

  it('matches calculateAchievement for a single judgement of every kind', () => {
    for (const type of NOTE_TYPES) {
      if (counts[type] === 0) continue
      for (const judgement of judgementsFor(type)) {
        const exact = 101 - judgementLoss(counts, type, judgement)
        expect(calculateAchievement(counts, combinationToJudgements({ [type]: { [judgement]: 1 } }))).toBe(
          Math.floor(exact * 10000 + 1e-9) / 10000,
        )
      }
    }
  })

  it('hand-checked: 10 TAP GREAT + 1 HOLD GOOD + 4 BREAK 50 落ち clears 100.5%', () => {
    // Lost base: 10 × 100 + 1 × 500 = 1,500 → 0.352941%; bonus lost: 4 × 0.25 / 20 = 0.05%
    // 101 − 0.352941 − 0.05 = 100.597058 → shown as 100.5970%
    const result = evaluateCombination(counts, 100.5, {
      tap: { great: 10 },
      hold: { good: 1 },
      break: { perfect50: 4 },
    })
    expect(result.achievement).toBe(100.597)
    expect(result.passes).toBe(true)
    expect(result.remaining).toBe(0.097)
    // 0.097058 / 0.0235294 = 4.12 → 4 more TAP GREATs fit
    expect(result.remainingTapGreats).toBe(4)
    const withFour = evaluateCombination(counts, 100.5, {
      tap: { great: 14 },
      hold: { good: 1 },
      break: { perfect50: 4 },
    })
    expect(withFour.passes).toBe(true)
    expect(
      evaluateCombination(counts, 100.5, { tap: { great: 15 }, hold: { good: 1 }, break: { perfect50: 4 } }).passes,
    ).toBe(false)
  })

  it('hand-checked: a second HOLD GOOD drops it to 100.4794%', () => {
    const result = evaluateCombination(counts, 100.5, {
      tap: { great: 10 },
      hold: { good: 2 },
      break: { perfect50: 4 },
    })
    expect(result.achievement).toBe(100.4794)
    expect(result.passes).toBe(false)
    expect(result.remaining).toBe(-0.0206)
    expect(result.remainingTapGreats).toBe(0)
    expect(result.usedShare).toBe(1)
  })

  it('an empty combination is 101% and spends nothing', () => {
    const result = evaluateCombination(counts, 100.5, {})
    expect(result).toMatchObject({
      achievement: 101,
      passes: true,
      remaining: 0.5,
      remainingTapGreats: 21,
      usedShare: 0,
    })
  })
})