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
/**
 * A judgement the tolerance builder lets you spend. For a BREAK, GREAT is counted as the lowest BREAK GREAT (1250 base),
 * so a combination that passes here also passes with any BREAK GREAT, and the two PERFECTs below CRITICAL are 50 / 100
 * 落ち. Other note types only have GREAT / GOOD / MISS: their CRITICAL PERFECT and PERFECT score the same.
 */
export type ToleranceJudgement = 'great' | 'good' | 'miss' | 'perfect50' | 'perfect100'

export const NOTE_TYPES: readonly ToleranceNoteType[] = ['tap', 'hold', 'slide', 'touch', 'break']

export function judgementsFor(type: ToleranceNoteType): readonly ToleranceJudgement[] {
  return type === 'break' ? ['great', 'good', 'miss', 'perfect50', 'perfect100'] : ['great', 'good', 'miss']
}

const BREAK_JUDGEMENT: Record<ToleranceJudgement, Exclude<BreakJudgement, 'criticalPerfect'>> = {
  great: 'great3',
  good: 'good',
  miss: 'miss',
  perfect50: 'perfect50',
  perfect100: 'perfect100',
}

const NON_BREAK_KEEP: Partial<Record<ToleranceJudgement, number>> = { great: 0.8, good: 0.5, miss: 0 }

/** Achievement (in %, before truncation) lost by one such judgement, with every other note CRITICAL PERFECT */
export function judgementLoss(counts: ToleranceNoteCounts, type: ToleranceNoteType, judgement: ToleranceJudgement) {
  const base = totalBaseScore(counts)
  if (base === 0) return 0
  if (type !== 'break') {
    const keep = NON_BREAK_KEEP[judgement]
    return keep === undefined ? 0 : ((NOTE_BASE_SCORE[type] * (1 - keep)) / base) * 100
  }
  if (counts.break === 0) return 0
  const breakJudgement = BREAK_JUDGEMENT[judgement]
  return ((2500 - BREAK_BASE[breakJudgement]) / base) * 100 + (1 - BREAK_BONUS[breakJudgement]) / counts.break
}

/** Non-perfect judgements per note type; everything not listed is CRITICAL PERFECT */
export type ToleranceCombination = Partial<Record<ToleranceNoteType, Partial<Record<ToleranceJudgement, number>>>>

export function combinationToJudgements(combination: ToleranceCombination): Judgements {
  const judgements: Required<Judgements> = { great: {}, good: {}, miss: {}, break: {} }
  for (const type of NOTE_TYPES) {
    for (const judgement of judgementsFor(type)) {
      const n = combination[type]?.[judgement] ?? 0
      if (n <= 0) continue
      if (type === 'break') {
        const key = BREAK_JUDGEMENT[judgement]
        judgements.break[key] = (judgements.break[key] ?? 0) + n
      } else {
        judgements[judgement as 'great' | 'good' | 'miss'][type] = n
      }
    }
  }
  return judgements
}

/** How many of a note type the combination already spends */
export function combinationUsed(combination: ToleranceCombination, type: ToleranceNoteType): number {
  return Object.values(combination[type] ?? {}).reduce((sum, n) => sum + (n ?? 0), 0)
}

export interface CombinationResult {
  /** Achievement the game would show (truncated to four decimals) */
  achievement: number
  passes: boolean
  /** Achievement left above the target (from the shown achievement); negative when the combination falls short */
  remaining: number
  /** TAP GREATs that still fit on top of the combination; 0 when it falls short */
  remainingTapGreats: number
  /** Share of the margin (101 − target) the combination spends, clamped to 0..1 */
  usedShare: number
}

export function evaluateCombination(
  counts: ToleranceNoteCounts,
  target: number,
  combination: ToleranceCombination,
): CombinationResult {
  const achievement = calculateAchievement(counts, combinationToJudgements(combination))
  const margin = Math.max(0, 101 - target)
  let spent = 0
  for (const type of NOTE_TYPES) {
    for (const judgement of judgementsFor(type)) {
      spent += (combination[type]?.[judgement] ?? 0) * judgementLoss(counts, type, judgement)
    }
  }
  const tapGreat = judgementLoss(counts, 'tap', 'great')
  const left = margin - spent
  const passes = achievement >= target
  return {
    achievement,
    passes,
    remaining: Math.round((achievement - target) * 10000) / 10000,
    remainingTapGreats: passes && tapGreat > 0 ? Math.max(0, Math.floor(left / tapGreat + EPSILON)) : 0,
    usedShare: margin > 0 ? Math.min(1, Math.max(0, spent / margin)) : spent > 0 ? 1 : 0,
  }
}