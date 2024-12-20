import { describe, expect, it } from 'vitest'
import { calculateScoreTable, NoteCounts } from './scores'

describe('calculateScoreTable', () => {
  it('should calculate score table for 系さて ReMaster pattern', () => {
    const noteCounts: NoteCounts = {
      tap: 1100,
      hold: 40,
      slide: 70,
      touch: 90,
      break: 100,
      total: 1400,
    }

    const result = calculateScoreTable(noteCounts)
    expect(result).not.toBeNull()

    if (!result) return

    // Test TAP scores (comparing relative percentages)
    expect(result.tap.criticalPerfect).toBeCloseTo(0.0505051, 4)
    expect(result.tap.great).toBeCloseTo(0.040404, 4)
    expect(result.tap.good).toBeCloseTo(0.0252525, 4)
    expect(result.tap.miss).toBe(0)

    // Test HOLD scores
    expect(result.hold.criticalPerfect).toBeCloseTo(0.1010101, 4)
    expect(result.hold.great).toBeCloseTo(0.0808081, 4)
    expect(result.hold.good).toBeCloseTo(0.0505051, 4)
    expect(result.hold.miss).toBe(0)

    // Test SLIDE scores
    expect(result.slide.criticalPerfect).toBeCloseTo(0.1515152, 4)
    expect(result.slide.great).toBeCloseTo(0.1212121, 4)
    expect(result.slide.good).toBeCloseTo(0.0757576, 4)
    expect(result.slide.miss).toBe(0)

    // Test BREAK scores
    expect(result.break.criticalPerfect).toBeCloseTo(0.2625253, 4)
    expect(result.break.perfect).toBeCloseTo(0.2600253, 4)
    expect(result.break.perfect2nd).toBeCloseTo(0.2575253, 4)
    expect(result.break.great).toBeCloseTo(0.2060202, 4)
    expect(result.break.great2nd).toBeCloseTo(0.1555152, 4)
    expect(result.break.great3rd).toBeCloseTo(0.1302626, 4)
    expect(result.break.good).toBeCloseTo(0.1040101, 4)
    expect(result.break.miss).toBe(0)
  })

  it('should return null for invalid note counts', () => {
    const invalidNoteCounts: NoteCounts = {
      tap: null,
      hold: 40,
      slide: 70,
      touch: 90,
      break: 100,
      total: 1400,
    }

    const result = calculateScoreTable(invalidNoteCounts)
    expect(result).toBeNull()
  })

  it('should handle zero notes correctly', () => {
    const zeroNoteCounts: NoteCounts = {
      tap: 0,
      hold: 0,
      slide: 0,
      touch: 0,
      break: 0,
      total: 0,
    }

    const result = calculateScoreTable(zeroNoteCounts)
    expect(result).not.toBeNull()
  })
})
