import { describe, expect, it } from 'vitest'
import { calculateRating } from '../rating'

describe('rating compatibility exports', () => {
  it('calculates known SSS+ rating through shared package', () => {
    expect(calculateRating(14.0, 100.5).ratingAwardValue).toBe(315)
  })
})