import { calculateAchievement, calculateRatingAward, combinationToJudgements } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import { minimumAchievementForRating, parseNumberInput, toleranceRows } from './ratingTools'

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
  it('gives each judgement the most that fits on its own', () => {
    const counts = { tap: 500, hold: 60, slide: 80, touch: 20, break: 40 }
    for (const target of [97, 99.5, 100, 100.5]) {
      for (const row of toleranceRows(counts, target)) {
        for (const cell of row.cells) {
          const at = (n: number) =>
            calculateAchievement(counts, combinationToJudgements({ [row.type]: { [cell.judgement]: n } }))
          expect(at(cell.soloMax)).toBeGreaterThanOrEqual(target)
          if (cell.capped) expect(cell.soloMax).toBe(row.count)
          else expect(at(cell.soloMax + 1)).toBeLessThan(target)
        }
      }
    }
  })

  it('caps BREAK 50 / 100 落ち at the BREAK count and prices them in TAP GREATs', () => {
    // 84 BREAKs, as in the chart from the feedback: all 84 can drop 100 and still clear 100.5%
    const counts = { tap: 600, hold: 80, slide: 60, touch: 40, break: 84 }
    const breakRow = toleranceRows(counts, 100.5).find((row) => row.type === 'break')!
    const drop50 = breakRow.cells.find((cell) => cell.judgement === 'perfect50')!
    const drop100 = breakRow.cells.find((cell) => cell.judgement === 'perfect100')!
    expect(breakRow.count).toBe(84)
    expect(drop50).toMatchObject({ soloMax: 84, capped: true })
    expect(drop100).toMatchObject({ soloMax: 84, capped: true })
    const base = 600 * 500 + 80 * 1000 + 60 * 1500 + 40 * 500 + 84 * 2500
    expect(drop50.rate).toBeCloseTo(0.25 / 84 / ((100 / base) * 100), 10)
    const tapGreat = toleranceRows(counts, 100.5)[0]!.cells[0]!
    expect(tapGreat.rate).toBe(1)
  })

  it('omits note types the chart lacks', () => {
    const counts = { tap: 300, hold: 30, slide: 30, touch: 0, break: 10 }
    expect(toleranceRows(counts, 100).map((r) => r.type)).toEqual(['tap', 'hold', 'slide', 'break'])
    expect(
      toleranceRows(counts, 100)
        .at(-1)!
        .cells.map((c) => c.judgement),
    ).toEqual(['great', 'good', 'miss', 'perfect50', 'perfect100'])
  })
})

describe('parseNumberInput', () => {
  it('parses numbers and rejects junk', () => {
    expect(parseNumberInput(' 100.5 ')).toBe(100.5)
    expect(parseNumberInput('')).toBeNull()
    expect(parseNumberInput('abc')).toBeNull()
  })
})