import { Data } from 'effect'

/** The save (or job) does not exist, is deleted, or belongs to another user: all look the same (404) */
export class CloudSaveNotFound extends Data.TaggedError('CloudSaveNotFound')<{}> {}

/** The user already has the maximum number of live saves */
export class CloudSaveLimitReached extends Data.TaggedError('CloudSaveLimitReached')<{ readonly limit: number }> {}

/** A job of the same source is already running on the save (§7.1) */
export class ImportInProgress extends Data.TaggedError('ImportInProgress')<{ readonly jobId: string }> {}

/** `replace` with a stale `ifRevision` */
export class RevisionPreconditionFailed extends Data.TaggedError('RevisionPreconditionFailed')<{
  readonly revision: number
}> {}

/** A request the contract accepts but the save cannot (e.g. a snapshot ahead of the save's revision) */
export class CloudSaveBadRequest extends Data.TaggedError('CloudSaveBadRequest')<{ readonly message: string }> {}

/** The save stayed locked by another writer longer than the lock timeout (§5.2); retryable (429) */
export class CloudSaveBusy extends Data.TaggedError('CloudSaveBusy')<{}> {}

/** Whether `error` (or one of its causes) is Postgres `lock_not_available` (55P03, e.g. `lock_timeout`) */
export function isLockNotAvailable(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 6 && typeof current === 'object' && current !== null; depth++) {
    if ((current as { code?: unknown }).code === '55P03') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}