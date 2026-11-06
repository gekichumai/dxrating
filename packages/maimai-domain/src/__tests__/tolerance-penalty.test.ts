import { describe, expect, it } from 'vitest'
import { calculateAchievement, judgementLoss, perNotePenalties } from '../tolerance'

// にゃーにゃー冒険譚 DX MASTER: TAP 802, HOLD 49, SLIDE 82, TOUCH 68, BREAK 84
// Weighted notes 802·1 + 49·2 + 82·3 + 68·1 + 84·5 = 1,634 → one weight unit is 100 / 1,634 = 0.0611995%
// BREAK bonus: 1% / 84 = 0.0119048% per BREAK
const counts = { tap: 802, hold: 49, slide: 82, touch: 68, break: 84 }
const penalties = perNotePenalties(counts)
const find = (type: string, judgement: string) => penalties.find((p) => p.type === type && p.judgement === judgement)!
const unit = 100 / 1634

describe('perNotePenalties', () => {
  it('prices TAP / HOLD / SLIDE / TOUCH from the weighted note count (hand check)', () => {
    expect(find('tap', 'great').total).toBeCloseTo(0.0122399, 7) // 0.2 units
    expect(find('tap', 'good').total).toBeCloseTo(0.0305998, 7) // 0.5 units
    expect(find('tap', 'miss').total).toBeCloseTo(0.0611995, 7) // 1 unit
    expect(find('hold', 'great').total).toBeCloseTo(0.0244798, 7) // 0.4 units
    expect(find('slide', 'miss').total).toBeCloseTo(0.1835985, 7) // 3 units
    expect(find('touch', 'good').total).toBeCloseTo(0.0305998, 7)
    for (const p of penalties.filter((p) => p.type !== 'break')) expect(p.bonus).toBe(0)
  })

  it('splits every BREAK judgement into base and bonus (hand check)', () => {
    const expected: [string, number, number][] = [
      ['perfect50', 0, 0.25 / 84], // −0.0030%, bonus only (2550 of 2600)
      ['perfect100', 0, 0.5 / 84], // −0.0060%, bonus only (2500 of 2600)
      ['great', 1 * unit, 0.6 / 84], // 2000: −0.0612% base, −0.0071% bonus
      ['great2', 2 * unit, 0.6 / 84], // 1500: −0.1224% base
      ['great3', 2.5 * unit, 0.6 / 84], // 1250: −0.1530% base
      ['good', 3 * unit, 0.7 / 84], // −0.1836% base, −0.0083% bonus
      ['miss', 5 * unit, 1 / 84], // −0.3060% base, −0.0119% bonus
    ]
    for (const [judgement, base, bonus] of expected) {
      const p = find('break', judgement)
      expect(p.base).toBeCloseTo(base, 10)
      expect(p.bonus).toBeCloseTo(bonus, 10)
      expect(p.total).toBeCloseTo(base + bonus, 10)
    }
    expect(find('break', 'perfect50').total.toFixed(4)).toBe('0.0030')
    expect(find('break', 'great3').total.toFixed(4)).toBe('0.1601')
    expect(find('break', 'miss').total.toFixed(4)).toBe('0.3179')
    expect(find('break', 'great').breakBase).toBe(2000)
    expect(find('break', 'great3').breakBase).toBe(1250)
  })

  it('states each price in TAP GREATs and agrees with the budget and the game', () => {
    expect(find('tap', 'great').inTapGreats).toBe(1)
    expect(find('slide', 'good').inTapGreats).toBeCloseTo(7.5, 10)
    expect(find('break', 'perfect50').inTapGreats).toBeCloseTo(0.25 / 84 / (0.2 * unit), 10) // ≈ 0.24
    expect(find('break', 'great3').total).toBeCloseTo(judgementLoss(counts, 'break', 'great'), 12)
    for (const p of penalties) {
      const judgements = p.type === 'break' ? { break: { [p.judgement]: 1 } } : { [p.judgement]: { [p.type]: 1 } }
      expect(calculateAchievement(counts, judgements)).toBe(Math.floor((101 - p.total) * 10000 + 1e-9) / 10000)
    }
  })

  it('leaves out note types the chart lacks', () => {
    const types = new Set(perNotePenalties({ tap: 100, hold: 0, slide: 10, touch: 0, break: 0 }).map((p) => p.type))
    expect([...types]).toEqual(['tap', 'slide'])
  })
})