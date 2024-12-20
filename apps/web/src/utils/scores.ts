// Score tables for different note types
export const TapScore: readonly number[] = [0, 250, 400, 400, 400, 500, 500, 500]
export const HoldScore: readonly number[] = [0, 500, 800, 800, 800, 1000, 1000, 1000]
export const SlideScore: readonly number[] = [0, 750, 1200, 1200, 1200, 1500, 1500, 1500]
export const BreakScore: readonly number[] = [0, 1000, 1250, 1500, 2000, 2500, 2500, 2500]
export const BreakBonusScore: readonly number[] = [0, 30, 40, 40, 40, 50, 75, 100]

// Constants
const DEFAULT_SCORE_RATE = 100.0
const BREAK_BONUS_SCORE_RATE = 1.0

// Interfaces
export interface SubScoreTable {
  criticalPerfect: number
  perfect: number
  perfect2nd: number
  great: number
  great2nd: number
  great3rd: number
  good: number
  miss: number
}

export interface CalculatedScoreTable {
  tap: SubScoreTable
  hold: SubScoreTable
  slide: SubScoreTable
  touch: SubScoreTable
  break: SubScoreTable
  breakBonus: SubScoreTable
  count: number
}

export interface NoteCounts {
  tap: number | null
  hold: number | null
  slide: number | null
  touch: number | null
  break: number | null
  total: number | null
}

// Helper function to calculate individual score tables
function calcScore(rate: number, targetScore: readonly number[], total: number): SubScoreTable {
  // We need to multiply by 100 since rate is a percentage (100.0)
  const multiplier = rate / 100
  return {
    criticalPerfect: (targetScore[7] * multiplier) / total,
    perfect: (targetScore[6] * multiplier) / total,
    perfect2nd: (targetScore[5] * multiplier) / total,
    great: (targetScore[4] * multiplier) / total,
    great2nd: (targetScore[3] * multiplier) / total,
    great3rd: (targetScore[2] * multiplier) / total,
    good: (targetScore[1] * multiplier) / total,
    miss: (targetScore[0] * multiplier) / total,
  }
}

export function calculateScoreTable(noteCounts: NoteCounts): CalculatedScoreTable | null {
  // Check if any required note count is null
  if (
    noteCounts.tap === null ||
    noteCounts.hold === null ||
    noteCounts.slide === null ||
    noteCounts.break === null ||
    noteCounts.total === null
  ) {
    return null
  }

  const calculatedScoreTable: CalculatedScoreTable = {
    tap: calcScore(DEFAULT_SCORE_RATE, TapScore, noteCounts.tap * TapScore[7]),
    hold: calcScore(DEFAULT_SCORE_RATE, HoldScore, noteCounts.hold * HoldScore[7]),
    slide: calcScore(DEFAULT_SCORE_RATE, SlideScore, noteCounts.slide * SlideScore[7]),
    touch: calcScore(DEFAULT_SCORE_RATE, TapScore, (noteCounts.touch ?? 0) * TapScore[7]),
    break: calcScore(DEFAULT_SCORE_RATE, BreakScore, noteCounts.break * BreakScore[7]),
    breakBonus: calcScore(
      BREAK_BONUS_SCORE_RATE,
      BreakBonusScore,
      noteCounts.break * BreakBonusScore[7]
    ),
    count: noteCounts.total,
  }

  return calculatedScoreTable
}
