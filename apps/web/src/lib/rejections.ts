import { captureException } from '@/lib/telemetry'
import { isStaleChunkError, reloadForNewBuild } from '@/setup/stale-build'

/** For promises that reject only on a bug. Handle an expected rejection where it happens instead. */
export function reportRejection(error: unknown) {
  if (isStaleChunkError(error) && reloadForNewBuild(error)) return
  captureException(error)
}

/** React drops the promise an event handler returns */
export const asyncHandler =
  <A extends unknown[]>(handler: (...args: A) => Promise<unknown>) =>
  (...args: A) => {
    handler(...args).catch(reportRejection)
  }