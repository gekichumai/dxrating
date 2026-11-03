import { describe, expect, it } from 'vitest'
import vectors from '../../test-vectors/achievement.json'
import {
  ACHIEVEMENT_INT_MAX,
  formatAchievementInt,
  fromAchievementInt,
  isAchievementInt,
  toAchievementInt,
} from '../achievement'

describe('toAchievementInt', () => {
  it.each(vectors.toAchievementInt.map((vector) => [JSON.stringify(vector.input), vector] as const))(
    'vector %s',
    (_label, vector) => {
      expect(toAchievementInt(vector.input)).toBe(vector.expected)
    },
  )

  it('rejects non-finite numbers', () => {
    expect(toAchievementInt(Number.NaN)).toBeNull()
    expect(toAchievementInt(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('rejects overlong strings', () => {
    expect(toAchievementInt(`100.${'0'.repeat(100)}`)).toBeNull()
  })

  it('round-trips every integer achievement through its percentage', () => {
    const failures: number[] = []
    for (let value = 0; value <= ACHIEVEMENT_INT_MAX; value++) {
      if (toAchievementInt(fromAchievementInt(value)) !== value) failures.push(value)
      if (toAchievementInt(formatAchievementInt(value)) !== value) failures.push(value)
    }
    expect(failures).toEqual([])
  })
})

describe('fromAchievementInt / formatAchievementInt', () => {
  it.each(vectors.fromAchievementInt.map((vector) => [vector.input, vector] as const))(
    'vector %s',
    (_label, vector) => {
      expect(fromAchievementInt(vector.input)).toBe(vector.percent)
      expect(formatAchievementInt(vector.input)).toBe(vector.formatted)
    },
  )

  it('throws on fractional input', () => {
    expect(() => fromAchievementInt(1.5)).toThrow(RangeError)
    expect(() => formatAchievementInt(-1)).toThrow(RangeError)
  })
})

describe('isAchievementInt', () => {
  it('accepts integers in range only', () => {
    expect(isAchievementInt(0)).toBe(true)
    expect(isAchievementInt(1010000)).toBe(true)
    expect(isAchievementInt(1010001)).toBe(false)
    expect(isAchievementInt(-1)).toBe(false)
    expect(isAchievementInt(1.5)).toBe(false)
    expect(isAchievementInt('1')).toBe(false)
  })
})