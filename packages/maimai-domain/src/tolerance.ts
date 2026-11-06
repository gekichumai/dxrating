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
/*
 * Budget view of the tolerance: one achievement margin (`101 - target`), spent by judgements. Every judgement has a
 * fixed price on a given chart, expressed in % and as an exchange rate against one TAP GREAT, the unit players count in.
 * A combination passes while its total price fits the margin; that is the same as the game's truncated achievement
 * reaching the target, because the target has at most four decimals.
 */

export type RegularJudgement = 'great' | 'good' | 'miss'
/** BREAK judgements a player can count off a result screen. GREAT is priced at its lowest tier (1250), see below. */
export type BreakBudgetJudgement = 'perfect50' | 'perfect100' | 'great' | 'good' | 'miss'
export type RegularNoteType = Exclude<ToleranceNoteType, 'break'>

export const REGULAR_JUDGEMENTS: readonly RegularJudgement[] = ['great', 'good', 'miss']
export const BREAK_BUDGET_JUDGEMENTS: readonly BreakBudgetJudgement[] = [
  'perfect50',
  'perfect100',
  'great',
  'good',
  'miss',
]
export const REGULAR_NOTE_TYPES: readonly RegularNoteType[] = ['tap', 'hold', 'slide', 'touch']

const REGULAR_KEPT: Record<RegularJudgement, number> = { great: 0.8, good: 0.5, miss: 0 }
/**
 * The result screen shows one BREAK GREAT count, not its tier (2000 / 1500 / 1250), so a BREAK GREAT is priced at the
 * lowest tier. The budget never says a combination passes when the game could say it fails.
 */
const BREAK_BUDGET_TIER: Record<BreakBudgetJudgement, BreakJudgement> = {
  perfect50: 'perfect50',
  perfect100: 'perfect100',
  great: 'great3',
  good: 'good',
  miss: 'miss',
}

/** Achievement (in %) one judgement costs on this chart */
export function judgementLoss(
  counts: ToleranceNoteCounts,
  type: ToleranceNoteType,
  judgement: RegularJudgement | BreakBudgetJudgement,
): number {
  const base = totalBaseScore(counts)
  if (base === 0) return 0
  if (type !== 'break') {
    const kept = REGULAR_KEPT[judgement as RegularJudgement]
    return ((NOTE_BASE_SCORE[type] * (1 - kept)) / base) * 100
  }
  if (counts.break === 0) return 0
  const tier = BREAK_BUDGET_TIER[judgement as BreakBudgetJudgement]
  return ((2500 - BREAK_BASE[tier]) / base) * 100 + (1 - BREAK_BONUS[tier]) / counts.break
}

export interface BudgetJudgement {
  judgement: RegularJudgement | BreakBudgetJudgement
  /** Achievement (in %) one of these costs */
  loss: number
  /** The same price in TAP GREATs */
  inTapGreats: number
  /** Most of these the margin allows when every other note is CRITICAL PERFECT, capped at the note count */
  soloMax: number
  /** The cap is the note count: every note of this type can get this judgement and the target still holds */
  soloAll: boolean
}

export interface BudgetRow {
  type: ToleranceNoteType
  count: number
  judgements: BudgetJudgement[]
}

export interface ToleranceBudget {
  target: number
  /** The margin: 101 - target, in % */
  allowedLoss: number
  /** One TAP GREAT, in %: the exchange unit */
  tapGreatLoss: number
  /** The margin in TAP GREATs (fractional) */
  inTapGreats: number
  rows: BudgetRow[]
  feasible: boolean
}

export function calculateToleranceBudget(counts: ToleranceNoteCounts, target: number): ToleranceBudget {
  const allowedLoss = Math.max(0, 101 - target)
  const tapGreatLoss = judgementLoss(counts, 'tap', 'great')
  const price = (type: ToleranceNoteType, judgement: RegularJudgement | BreakBudgetJudgement): BudgetJudgement => {
    const loss = judgementLoss(counts, type, judgement)
    const count = counts[type]
    const fit = loss > 0 ? Math.floor(allowedLoss / loss + EPSILON) : count
    const soloMax = Math.min(count, fit)
    return { judgement, loss, inTapGreats: tapGreatLoss > 0 ? loss / tapGreatLoss : 0, soloMax, soloAll: fit >= count }
  }
  const rows: BudgetRow[] = [
    ...REGULAR_NOTE_TYPES.filter((type) => counts[type] > 0).map((type) => ({
      type,
      count: counts[type],
      judgements: REGULAR_JUDGEMENTS.map((judgement) => price(type, judgement)),
    })),
    ...(counts.break > 0
      ? [
          {
            type: 'break' as const,
            count: counts.break,
            judgements: BREAK_BUDGET_JUDGEMENTS.map((j) => price('break', j)),
          },
        ]
      : []),
  ]
  return {
    target,
    allowedLoss,
    tapGreatLoss,
    inTapGreats: tapGreatLoss > 0 ? allowedLoss / tapGreatLoss : 0,
    rows,
    feasible: target <= 101 && totalBaseScore(counts) > 0,
  }
}

/** Judgement counts entered by the player, per note type; everything not listed is CRITICAL PERFECT */
export type BudgetPicks = Partial<
  Record<ToleranceNoteType, Partial<Record<RegularJudgement | BreakBudgetJudgement, number>>>
>

export interface BudgetEvaluation {
  /** Total price of the picks, in % */
  usedLoss: number
  /** Margin left (negative when over), in % */
  remainingLoss: number
  /** The game's achievement for the picks (truncated to four decimals) */
  achievement: number
  pass: boolean
}

export function evaluateBudget(counts: ToleranceNoteCounts, target: number, picks: BudgetPicks): BudgetEvaluation {
  const allowedLoss = Math.max(0, 101 - target)
  let usedLoss = 0
  const judgements: Judgements = { great: {}, good: {}, miss: {}, break: {} }
  for (const type of [...REGULAR_NOTE_TYPES, 'break'] as const) {
    for (const [judgement, n] of Object.entries(picks[type] ?? {}) as [
      RegularJudgement | BreakBudgetJudgement,
      number,
    ][]) {
      if (!n) continue
      usedLoss += n * judgementLoss(counts, type, judgement)
      if (type === 'break') {
        const tier = BREAK_BUDGET_TIER[judgement as BreakBudgetJudgement]
        judgements.break![tier as Exclude<BreakJudgement, 'criticalPerfect'>] = n
      } else {
        judgements[judgement as RegularJudgement]![type] = n
      }
    }
  }
  const achievement = calculateAchievement(counts, judgements)
  return { usedLoss, remainingLoss: allowedLoss - usedLoss, achievement, pass: achievement >= target - EPSILON }
}
/** Every judgement one note can get short of CRITICAL PERFECT; BREAK GREAT is split into its three grades */
export type PenaltyJudgement = RegularJudgement | Exclude<BreakJudgement, 'criticalPerfect'>

export const BREAK_PENALTY_JUDGEMENTS: readonly Exclude<BreakJudgement, 'criticalPerfect'>[] = [
  'perfect50',
  'perfect100',
  'great',
  'great2',
  'great3',
  'good',
  'miss',
]

export interface NotePenalty {
  type: ToleranceNoteType
  judgement: PenaltyJudgement
  /** BREAK GREAT grade, as its base score out of 2500 (2000 / 1500 / 1250); undefined elsewhere */
  breakBase?: number
  /** Achievement (in %) lost from the base score (the first 100%) */
  base: number
  /** Achievement (in %) lost from the BREAK bonus (the extra 1%); 0 for other note types */
  bonus: number
  /** base + bonus: what one such note costs, with every other note CRITICAL PERFECT */
  total: number
  /** total in TAP GREATs */
  inTapGreats: number
}

/**
 * What one note of each judgement costs on this chart. The base score splits 100% over the chart's weighted notes
 * (TAP and TOUCH 1, HOLD 2, SLIDE 3, BREAK 5, i.e. base score / 500); the BREAK bonus splits 1% evenly over its BREAKs.
 */
export function perNotePenalties(counts: ToleranceNoteCounts): NotePenalty[] {
  const baseTotal = totalBaseScore(counts)
  if (baseTotal === 0) return []
  const percent = (score: number) => (score / baseTotal) * 100
  const tapGreat = percent(NOTE_BASE_SCORE.tap * (1 - REGULAR_KEPT.great))
  const entry = (
    type: ToleranceNoteType,
    judgement: PenaltyJudgement,
    base: number,
    bonus: number,
    breakBase?: number,
  ): NotePenalty => ({
    type,
    judgement,
    ...(breakBase === undefined ? {} : { breakBase }),
    base,
    bonus,
    total: base + bonus,
    inTapGreats: (base + bonus) / tapGreat,
  })
  const regular = REGULAR_NOTE_TYPES.filter((type) => counts[type] > 0).flatMap((type) =>
    REGULAR_JUDGEMENTS.map((judgement) =>
      entry(type, judgement, percent(NOTE_BASE_SCORE[type] * (1 - REGULAR_KEPT[judgement])), 0),
    ),
  )
  const breaks =
    counts.break > 0
      ? BREAK_PENALTY_JUDGEMENTS.map((judgement) =>
          entry(
            'break',
            judgement,
            percent(NOTE_BASE_SCORE.break - BREAK_BASE[judgement]),
            (1 - BREAK_BONUS[judgement]) / counts.break,
            judgement.startsWith('great') ? BREAK_BASE[judgement] : undefined,
          ),
        )
      : []
  return [...regular, ...breaks]
}