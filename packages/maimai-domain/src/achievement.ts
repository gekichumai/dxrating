/**
 * Achievement rates as integers in 1/10000 % (`100.5432%` → `1005432`), the canonical form for cloud saves,
 * the wire and every score comparison.
 *
 * Rounding is round-half-even on the exact decimal value, so `"97.12345"` → `971234` and `"97.12355"` → `971236`.
 * Numbers are converted through their shortest round-trip decimal string (`String(n)`), which is the decimal the
 * provider meant, so `97.12345` (a float from LXNS or Diving-Fish) gives the same integer as the string
 * `"97.12345"` and no binary-float error leaks into the result.
 */

/** 1/10000 % per 1 % */
export const ACHIEVEMENT_INT_SCALE = 10000
export const ACHIEVEMENT_INT_MIN = 0
/** 101.0000 % */
export const ACHIEVEMENT_INT_MAX = 1010000

const MAX_INPUT_LENGTH = 64
const MAX_EXPONENT = 400
const SCALE_DIGITS = 4
const DECIMAL_PATTERN = /^\+?(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i

/** Whether `value` is an integer achievement in `0..1010000` */
export function isAchievementInt(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= ACHIEVEMENT_INT_MIN && value <= ACHIEVEMENT_INT_MAX
  )
}

/**
 * Converts an achievement percentage to the integer form.
 *
 * Accepts a finite number (`100.5432`) or a decimal string as maimai NET shows it (`"100.5432%"`, `"100.5432"`,
 * surrounding whitespace allowed). Returns `null` (never clamps) when the input is not a non-negative decimal, or
 * when the rounded result falls outside `0..1010000`; callers turn that into an "invalid achievement" warning or a
 * `rejected` result.
 */
export function toAchievementInt(value: number | string): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    // `String` yields the shortest decimal that round-trips to `value` (possibly in exponent form, e.g. `1e-7`)
    return parseDecimalPercent(String(value))
  }
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  const withoutPercent = trimmed.endsWith('%') ? trimmed.slice(0, -1).trimEnd() : trimmed
  return parseDecimalPercent(withoutPercent)
}

/** The achievement percentage of an integer achievement (`1005432` → `100.5432`) */
export function fromAchievementInt(value: number): number {
  if (!Number.isInteger(value)) throw new RangeError(`Achievement must be an integer: ${String(value)}`)
  return value / ACHIEVEMENT_INT_SCALE
}

/** The exact decimal percentage of an integer achievement with four fraction digits (`1005432` → `"100.5432"`) */
export function formatAchievementInt(value: number): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`Achievement must be a non-negative integer: ${String(value)}`)
  }
  const digits = String(value).padStart(SCALE_DIGITS + 1, '0')
  return `${digits.slice(0, -SCALE_DIGITS)}.${digits.slice(-SCALE_DIGITS)}`
}

function parseDecimalPercent(text: string): number | null {
  if (text.length === 0 || text.length > MAX_INPUT_LENGTH) return null

  const matched = DECIMAL_PATTERN.exec(text)
  if (!matched) return null

  const integerDigits = matched[1] ?? ''
  const fractionDigits = matched[2] ?? ''
  if (integerDigits.length === 0 && fractionDigits.length === 0) return null

  const exponent = matched[3] === undefined ? 0 : Number(matched[3])
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_EXPONENT) return null

  // value = 0.<digits> × 10^pointPosition; scaling by 10^4 moves the point four places right
  const digits = integerDigits + fractionDigits
  const pointPosition = integerDigits.length + exponent + SCALE_DIGITS

  let wholeDigits: string
  let remainderDigits: string
  if (pointPosition <= 0) {
    wholeDigits = ''
    remainderDigits = '0'.repeat(-pointPosition) + digits
  } else if (pointPosition >= digits.length) {
    wholeDigits = digits + '0'.repeat(pointPosition - digits.length)
    remainderDigits = ''
  } else {
    wholeDigits = digits.slice(0, pointPosition)
    remainderDigits = digits.slice(pointPosition)
  }

  const significantWhole = wholeDigits.replace(/^0+/, '')
  // More than 7 digits can only be above 1010000; bail out before any precision concern
  if (significantWhole.length > 7) return null

  let whole = significantWhole.length === 0 ? 0 : Number(significantWhole)
  if (roundsUpHalfEven(remainderDigits, whole)) whole += 1

  return whole <= ACHIEVEMENT_INT_MAX ? whole : null
}

function roundsUpHalfEven(remainderDigits: string, whole: number): boolean {
  const first = remainderDigits.charCodeAt(0) - 48
  if (remainderDigits.length === 0 || first < 5) return false
  if (first > 5) return true
  if (/[1-9]/.test(remainderDigits.slice(1))) return true
  return whole % 2 === 1
}