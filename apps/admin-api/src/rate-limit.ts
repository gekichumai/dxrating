import { Clock, Context, Effect, Layer } from 'effect'

/** Fixed one-minute windows per key. In memory: one admin-api container, and a restart only resets the counters. */
export class RateLimiter extends Context.Service<
  RateLimiter,
  { readonly take: (key: string, limitPerMinute: number) => Effect.Effect<boolean> }
>()('dxrating-admin/RateLimiter') {}

export const RateLimiterLive = Layer.sync(RateLimiter, () => {
  const windows = new Map<string, { window: number; count: number }>()
  return {
    take: (key: string, limitPerMinute: number) =>
      Effect.map(Clock.currentTimeMillis, (now) => {
        const window = Math.floor(now / 60_000)
        const current = windows.get(key)
        const next = current && current.window === window ? { window, count: current.count + 1 } : { window, count: 1 }
        windows.set(key, next)
        if (windows.size > 10_000) windows.clear()
        return next.count <= limitPerMinute
      }),
  }
})