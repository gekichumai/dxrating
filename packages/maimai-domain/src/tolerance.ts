/**
 * 分数线 / tolerance: how many non-perfect judgements a chart allows for a target achievement.
 *
 * Standard maimai DX scoring (as used by Yuri-YuzuChaN/maimaiDX `分数线` and the Diving-Fish prober):
 * - Base score (the first 100%): TAP 500, HOLD 1000, SLIDE 1500, TOUCH 500, BREAK 2500 per note.
 *   GREAT keeps 80%, GOOD 50%, MISS 0% of a TAP / HOLD / SLIDE / TOUCH base. A BREAK GREAT keeps 2000 / 1500 /
 *   1250, GOOD 1000, MISS 0; every BREAK PERFECT keeps the full 2500.
 * - BREAK bonus (the extra 1%) is split evenly over the BREAKs: CRITICAL PERFECT 100%, PERFECT 75% ("50 落") or
 *   50% ("100 落"), GREAT 40%, GOOD 30%, MISS 0%.
 * The game truncates achievement to four decimals.
 */
import type { NoteCounts } from '@gekichumai/dxdata'

export type ToleranceNoteType = 'tap' | 'hold' | 'slide' | 'touch' | 'break'

export const NOTE_BASE_SCORE: Record<ToleranceNoteType, number> = {
  tap: 500,
  hold: 1000,
  slide: 1500,
  touch: 500,
  break: 2500,
}

export interface ToleranceNoteCounts {
  tap: number
  hold: number
  slide: number
  touch: number
  break: number
}

/** Normalises catalog note counts; null when the catalog lacks them */
export function toToleranceNoteCounts(noteCounts: NoteCounts | undefined): ToleranceNoteCounts | null {
  if (!noteCounts || noteCounts.tap === undefined || noteCounts.break === undefined) return null
  const counts = {
    tap: noteCounts.tap ?? 0,
    hold: noteCounts.hold ?? 0,
    slide: noteCounts.slide ?? 0,
    touch: noteCounts.touch ?? 0,
    break: noteCounts.break ?? 0,
  }
  return Object.values(counts).some((value) => value === null || Number.isNaN(value)) ? null : counts
}

export function totalBaseScore(counts: ToleranceNoteCounts): number {
  return (Object.keys(NOTE_BASE_SCORE) as ToleranceNoteType[]).reduce(
    (sum, type) => sum + counts[type] * NOTE_BASE_SCORE[type],
    0,
  )
}

export interface ToleranceResult {
  target: number
  /** Achievement (in %) that may be lost: 101 - target */
  allowedLoss: number
  /** Achievement lost by one TAP GREAT / GOOD / MISS */
  tapGreatLoss: number
  tapGoodLoss: number
  tapMissLoss: number
  /** Achievement lost by one BREAK PERFECT 50 / 100 落 */
  break50Loss: number
  break100Loss: number
  maxTapGreat: number
  maxTapGood: number
  maxTapMiss: number
  /** Capped at the BREAK count */
  maxBreak50: number
  maxBreak100: number
  /** How many BREAK 50 落 cost as much as one TAP GREAT */
  break50PerTapGreat: number
  feasible: boolean
}

const EPSILON = 1e-9

export function calculateTolerance(counts: ToleranceNoteCounts, target: number): ToleranceResult {
  const base = totalBaseScore(counts)
  const allowedLoss = Math.max(0, 101 - target)
  const perBaseUnit = base > 0 ? 100 / base : 0
  const bonusPerBreak = counts.break > 0 ? 1 / counts.break : 0
  const tapGreatLoss = 100 * perBaseUnit
  const tapGoodLoss = 250 * perBaseUnit
  const tapMissLoss = 500 * perBaseUnit
  const break50Loss = 0.25 * bonusPerBreak
  const break100Loss = 0.5 * bonusPerBreak
  const count = (loss: number) => (loss > 0 ? Math.floor(allowedLoss / loss + EPSILON) : 0)
  return {
    target,
    allowedLoss,
    tapGreatLoss,
    tapGoodLoss,
    tapMissLoss,
    break50Loss,
    break100Loss,
    maxTapGreat: count(tapGreatLoss),
    maxTapGood: count(tapGoodLoss),
    maxTapMiss: count(tapMissLoss),
    maxBreak50: Math.min(counts.break, count(break50Loss)),
    maxBreak100: Math.min(counts.break, count(break100Loss)),
    break50PerTapGreat: break50Loss > 0 ? tapGreatLoss / break50Loss : 0,
    feasible: target <= 101 && base > 0,
  }
}

export type BreakJudgement =
  | 'criticalPerfect'
  | 'perfect50'
  | 'perfect100'
  | 'great'
  | 'great2'
  | 'great3'
  | 'good'
  | 'miss'

const BREAK_BASE: Record<BreakJudgement, number> = {
  criticalPerfect: 2500,
  perfect50: 2500,
  perfect100: 2500,
  great: 2000,
  great2: 1500,
  great3: 1250,
  good: 1000,
  miss: 0,
}
const BREAK_BONUS: Record<BreakJudgement, number> = {
  criticalPerfect: 1,
  perfect50: 0.75,
  perfect100: 0.5,
  great: 0.4,
  great2: 0.4,
  great3: 0.4,
  good: 0.3,
  miss: 0,
}

export interface Judgements {
  /** GREAT / GOOD / MISS per non-BREAK type; everything else is PERFECT */
  great?: Partial<Record<Exclude<ToleranceNoteType, 'break'>, number>>
  good?: Partial<Record<Exclude<ToleranceNoteType, 'break'>, number>>
  miss?: Partial<Record<Exclude<ToleranceNoteType, 'break'>, number>>
  /** Non-CRITICAL BREAK judgements; the rest are CRITICAL PERFECT */
  break?: Partial<Record<Exclude<BreakJudgement, 'criticalPerfect'>, number>>
}

/** Achievement (in %, truncated to four decimals) for a judgement breakdown */
export function calculateAchievement(counts: ToleranceNoteCounts, judgements: Judgements = {}): number {
  const base = totalBaseScore(counts)
  if (base === 0) return 0
  let lost = 0
  for (const type of ['tap', 'hold', 'slide', 'touch'] as const) {
    lost += (judgements.great?.[type] ?? 0) * NOTE_BASE_SCORE[type] * 0.2
    lost += (judgements.good?.[type] ?? 0) * NOTE_BASE_SCORE[type] * 0.5
    lost += (judgements.miss?.[type] ?? 0) * NOTE_BASE_SCORE[type]
  }
  let bonusLost = 0
  for (const [judgement, n] of Object.entries(judgements.break ?? {}) as [BreakJudgement, number][]) {
    lost += n * (2500 - BREAK_BASE[judgement])
    bonusLost += n * (1 - BREAK_BONUS[judgement])
  }
  const bonus = counts.break > 0 ? 1 - bonusLost / counts.break : 1
  const raw = ((base - lost) / base) * 100 + bonus
  return Math.floor(raw * 10000 + EPSILON) / 10000
}