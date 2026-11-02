import { describe, expect, it } from 'vitest'
import {
  computeAchievement,
  parseNotesDetailCells,
  solveBreakTiers,
  type BreakTierBreakdown,
  type JudgementTable,
} from '../judgement-inverse'

const row = (criticalPerfect: number, perfect = 0, great = 0, good = 0, miss = 0) => ({
  criticalPerfect,
  perfect,
  great,
  good,
  miss,
})
const allCp = (n: number): BreakTierBreakdown => ({
  criticalPerfect: n,
  perfect2550: 0,
  perfect2500: 0,
  great2000: 0,
  great1500: 0,
  great1250: 0,
  good: 0,
  miss: 0,
})

describe('computeAchievement', () => {
  const table: JudgementTable = { tap: row(100), hold: row(0), slide: row(0), touch: null, break: row(4) }

  it('all critical perfect is 101%', () => {
    expect(computeAchievement(table, allCp(4))).toBe(1010000)
  })

  it('one 2550 break loses a quarter of one break bonus', () => {
    // 1% / 4 breaks * 0.25 = 0.0625%
    expect(computeAchievement(table, { ...allCp(3), perfect2550: 1 })).toBe(1009375)
  })

  it('one tap great truncates to 4 decimals', () => {
    // base 60000, lose 100 → 100.83333...% → 100.8333%
    const t = { ...table, tap: row(99, 0, 1) }
    expect(computeAchievement(t, allCp(4))).toBe(1008333)
  })
})

describe('solveBreakTiers', () => {
  it('round-trips random plays', () => {
    let seed = 42
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed % (n + 1)
    }
    let unique = 0
    for (let i = 0; i < 300; i++) {
      const truth: BreakTierBreakdown = {
        criticalPerfect: 20 + rnd(30),
        perfect2550: rnd(8),
        perfect2500: rnd(5),
        great2000: rnd(2),
        great1500: rnd(1),
        great1250: rnd(1),
        good: rnd(1),
        miss: rnd(1),
      }
      const table: JudgementTable = {
        tap: row(400, 100, rnd(10), rnd(2), rnd(2)),
        hold: row(60, 10, rnd(3), rnd(1), 0),
        slide: row(80, 0, rnd(4), 0, rnd(1)),
        touch: row(40, 5, rnd(3), 0, 0),
        break: row(
          truth.criticalPerfect,
          truth.perfect2550 + truth.perfect2500,
          truth.great2000 + truth.great1500 + truth.great1250,
          truth.good,
          truth.miss,
        ),
      }
      const candidates = solveBreakTiers(table, computeAchievement(table, truth))
      expect(candidates).toContainEqual(truth)
      if (candidates.length === 1) unique++
    }
    expect(unique).toBeGreaterThan(280)
  })

  it('returns nothing for an inconsistent achievement', () => {
    const table: JudgementTable = { tap: row(100), hold: row(0), slide: row(0), touch: null, break: row(4) }
    expect(solveBreakTiers(table, 1009999)).toEqual([])
  })
})

describe('parseNotesDetailCells', () => {
  it('parses a DX chart table with header', () => {
    const t = parseNotesDetailCells([
      ['CRITICAL', 'PERFECT', 'GREAT', 'GOOD', 'MISS'],
      ['512', '30', '4', '1', '0'],
      ['60', '2', '0', '0', '0'],
      ['70', '1', '1', '0', '0'],
      ['30', '0', '0', '0', '0'],
      ['40', '3', '1', '0', '0'],
    ])
    expect(t.tap).toEqual(row(512, 30, 4, 1, 0))
    expect(t.touch).toEqual(row(30))
    expect(t.break).toEqual(row(40, 3, 1, 0, 0))
  })

  it('treats a blank TOUCH row as null (STD charts)', () => {
    const t = parseNotesDetailCells([
      ['1,000', '0', '0', '0', '0'],
      ['1', '0', '0', '0', '0'],
      ['1', '0', '0', '0', '0'],
      ['', '', '', '', ''],
      ['1', '0', '0', '0', '0'],
    ])
    expect(t.tap.criticalPerfect).toBe(1000)
    expect(t.touch).toBeNull()
  })
})