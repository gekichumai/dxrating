import { captureException } from '@/lib/telemetry'
import { isStaleChunkError, reloadForNewBuild } from '@/setup/stale-build'

/**
 * Handles a rejection the way the page handles an unhandled one: a chunk that a deploy removed reloads the page, and
 * anything else is reported. Use it for promises that reject only on a bug; handle an expected rejection where it
 * happens instead.
 */
export function reportRejection(error: unknown) {
  if (isStaleChunkError(error) && reloadForNewBuild(error)) return
  captureException(error)
}

/** Wraps an async event handler: React drops the promise a handler returns, so its rejection goes to reportRejection */
export const asyncHandler =
  <A extends unknown[]>(handler: (...args: A) => Promise<unknown>) =>
  (...args: A) => {
    handler(...args).catch(reportRejection)
  }