// Recover BREAK judgement tiers from a per-type judgement table + displayed achievement.
//
// maimai DX NET's playlog detail page shows CP/PERFECT/GREAT/GOOD/MISS per note type, but BREAK
// PERFECT hides 2550/2500 and BREAK GREAT hides 2000/1500/1250. Those tiers change achievement,
// so they can be solved for. Weights match Diving-Fish's calculator and mai-tools.
// See meta: docs-zh/research/achievement-judgement-inverse.md

export type NoteType = 'tap' | 'hold' | 'slide' | 'touch' | 'break'

export interface JudgementRow {
  criticalPerfect: number
  perfect: number
  great: number
  good: number
  miss: number
}

export type JudgementTable = Record<Exclude<NoteType, 'touch'>, JudgementRow> & { touch: JudgementRow | null }

export interface BreakTierBreakdown {
  criticalPerfect: number
  perfect2550: number
  perfect2500: number
  great2000: number
  great1500: number
  great1250: number
  good: number
  miss: number
}

const BASE_SCORE: Record<NoteType, number> = { tap: 500, hold: 1000, slide: 1500, touch: 500, break: 2500 }

// regular notes: CP/PERFECT 100%, GREAT 80%, GOOD 50%, MISS 0
function regularScore(row: JudgementRow, base: number) {
  return (row.criticalPerfect + row.perfect) * base + row.great * base * 0.8 + row.good * base * 0.5
}

function rowTotal(row: JudgementRow) {
  return row.criticalPerfect + row.perfect + row.great + row.good + row.miss
}

// BREAK base score / bonus fraction (in 1/20ths) per tier
const BREAK_BASE: Record<keyof BreakTierBreakdown, number> = {
  criticalPerfect: 2500,
  perfect2550: 2500,
  perfect2500: 2500,
  great2000: 2000,
  great1500: 1500,
  great1250: 1250,
  good: 1000,
  miss: 0,
}
const BREAK_BONUS_20THS: Record<keyof BreakTierBreakdown, number> = {
  criticalPerfect: 20,
  perfect2550: 15,
  perfect2500: 10,
  great2000: 8,
  great1500: 8,
  great1250: 8,
  good: 6,
  miss: 0,
}

/**
 * Displayed achievement in 1/10000 % (100.4823% → 1004823), truncated to 4 decimals.
 * Exact integer math via BigInt; truncation (not rounding) is community consensus.
 */
export function computeAchievement(table: JudgementTable, breaks: BreakTierBreakdown): number {
  const rows = (['tap', 'hold', 'slide', 'touch'] as const).flatMap((t) => (table[t] ? [[t, table[t]!] as const] : []))
  const breakCount = rowTotal(table.break)
  let total = breakCount * BASE_SCORE.break
  // regular scores are multiples of 50 (×0.8 / ×0.5 of 500/1000/1500), so round() only strips float noise
  let earned = 0
  for (const [t, row] of rows) {
    total += rowTotal(row) * BASE_SCORE[t]
    earned += Math.round(regularScore(row, BASE_SCORE[t]))
  }
  let bonus20 = 0
  for (const k of Object.keys(BREAK_BASE) as (keyof BreakTierBreakdown)[]) {
    earned += breaks[k] * BREAK_BASE[k]
    bonus20 += breaks[k] * BREAK_BONUS_20THS[k]
  }
  if (total === 0) return 0
  // achievement*1e4 = 1e6 * earned/total + 1e4 * bonus20 / (20 * breakCount)
  // charts without BREAK: bonus treated as 0 (unverified; no such chart in current dxdata masters)
  const T = BigInt(total)
  const N = BigInt(Math.max(breakCount, 1))
  const num = 1_000_000n * BigInt(earned) * 20n * N + (breakCount ? 10_000n * BigInt(bonus20) * T : 0n)
  return Number(num / (20n * N * T))
}

/**
 * All BREAK tier splits consistent with the table and displayed achievement.
 * Usually exactly one; ~0.3% of plays give two (4-decimal truncation collisions). Empty means
 * the inputs are inconsistent (typo, wrong chart, or a scoring rule we don't model).
 */
export function solveBreakTiers(table: JudgementTable, achievement: number): BreakTierBreakdown[] {
  const b = table.break
  const out: BreakTierBreakdown[] = []
  for (let p2550 = 0; p2550 <= b.perfect; p2550++) {
    for (let g2000 = 0; g2000 <= b.great; g2000++) {
      for (let g1500 = 0; g2000 + g1500 <= b.great; g1500++) {
        const candidate: BreakTierBreakdown = {
          criticalPerfect: b.criticalPerfect,
          perfect2550: p2550,
          perfect2500: b.perfect - p2550,
          great2000: g2000,
          great1500: g1500,
          great1250: b.great - g2000 - g1500,
          good: b.good,
          miss: b.miss,
        }
        if (computeAchievement(table, candidate) === achievement) out.push(candidate)
      }
    }
  }
  return out
}

/**
 * Parse the cells of `.playlog_notes_detail` on maimai DX NET's playlog detail page.
 * Expects the 5 note rows (TAP, HOLD, SLIDE, TOUCH, BREAK) in order, each with 5 cells
 * (CP, PERFECT, GREAT, GOOD, MISS); a header row is skipped if present. STD charts leave TOUCH
 * cells blank, which yields `touch: null`.
 */
export function parseNotesDetailCells(rows: string[][]): JudgementTable {
  // header rows have no digits but are not all-blank (a blank row is STD TOUCH)
  const nonEmpty = rows.filter((cells) => cells.length >= 5 && !cells.some((c) => /[A-Za-z]/.test(c) && !/\d/.test(c)))
  if (nonEmpty.length !== 5) throw new Error(`expected 5 note rows, got ${nonEmpty.length}`)
  const parse = (cells: string[]): JudgementRow | null => {
    const nums = cells.slice(-5).map((c) => c.replace(/[^\d]/g, ''))
    if (nums.every((n) => n === '')) return null
    const [criticalPerfect, perfect, great, good, miss] = nums.map((n) => (n === '' ? 0 : Number.parseInt(n, 10)))
    return { criticalPerfect, perfect, great, good, miss }
  }
  const [tap, hold, slide, touch, brk] = nonEmpty.map(parse)
  const zero = { criticalPerfect: 0, perfect: 0, great: 0, good: 0, miss: 0 }
  return { tap: tap ?? zero, hold: hold ?? zero, slide: slide ?? zero, touch, break: brk ?? zero }
}

/** DOM helper: read `.playlog_notes_detail` table rows from a playlog detail document/element. */
export function extractNotesDetailCells(root: {
  querySelector(
    selector: string,
  ): {
    querySelectorAll(s: string): ArrayLike<{ querySelectorAll(s: string): ArrayLike<{ textContent: string | null }> }>
  } | null
}): string[][] {
  const table = root.querySelector('.playlog_notes_detail')
  if (!table) throw new Error('.playlog_notes_detail not found')
  return Array.from(table.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim() ?? ''),
  )
}