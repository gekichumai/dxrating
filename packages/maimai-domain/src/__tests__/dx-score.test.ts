import { describe, expect, it } from 'vitest'
import { dxScoreProgress, dxScoreStarBorder, dxScoreStarCount } from '../dx-score'

describe('dxScoreStarBorder', () => {
  it('rounds each share of the maximum up to a whole score', () => {
    // 823 notes → max 2469
    expect(dxScoreStarBorder(2469, 1)).toBe(2099) // 2098.65
    expect(dxScoreStarBorder(2469, 3)).toBe(2297) // 2296.17
    expect(dxScoreStarBorder(2469, 5)).toBe(2395) // 2394.93
  })

  it('keeps exact borders exact', () => {
    expect(dxScoreStarBorder(3000, 3)).toBe(2790)
    expect(dxScoreStarCount(2790, 3000)).toBe(3)
    expect(dxScoreStarCount(2789, 3000)).toBe(2)
  })
})

describe('dxScoreProgress', () => {
  it('reports the truncated percent, the stars and the distance to the next star', () => {
    expect(dxScoreProgress(2332, 2469)).toEqual({
      dxScore: 2332,
      max: 2469,
      percent: 94.45,
      stars: 3,
      next: { stars: 4, border: 2346, remaining: 14 },
    })
  })

  it('has no next star at ✦5', () => {
    expect(dxScoreProgress(2469, 2469)).toMatchObject({ percent: 100, stars: 5, next: null })
    expect(dxScoreProgress(2395, 2469)).toMatchObject({ stars: 5, next: null })
  })

  it('counts from zero below ✦1', () => {
    expect(dxScoreProgress(0, 300)).toMatchObject({
      percent: 0,
      stars: 0,
      next: { stars: 1, border: 255, remaining: 255 },
    })
  })

  it('is null without a score or a maximum', () => {
    expect(dxScoreProgress(undefined, 300)).toBeNull()
    expect(dxScoreProgress(null, 300)).toBeNull()
    expect(dxScoreProgress(100, null)).toBeNull()
    expect(dxScoreProgress(100, 0)).toBeNull()
  })
})