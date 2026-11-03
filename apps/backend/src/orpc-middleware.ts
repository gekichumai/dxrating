import { ORPCError, os, type ORPCErrorConstructorMap, type ProcedureHandlerOptions } from '@orpc/server'
import { handlerGen } from '@orpc/experimental-effect'
import { Effect } from 'effect'
import type { ApiContext } from './router'
import { FeatureFlags, type FeatureFlag } from './services/feature-flags'
import type { KeyedRateLimit } from './services/rate-limit'

export type SessionUser = NonNullable<ApiContext['user']>
export type SessionApiContext = ApiContext & { user: SessionUser }

/** Rejects requests without a session with 401 and narrows `context.user`. */
export const requireSession = os.$context<ApiContext>().middleware(({ context, next }) => {
  const user = context.user
  if (!user) throw new ORPCError('UNAUTHORIZED')
  return next({ context: { user } })
})

// The guard runs as an Effect handler (application services, request
// supervision and spans) and settles before the rest of the chain starts, so
// the chain's own failures reach oRPC untouched.
const featureGuard = (flag: FeatureFlag) =>
  handlerGen(function* ({
    context,
  }: ProcedureHandlerOptions<SessionApiContext, unknown, ORPCErrorConstructorMap<Record<never, never>>>) {
    const featureFlags = yield* FeatureFlags
    if (!(yield* featureFlags.isEnabled(flag, context.user.id))) {
      return yield* Effect.fail(new ORPCError('NOT_FOUND'))
    }
  })

/**
 * Answers 404 NOT_FOUND while `flag` is off for the signed-in user, so a
 * disabled feature looks like a route that does not exist. Use after
 * `requireSession`.
 */
export const requireFeature = (flag: FeatureFlag) => {
  const guard = featureGuard(flag)
  return os.$context<SessionApiContext>().middleware(async (options, input) => {
    await guard({ ...options, input }, input)
    return options.next()
  })
}
/**
 * Rate limits the signed-in user (design §11.4): 429 TOO_MANY_REQUESTS with `{ retryAfterSeconds }` and a
 * `Retry-After` header once `limit` is exhausted. `cost` counts a request as several units (e.g. the mutations of a
 * batch). Use after `requireSession` and `requireFeature`, so a disabled feature stays a 404.
 */
export const rateLimit = <TInput = unknown>(limit: KeyedRateLimit, cost?: (input: TInput) => number) =>
  os.$context<SessionApiContext>().middleware(({ context, next }, input: TInput) => {
    const retryAfterSeconds = limit.take(context.user.id, cost ? cost(input) : 1)
    if (retryAfterSeconds > 0) {
      context.resHeaders?.set('Retry-After', String(retryAfterSeconds))
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: `Too many requests. Retry in ${retryAfterSeconds} seconds.`,
        data: { retryAfterSeconds },
      })
    }
    return next()
  })
const RETRY_AFTER_BUSY_SECONDS = 1

/**
 * Lets each signed-in user run at most `limit` requests through the routes that use it at a time: one more answers
 * 429 TOO_MANY_REQUESTS (`Retry-After: 1`) instead of queueing on a database connection. Also sets `Retry-After` on
 * any TOO_MANY_REQUESTS the procedure itself fails with (`{ retryAfterSeconds }`). Use after `rateLimit`.
 */
export const writeConcurrency = (limit: number) => {
  const inFlight = new Map<string, number>()
  return os.$context<SessionApiContext>().middleware(async ({ context, next }) => {
    const key = context.user.id
    const running = inFlight.get(key) ?? 0
    if (running >= limit) {
      context.resHeaders?.set('Retry-After', String(RETRY_AFTER_BUSY_SECONDS))
      throw new ORPCError('TOO_MANY_REQUESTS', {
        message: `Too many requests. Retry in ${RETRY_AFTER_BUSY_SECONDS} seconds.`,
        data: { retryAfterSeconds: RETRY_AFTER_BUSY_SECONDS },
      })
    }
    inFlight.set(key, running + 1)
    try {
      return await next()
    } catch (error) {
      if (error instanceof ORPCError && error.code === 'TOO_MANY_REQUESTS') {
        const seconds = (error.data as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds
        if (typeof seconds === 'number') context.resHeaders?.set('Retry-After', String(seconds))
      }
      throw error
    } finally {
      const left = (inFlight.get(key) ?? 1) - 1
      if (left > 0) inFlight.set(key, left)
      else inFlight.delete(key)
    }
  })
}