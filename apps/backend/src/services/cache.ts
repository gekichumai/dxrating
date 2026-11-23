import { Clock, Context, Effect, Layer } from 'effect'

/**
 * Responses of services outside our database, kept for a TTL. A select of our own tables is cached with Drizzle's
 * `.$withCache()` instead (db/query-cache.ts), whose writes invalidate it.
 */
export type ApplicationCacheKey = 'analytics:trending' | `net-status:${'intl' | 'jp'}`

export class ApplicationCache extends Context.Service<
  ApplicationCache,
  {
    readonly get: <A>(key: ApplicationCacheKey) => Effect.Effect<A | undefined>
    readonly set: (key: ApplicationCacheKey, value: unknown, ttlMs?: number) => Effect.Effect<void>
  }
>()('dxrating/ApplicationCache') {}

export const ApplicationCacheLive = Layer.sync(ApplicationCache, () => {
  const entries = new Map<ApplicationCacheKey, { value: unknown; expiresAt: number }>()
  return {
    get: <A>(key: ApplicationCacheKey) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const entry = entries.get(key)
        if (!entry) return undefined
        if (entry.expiresAt <= now) {
          entries.delete(key)
          return undefined
        }
        return entry.value as A
      }),
    set: (key, value, ttlMs = 30 * 60 * 1000) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        entries.set(key, { value, expiresAt: now + ttlMs })
      }),
  }
})