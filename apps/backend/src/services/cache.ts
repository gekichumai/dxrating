import { Clock, Context, Effect, Layer } from 'effect'

export class ApplicationCache extends Context.Service<
  ApplicationCache,
  {
    readonly get: (key: string) => Effect.Effect<unknown>
    readonly set: (key: string, value: unknown, ttlMs?: number) => Effect.Effect<void>
    readonly delete: (key: string) => Effect.Effect<void>
  }
>()('dxrating/ApplicationCache') {}

export const ApplicationCacheLive = Layer.sync(ApplicationCache, () => {
  const entries = new Map<string, { value: unknown; expiresAt: number }>()
  return {
    get: (key: string) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const entry = entries.get(key)
        if (entry === undefined || entry === null) return undefined
        if (entry.expiresAt <= now) {
          entries.delete(key)
          return undefined
        }
        return entry.value
      }),
    set: (key, value, ttlMs = 30 * 60 * 1000) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        entries.set(key, { value, expiresAt: now + ttlMs })
      }),
    delete: (key) =>
      Effect.sync(() => {
        entries.delete(key)
      }),
  }
})