import { Cause, Data } from 'effect'
import { isSqlError } from 'effect/sql/SqlError'

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly operation: string
  readonly cause: unknown
}> {}

/**
 * Sentry tags of a database failure: which operation failed and the SQL error reason (`ConnectionError`,
 * `StatementTimeoutError`, ...) found down its cause chain. Neither carries query text or parameters. Drizzle's
 * `EffectDrizzleQueryError` holds the `SqlError` inside an Effect `Cause`, which the chain unwraps.
 *
 * `buildSentryOptions` applies these to every event, so every capture path (oRPC, Hono routes, the global error
 * handler, background jobs) tags its database failures the same way.
 */
export const databaseErrorTags = (error: unknown): Record<string, string> => {
  if (!(error instanceof DatabaseError)) return {}
  const tags: Record<string, string> = { 'db.operation': error.operation }
  let cause: unknown = error.cause
  for (let depth = 0; depth < 5 && cause !== null && typeof cause === 'object'; depth++) {
    if (isSqlError(cause)) {
      tags['db.error'] = cause.reason['_tag']
      break
    }
    cause = Cause.isCause(cause) ? Cause.squash(cause) : (cause as { cause?: unknown }).cause
  }
  return tags
}