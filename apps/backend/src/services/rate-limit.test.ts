import { describe, expect, it } from 'vitest'
import { CLOUD_SAVE_RATE_LIMITS, createKeyedRateLimit, createRateLimiter } from './rate-limit'

describe('rate limits', () => {
  it('counts every take of the single-window limiter, past the limit too (MCP behaviour)', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 })
    expect(limiter.take('a', 0)).toBe(0)
    expect(limiter.take('a', 1_000)).toBe(0)
    expect(limiter.take('a', 2_000)).toBe(58)
    expect(limiter.take('b', 2_000)).toBe(0)
    expect(limiter.take('a', 60_000)).toBe(0)
  })

  it('checks and consumes without counting rejected requests', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 10_000 })
    expect(limiter.check('a', 3, 0)).toBe(0)
    limiter.consume('a', 3, 0)
    expect(limiter.check('a', 1, 500)).toBe(10)
    expect(limiter.check('a', 1, 10_000)).toBe(0)
  })

  it('combines windows and only counts requests every window allows', () => {
    const limit = createKeyedRateLimit([
      { limit: 2, windowMs: 1_000 },
      { limit: 3, windowMs: 60_000 },
    ])
    expect(limit.take('u', 1, 0)).toBe(0)
    expect(limit.take('u', 1, 0)).toBe(0)
    expect(limit.take('u', 1, 10)).toBe(1) // per-second window full
    expect(limit.take('u', 1, 1_000)).toBe(0) // the rejected request was not counted in the minute
    expect(limit.take('u', 1, 2_000)).toBe(58)
    expect(limit.take('other', 1, 2_000)).toBe(0)
  })

  it('weighs requests by cost', () => {
    const items = createKeyedRateLimit([{ limit: 1000, windowMs: 60_000 }])
    expect(items.take('u', 600, 0)).toBe(0)
    expect(items.take('u', 500, 0)).toBe(60)
    expect(items.take('u', 400, 0)).toBe(0)
  })

  it('gives back a refunded request while its window lasts', () => {
    const limit = createKeyedRateLimit([
      { limit: 2, windowMs: 1_000 },
      { limit: 3, windowMs: 60_000 },
    ])
    expect(limit.take('u', 1, 0)).toBe(0)
    expect(limit.take('u', 1, 0)).toBe(0)
    limit.refund('u', 1, 0, 10)
    expect(limit.take('u', 1, 20)).toBe(0)
    expect(limit.take('u', 1, 30)).toBe(1)
    // each window gives back only units it still holds: the second (0-1000) has ended, the minute has not
    limit.refund('u', 2, 0, 1_500)
    expect(limit.take('u', 1, 1_500)).toBe(0)
    expect(limit.take('u', 1, 1_600)).toBe(0)
    expect(limit.take('u', 1, 1_700)).toBe(1)
    expect(limit.take('u', 1, 2_500)).toBe(0)
    expect(limit.take('u', 1, 3_000)).toBe(57) // the minute: 0 after the refund, then 3
    limit.refund('nobody', 5, 0, 0)
    expect(limit.take('nobody', 1, 0)).toBe(0)
  })

  it('applies the design §11.4 numbers', () => {
    expect(CLOUD_SAVE_RATE_LIMITS.mutations).toEqual([{ limit: 120, windowMs: 60_000 }])
    expect(CLOUD_SAVE_RATE_LIMITS.mutationItems).toEqual([{ limit: 50_000, windowMs: 86_400_000 }])
    expect(CLOUD_SAVE_RATE_LIMITS.changes).toEqual([{ limit: 120, windowMs: 60_000 }])
    expect(CLOUD_SAVE_RATE_LIMITS.createSave).toEqual([{ limit: 20, windowMs: 86_400_000 }])
    expect(CLOUD_SAVE_RATE_LIMITS.replace).toEqual([{ limit: 5, windowMs: 86_400_000 }])
    expect(CLOUD_SAVE_RATE_LIMITS.export).toEqual([{ limit: 5, windowMs: 86_400_000 }])
    expect(CLOUD_SAVE_RATE_LIMITS.clientImports).toEqual([{ limit: 10, windowMs: 3_600_000 }])
    expect(CLOUD_SAVE_RATE_LIMITS.serverImports).toEqual([{ limit: 12, windowMs: 3_600_000 }])
  })
})