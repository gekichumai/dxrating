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