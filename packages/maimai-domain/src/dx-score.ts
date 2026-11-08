/**
 * DX score ratio and stars.
 *
 * The game awards a DX score star at each share of the chart's maximum DX score (3 per note): ✦1 85%, ✦2 90%,
 * ✦3 93%, ✦4 95%, ✦5 97%. A border is the smallest whole score at or above that share, so it is computed in integers
 * (ceil(max × percent / 100)) rather than by comparing a floating-point ratio.
 */

export const DX_SCORE_STAR_PERCENTS = [85, 90, 93, 95, 97] as const

export type DxScoreStars = 0 | 1 | 2 | 3 | 4 | 5

/** The smallest DX score that earns `stars` stars on a chart whose maximum is `max` */
export function dxScoreStarBorder(max: number, stars: 1 | 2 | 3 | 4 | 5): number {
  return Math.ceil((max * DX_SCORE_STAR_PERCENTS[stars - 1]!) / 100)
}

export function dxScoreStarCount(dxScore: number, max: number): DxScoreStars {
  if (max <= 0) return 0
  let stars = 0
  for (let star = 1; star <= DX_SCORE_STAR_PERCENTS.length; star++) {
    if (dxScore >= dxScoreStarBorder(max, star as 1 | 2 | 3 | 4 | 5)) stars = star
  }
  return stars as DxScoreStars
}

export interface DxScoreProgress {
  dxScore: number
  max: number
  /** Share of the maximum in percent, truncated to two decimals (as the game truncates): 2332 / 2469 → 94.45 */
  percent: number
  stars: DxScoreStars
  /** The next star and how many DX score points it still needs; null at ✦5 */
  next: { stars: 1 | 2 | 3 | 4 | 5; border: number; remaining: number } | null
}

/** Ratio, stars and distance to the next star, or null when the score or the maximum is unknown */
export function dxScoreProgress(
  dxScore: number | null | undefined,
  max: number | null | undefined,
): DxScoreProgress | null {
  if (dxScore == null || !max || max <= 0 || dxScore < 0) return null
  const score = Math.min(dxScore, max)
  const stars = dxScoreStarCount(score, max)
  const percent = Math.floor((score * 10000) / max) / 100
  if (stars === 5) return { dxScore: score, max, percent, stars, next: null }
  const nextStars = (stars + 1) as 1 | 2 | 3 | 4 | 5
  const border = dxScoreStarBorder(max, nextStars)
  return { dxScore: score, max, percent, stars, next: { stars: nextStars, border, remaining: border - score } }
}