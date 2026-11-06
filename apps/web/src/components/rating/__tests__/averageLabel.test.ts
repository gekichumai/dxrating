import { describe, expect, it } from 'vitest'
import { AVERAGE_LABEL_GAP, estimateLabelWidth, placeAverageLabel } from '../averageLabel'

describe('placeAverageLabel', () => {
  it('puts the label right of the line when it fits', () => {
    expect(placeAverageLabel(50, 80, -25, 300)).toBe(50 + AVERAGE_LABEL_GAP)
  })

  it('flips the label left of the line when it would run past the right edge', () => {
    // The 320px case: a 285px-wide plot ending at 295, the line at 215 and an 84px label
    const x = placeAverageLabel(215, 84, -25, 295)
    expect(x).toBe(215 - AVERAGE_LABEL_GAP - 84)
    expect(x + 84).toBeLessThanOrEqual(295)
  })

  it('flips even below 70% of the width when the label is wide', () => {
    expect(placeAverageLabel(150, 160, -25, 295)).toBe(150 - AVERAGE_LABEL_GAP - 160)
  })

  it('clamps the label inside the bounds when it fits on neither side', () => {
    const x = placeAverageLabel(60, 150, -25, 160)
    expect(x).toBe(10)
    expect(x).toBeGreaterThanOrEqual(-25)
    expect(x + 150).toBeLessThanOrEqual(160)
  })

  it('keeps the start visible when the label is wider than the bounds', () => {
    expect(placeAverageLabel(100, 400, -25, 160)).toBe(-25)
  })
})

describe('estimateLabelWidth', () => {
  it('scales with the character count and font size', () => {
    expect(estimateLabelWidth('B15 AVG: 318.60', 12)).toBeGreaterThan(84)
    expect(estimateLabelWidth('', 12)).toBe(0)
  })
})