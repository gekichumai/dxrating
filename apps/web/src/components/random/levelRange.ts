/**
 * Internal-level ranges for the random chart page, in tenths (13.7 is 137) so 0.1 steps never drift.
 *
 * Level → internal level boundaries, as in dxdata.json (`packages/dxdata`): a plain level `N` covers N.0 to N.5 and
 * `N+` covers N.6 to N.9, for every chart from level 8 up. `levelRange.test.ts` checks this against the bundled
 * dxdata, so a data change that breaks the mapping fails the test instead of silently mislabelling a chip. 15 is the
 * top of the scale (no chart is above 15.0).
 */

export interface LevelRange {
  /** Inclusive, in tenths */
  min: number
  /** Inclusive, in tenths */
  max: number
}

/** The slider's floor while charts below 9 are folded away */
export const RANGE_FLOOR = 90
/** The floor once "show charts below 9" is on */
export const RANGE_FLOOR_EXTENDED = 10
export const RANGE_CEILING = 150

/** With no scores: the band most players roll in */
export const DEFAULT_LEVEL_RANGE: LevelRange = { min: 130, max: 140 }

export const LEVEL_CHIPS = ['10', '11', '12', '12+', '13', '13+', '14', '14+', '15'] as const
export type LevelChip = (typeof LEVEL_CHIPS)[number]

/** The internal levels a displayed level covers */
export function levelChipRange(chip: string): LevelRange {
  const plus = chip.endsWith('+')
  const base = Number.parseInt(chip, 10) * 10
  const range = plus ? { min: base + 6, max: base + 9 } : { min: base, max: base + 5 }
  return { min: clampTenths(range.min, RANGE_FLOOR_EXTENDED), max: clampTenths(range.max, RANGE_FLOOR_EXTENDED) }
}

/** The span covering both chips, in either order */
export function spanChips(a: string, b: string): LevelRange {
  const ra = levelChipRange(a)
  const rb = levelChipRange(b)
  return { min: Math.min(ra.min, rb.min), max: Math.max(ra.max, rb.max) }
}

/** `inside`: the chip's whole level is in the range; `partial`: only some of it */
export function chipCoverage(chip: string, range: LevelRange): 'inside' | 'partial' | 'none' {
  const chipRange = levelChipRange(chip)
  if (chipRange.min >= range.min && chipRange.max <= range.max) return 'inside'
  if (chipRange.max < range.min || chipRange.min > range.max) return 'none'
  return 'partial'
}

export const clampTenths = (value: number, floor: number = RANGE_FLOOR_EXTENDED) =>
  Math.min(RANGE_CEILING, Math.max(floor, Math.round(value)))

/** A range kept inside the scale with min ≤ max */
export function normalizeRange(range: LevelRange, floor: number = RANGE_FLOOR_EXTENDED): LevelRange {
  const min = clampTenths(range.min, floor)
  const max = clampTenths(range.max, floor)
  return min <= max ? { min, max } : { min: max, max: min }
}

/** Moves one end by `delta` tenths; that end stops at the other end instead of crossing it */
export function stepRange(range: LevelRange, end: 'min' | 'max', delta: number, floor: number): LevelRange {
  if (end === 'min') return { ...range, min: Math.min(range.max, clampTenths(range.min + delta, floor)) }
  return { ...range, max: Math.max(range.min, clampTenths(range.max + delta, floor)) }
}

export const isSameRange = (a: LevelRange, b: LevelRange) => a.min === b.min && a.max === b.max

export const formatTenths = (tenths: number) => (tenths / 10).toFixed(1)

export const toTenths = (level: number) => Math.round(level * 10)