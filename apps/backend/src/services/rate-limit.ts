/**
 * In-memory fixed-window rate limits, per key (a client address, a user ID). Each replica counts its own, which is
 * enough for one instance (design §11.4); the windows are forgotten on restart.
 */

export interface RateLimitWindow {
  /** Requests (or units of `cost`) allowed per window */
  readonly limit: number
  readonly windowMs: number
}

/**
 * One fixed window per key. `take` always counts the request, even past the limit (the MCP endpoint relies on this:
 * a client that keeps hammering stays limited until its window ends). `check` and `consume` let a caller combine
 * several windows without counting a request one of them rejects.
 */
export function createRateLimiter({ limit, windowMs }: RateLimitWindow) {
  const windows = new Map<string, { start: number; count: number }>()

  const current = (key: string, now: number) => {
    let window = windows.get(key)
    if (!window || now - window.start >= windowMs) {
      // forget the windows that ended, so the map holds the clients of the current window only
      if (windows.size > 10_000) {
        for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k)
      }
      window = { start: now, count: 0 }
      windows.set(key, window)
    }
    return window
  }

  const retryAfter = (window: { start: number }, now: number) =>
    Math.max(1, Math.ceil((window.start + windowMs - now) / 1000))

  return {
    /** Counts the request; the seconds to wait before retrying, or 0 when the request is allowed */
    take(key: string, now = Date.now()): number {
      const window = current(key, now)
      window.count += 1
      return window.count > limit ? Math.ceil((window.start + windowMs - now) / 1000) : 0
    },
    /** The seconds to wait before `cost` more units fit in the window, or 0; counts nothing */
    check(key: string, cost = 1, now = Date.now()): number {
      const window = current(key, now)
      return window.count + cost > limit ? retryAfter(window, now) : 0
    },
    /** Counts `cost` units */
    consume(key: string, cost = 1, now = Date.now()): void {
      current(key, now).count += cost
    },
    /**
     * Gives back `cost` units counted at `takenAt`, while the window they were counted in is still the current one
     * (a later window does not get them)
     */
    refund(key: string, cost: number, takenAt: number, now = Date.now()): void {
      const window = windows.get(key)
      if (!window || window.start > takenAt || now - window.start >= windowMs) return
      window.count = Math.max(0, window.count - cost)
    },
  }
}

export type RateLimiter = ReturnType<typeof createRateLimiter>

/**
 * Several windows for the same key (e.g. 6 an hour and 30 a day). A request is counted in every window only when
 * every window allows it; otherwise nothing is counted and the longest wait is returned.
 */
export function createKeyedRateLimit(windows: readonly RateLimitWindow[]) {
  const limiters = windows.map(createRateLimiter)
  return {
    /** The seconds to wait before retrying, or 0 when the request is allowed (and counted) */
    take(key: string, cost = 1, now = Date.now()): number {
      const wait = Math.max(0, ...limiters.map((limiter) => limiter.check(key, cost, now)))
      if (wait > 0) return wait
      for (const limiter of limiters) limiter.consume(key, cost, now)
      return 0
    },
    /** Gives back a request `take` allowed at `takenAt` (e.g. one turned away as busy, which did no work) */
    refund(key: string, cost: number, takenAt: number, now = Date.now()): void {
      for (const limiter of limiters) limiter.refund(key, cost, takenAt, now)
    },
  }
}

export type KeyedRateLimit = ReturnType<typeof createKeyedRateLimit>

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Cloud save limits per user (design §11.4). Routes the table does not list (save list/rename/delete, events,
 * snapshots, import job reads) share the `default` budget.
 */
export const CLOUD_SAVE_RATE_LIMITS = {
  default: [{ limit: 120, windowMs: MINUTE }],
  createSave: [{ limit: 20, windowMs: DAY }],
  changes: [{ limit: 120, windowMs: MINUTE }],
  /** Requests */
  mutations: [{ limit: 120, windowMs: MINUTE }],
  /** Mutations (items) across requests */
  mutationItems: [{ limit: 50_000, windowMs: DAY }],
  replace: [{ limit: 5, windowMs: DAY }],
  /** `client-imports` requests (chunks count one each) */
  clientImports: [{ limit: 10, windowMs: HOUR }],
  /** LXNS and Diving Fish imports together */
  serverImports: [{ limit: 12, windowMs: HOUR }],
  /** maimai NET imports per user (JP and intl together) */
  netImports: [
    { limit: 6, windowMs: HOUR },
    { limit: 30, windowMs: DAY },
  ],
  /** maimai NET imports per client address (keyed by address, not user) */
  netImportsByAddress: [{ limit: 30, windowMs: HOUR }],
  export: [{ limit: 5, windowMs: DAY }],
} as const satisfies Record<string, readonly RateLimitWindow[]>

export type CloudSaveRateLimitName = keyof typeof CLOUD_SAVE_RATE_LIMITS

/** One limiter per name, shared by every route that uses it */
export const cloudSaveRateLimits: Record<CloudSaveRateLimitName, KeyedRateLimit> = Object.fromEntries(
  Object.entries(CLOUD_SAVE_RATE_LIMITS).map(([name, windows]) => [name, createKeyedRateLimit(windows)]),
) as Record<CloudSaveRateLimitName, KeyedRateLimit>