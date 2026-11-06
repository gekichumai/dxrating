import { describe, expect, it } from 'vitest'
import { calculateAchievement, calculateToleranceBudget, evaluateBudget, judgementLoss } from '../tolerance'

// Base score 500·500 + 50·1000 + 50·1500 + 20·2500 = 425,000; one TAP GREAT loses 100 / 425,000 = 0.0235294%
const counts = { tap: 500, hold: 50, slide: 50, touch: 0, break: 20 }
const byJudgement = (budget: ReturnType<typeof calculateToleranceBudget>, type: string, judgement: string) =>
  budget.rows.find((row) => row.type === type)!.judgements.find((j) => j.judgement === judgement)!

describe('tolerance budget', () => {
  const budget = calculateToleranceBudget(counts, 100.5)

  it('states the margin once, in % and in TAP GREATs', () => {
    expect(budget.allowedLoss).toBeCloseTo(0.5, 10)
    expect(budget.tapGreatLoss).toBeCloseTo((100 / 425000) * 100, 10)
    expect(budget.inTapGreats).toBeCloseTo(21.25, 10)
  })

  it('prices regular judgements with the DX weights (TAP/TOUCH 1, HOLD 2, SLIDE 3; GREAT 20%, GOOD 50%, MISS 100%)', () => {
    expect(byJudgement(budget, 'tap', 'great').inTapGreats).toBeCloseTo(1)
    expect(byJudgement(budget, 'tap', 'good').inTapGreats).toBeCloseTo(2.5)
    expect(byJudgement(budget, 'tap', 'miss').inTapGreats).toBeCloseTo(5)
    expect(byJudgement(budget, 'hold', 'great').inTapGreats).toBeCloseTo(2)
    expect(byJudgement(budget, 'hold', 'miss').inTapGreats).toBeCloseTo(10)
    expect(byJudgement(budget, 'slide', 'good').inTapGreats).toBeCloseTo(7.5)
    expect(byJudgement(budget, 'slide', 'miss').inTapGreats).toBeCloseTo(15)
    expect(judgementLoss({ ...counts, touch: 10 }, 'touch', 'great')).toBeCloseTo(
      judgementLoss({ ...counts, touch: 10 }, 'tap', 'great'),
    )
  })

  it('prices BREAK judgements as base score plus their share of the 1% bonus', () => {
    // 50落: only a quarter of one BREAK's bonus share (1% / 20 BREAKs)
    expect(byJudgement(budget, 'break', 'perfect50').loss).toBeCloseTo(0.25 / 20, 10)
    expect(byJudgement(budget, 'break', 'perfect100').loss).toBeCloseTo(0.5 / 20, 10)
    // GREAT at its lowest tier: 1250 of 2500 base, 40% bonus kept
    expect(byJudgement(budget, 'break', 'great').loss).toBeCloseTo((1250 / 425000) * 100 + 0.6 / 20, 10)
    expect(byJudgement(budget, 'break', 'good').loss).toBeCloseTo((1500 / 425000) * 100 + 0.7 / 20, 10)
    expect(byJudgement(budget, 'break', 'miss').loss).toBeCloseTo((2500 / 425000) * 100 + 1 / 20, 10)
  })

  it('gives each "only this judgement" cap, and flags when the cap is every note', () => {
    expect(byJudgement(budget, 'tap', 'great')).toMatchObject({ soloMax: 21, soloAll: false })
    expect(byJudgement(budget, 'hold', 'great')).toMatchObject({ soloMax: 10, soloAll: false })
    expect(byJudgement(budget, 'slide', 'miss')).toMatchObject({ soloMax: 1, soloAll: false })
    expect(byJudgement(budget, 'break', 'great')).toMatchObject({ soloMax: 1, soloAll: false })
    expect(byJudgement(budget, 'break', 'miss')).toMatchObject({ soloMax: 0, soloAll: false })
    // Every BREAK can be a 50落 or a 100落 and 100.5% still holds: 20 × 0.025% = 0.5% exactly
    expect(byJudgement(budget, 'break', 'perfect50')).toMatchObject({ soloMax: 20, soloAll: true })
    expect(byJudgement(budget, 'break', 'perfect100')).toMatchObject({ soloMax: 20, soloAll: true })
  })

  it('agrees with the game at each solo cap and one past it', () => {
    for (const row of budget.rows) {
      for (const j of row.judgements) {
        expect(
          evaluateBudget(counts, 100.5, { [row.type]: { [j.judgement]: j.soloMax } }).pass,
          `${row.type} ${j.judgement}`,
        ).toBe(true)
        if (!j.soloAll) {
          expect(evaluateBudget(counts, 100.5, { [row.type]: { [j.judgement]: j.soloMax + 1 } }).pass).toBe(false)
        }
      }
    }
  })

  it('evaluates a mixed combination (hand-checked in the PR that added the budget)', () => {
    // 10 TAP GREAT + 1 HOLD GOOD + 4 BREAK 50落
    const result = evaluateBudget(counts, 100.5, { tap: { great: 10 }, hold: { good: 1 }, break: { perfect50: 4 } })
    // Base kept: 425,000 - 10·100 - 500 = 423,500 → 99.6470588%; bonus kept: 1 - 4·0.25/20 = 0.95%
    expect(result.achievement).toBe(100.597)
    expect(result.usedLoss).toBeCloseTo(10 * (100 / 4250) + 500 / 4250 + 4 * 0.0125, 10)
    expect(result.remainingLoss).toBeCloseTo(0.5 - result.usedLoss, 10)
    expect(result.pass).toBe(true)
    expect(calculateAchievement(counts, { great: { tap: 10 }, good: { hold: 1 }, break: { perfect50: 4 } })).toBe(
      100.597,
    )
  })

  it('fails a combination that each judgement alone would pass', () => {
    // 21 TAP GREAT alone passes; adding one 100落 tips it over
    expect(evaluateBudget(counts, 100.5, { tap: { great: 21 } }).pass).toBe(true)
    const both = evaluateBudget(counts, 100.5, { tap: { great: 21 }, break: { perfect100: 1 } })
    expect(both.pass).toBe(false)
    expect(both.remainingLoss).toBeLessThan(0)
  })

  it('handles a chart without BREAKs and the 101% target', () => {
    const noBreak = calculateToleranceBudget({ ...counts, break: 0 }, 100.5)
    expect(noBreak.rows.some((row) => row.type === 'break')).toBe(false)
    const perfect = calculateToleranceBudget(counts, 101)
    expect(perfect.inTapGreats).toBe(0)
    expect(byJudgement(perfect, 'break', 'perfect50')).toMatchObject({ soloMax: 0, soloAll: false })
  })
})